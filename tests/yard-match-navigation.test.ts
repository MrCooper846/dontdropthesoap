import { describe, it, expect } from "vitest";
import {
  preferredOwnedMatch,
  matchSettingsError,
  type OwnedMatch,
} from "../shared/yard/matches";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  submit,
  project,
} from "../domain/match/engine";
function owned(
  id: string,
  kind: OwnedMatch["kind"],
  phase: OwnedMatch["phase"],
): OwnedMatch {
  return {
    id,
    kind,
    phase,
    circleId: null,
    round: 0,
    seatId: id,
    name: id,
    score: 0,
    abandoned: false,
    createdAt: "2026-10-22",
  };
}
describe("owned match navigation", () => {
  it("prioritises a live human decision over a watched bot or old result", () => {
    const bot = owned("bot", "visual", "collecting"),
      human = owned("human", "human", "collecting");
    expect(preferredOwnedMatch([bot, human], "bot")?.id).toBe("human");
    expect(
      preferredOwnedMatch([owned("old", "human", "finished"), bot], "old")?.id,
    ).toBe("bot");
  });
  it("keeps a selected active bot and restores the newest completed game", () => {
    const a = owned("a", "visual", "collecting"),
      b = owned("b", "visual", "waiting");
    expect(preferredOwnedMatch([a, b], "b")?.id).toBe("b");
    expect(
      preferredOwnedMatch(
        [
          owned("new", "visual", "finished"),
          owned("old", "visual", "finished"),
        ],
        "old",
      )?.id,
    ).toBe("new");
  });
  it("rejects invalid field boundaries and fractional settings with actionable messages", () => {
    expect(matchSettingsError(3, 20, 3)).toContain(
      "Rounds must be a whole number from 5 to 50",
    );
    expect(matchSettingsError(5, 4, 2)).toContain("Decision seconds");
    expect(matchSettingsError(5, 5, 2.5)).toContain("Seats");
    expect(matchSettingsError(5, 5, 2)).toBe("");
  });
});
it("reveals timeout sources only after resolution, while keeping another player's locked choice private", () => {
  const m = createMatch(
    "m",
    "a",
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 3 },
    0,
    17,
  );
  addSeat(m, makeSeat("a-seat", "a", "Ada"));
  addSeat(m, makeSeat("b-seat", "b", "Bert"));
  ready(m, "a-seat", true);
  ready(m, "b-seat", true);
  requestStart(m, 0);
  advance(m, 3000);
  submit(m, "a-seat", 1, "D", 3001);
  expect(project(m, "a").ownMoveSource).toBe("player");
  expect(project(m, "b").ownMoveSource).toBeNull();
  expect(project(m, null).ownMoveSource).toBeNull();
  expect(project(m, null).results).toEqual([]);
  advance(m, 8000);
  const revealed = project(m, null);
  expect(revealed.results[0].aSource).toBeDefined();
  const timeout = revealed.results[0];
  expect(timeout.a === "b-seat" ? timeout.aSource : timeout.bSource).toBe(
    "timeout",
  );
  expect(project(m, "b").seats.find((s) => s.id === "b-seat")?.timeouts).toBe(
    1,
  );
});
