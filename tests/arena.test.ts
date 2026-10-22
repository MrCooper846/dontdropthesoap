import { describe, it, expect } from "vitest";
import { Store } from "../scripts/arena/store";
import { actionSchema } from "../scripts/arena/player";
import { verifyMatch } from "../scripts/arena/scenarios";
describe("arena boundaries", () => {
  it("rejects production and other local database targets", () => {
    for (const url of [
      "postgresql://soap:pw@example.com:55435/soap_arena",
      "postgresql://soap:pw@127.0.0.1:55432/soap_arena",
      "postgresql://soap:pw@127.0.0.1:55435/soap_playtest",
    ])
      expect(() => new Store(url)).toThrow(/isolated local/);
  });
  it("keeps agent navigation inside game pages and rejects raw execution", () => {
    for (const action of [
      { op: "goto", path: "https://example.com" },
      { op: "goto", path: "//example.com" },
      { op: "goto", path: "/api/v1/commands" },
      { op: "evaluate", script: "fetch('/admin')" },
      { op: "walk", x: -1, y: 450 },
    ])
      expect(actionSchema.safeParse(action).success).toBe(false);
    expect(
      actionSchema.safeParse({ op: "goto", path: "/bots/build?bot=123-456" })
        .success,
    ).toBe(true);
  });
});
function fixture() {
  const seats = [
    {
      id: "a",
      kind: "visual",
      score: -10,
      timeouts: 0,
      abandoned: false,
      botVersionId: "old-a",
    },
    {
      id: "b",
      kind: "visual",
      score: 15,
      timeouts: 0,
      abandoned: false,
      botVersionId: "old-b",
    },
  ];
  const view = {
    phase: "finished",
    round: 5,
    seats,
    results: Array.from({ length: 5 }, (_, i) => ({ round: i + 1 })),
  };
  const views = [
    { ...view, ownSeatId: "a" },
    { ...structuredClone(view), ownSeatId: "b" },
  ];
  const store = {
    db: {
      query: async (sql: string) =>
        sql.includes("round_results")
          ? { rows: [{ n: 5 }] }
          : { rows: [{ phase: "finished", state_json: { seats } }] },
    },
    event: async () => {},
  } as unknown as Store;
  const players = views.map((view) => ({ get: async () => view }));
  return { store, players, views };
}
describe("arena match verifier", () => {
  it("accepts matching player and persisted results", async () => {
    const { store, players } = fixture();
    await expect(
      verifyMatch(
        store,
        "run",
        players as any,
        "match",
        [-10, 15],
        ["old-a", "old-b"],
      ),
    ).resolves.toBeUndefined();
  });
  it("detects divergent player views", async () => {
    const { store, players, views } = fixture();
    views[1].seats[0].score = 99;
    await expect(
      verifyMatch(
        store,
        "run",
        players as any,
        "match",
        [-10, 15],
        ["old-a", "old-b"],
      ),
    ).rejects.toThrow(/agree/);
  });
  it("detects revision drift even when both views agree", async () => {
    const { store, players } = fixture();
    await expect(
      verifyMatch(
        store,
        "run",
        players as any,
        "match",
        [-10, 15],
        ["new-a", "old-b"],
      ),
    ).rejects.toThrow(/pinned/);
  });
  it("detects wrong scores and duplicate persisted results", async () => {
    const { store, players } = fixture();
    await expect(
      verifyMatch(
        store,
        "run",
        players as any,
        "match",
        [-9, 15],
        ["old-a", "old-b"],
      ),
    ).rejects.toThrow(/expected score/);
    store.db.query = (async (sql: string) =>
      sql.includes("round_results")
        ? { rows: [{ n: 6 }] }
        : {
            rows: [
              {
                phase: "finished",
                state_json: { seats: (await players[0].get()).seats },
              },
            ],
          }) as any;
    await expect(
      verifyMatch(
        store,
        "run",
        players as any,
        "match",
        [-10, 15],
        ["old-a", "old-b"],
      ),
    ).rejects.toThrow(/exactly once/);
  });
});
