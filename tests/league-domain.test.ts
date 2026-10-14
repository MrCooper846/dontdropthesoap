import { it, expect } from "vitest";
import { schedule, standings } from "../domain/league/league";
const entries = Array.from({ length: 16 }, (_, i) => ({
  id: "e" + String(i).padStart(2, "0"),
  ownerId: "o" + i,
  botId: "b" + i,
  name: "Bot " + i,
}));
it("4–16 entry schedules cover each unordered pair exactly once and alternate A/B labels", () => {
  for (let n = 4; n <= 16; n++) {
    const roster = entries.slice(0, n),
      a = schedule(roster, 1),
      b = schedule([...roster].reverse(), 2);
    expect(a).toHaveLength((n * (n - 1)) / 2);
    expect(new Set(a.map((p) => [p.a, p.b].sort().join(":"))).size).toBe(
      a.length,
    );
    for (const e of roster)
      expect(a.filter((p) => p.a === e.id || p.b === e.id)).toHaveLength(n - 1);
    expect(b).toEqual(a.map((p) => ({ ...p, a: p.b, b: p.a })));
  }
});
it("rejects owner/bot duplication and invalid batch sizes", () => {
  expect(() => schedule(entries.slice(0, 3), 1)).toThrow();
  expect(() => schedule([...entries, entries[0]], 1)).toThrow();
  expect(() =>
    schedule(
      entries
        .slice(0, 4)
        .map((e, i) => ({ ...e, ownerId: i ? "same" : "first" })),
      1,
    ),
  ).toThrow();
  expect(() =>
    schedule(
      entries.slice(0, 4).map((e) => ({ ...e, botId: "one" })),
      1,
    ),
  ).toThrow();
});
it("standings use points then mutual cooperation and preserve shared ranks without lifetime credit", () => {
  const result = standings(entries.slice(0, 4), [
    {
      fixtureId: "f1",
      a: "e00",
      b: "e01",
      aPoints: 20,
      bPoints: 20,
      mutualCooperations: 20,
    },
    {
      fixtureId: "f2",
      a: "e02",
      b: "e03",
      aPoints: 20,
      bPoints: -40,
      mutualCooperations: 0,
    },
  ]);
  expect(
    result.map((r) => [r.id, r.rank, r.points, r.mutualCooperations]),
  ).toEqual([
    ["e00", 1, 20, 20],
    ["e01", 1, 20, 20],
    ["e02", 3, 20, 0],
    ["e03", 4, -40, 0],
  ]);
  expect(() =>
    standings(entries.slice(0, 4), [
      {
        fixtureId: "f",
        a: "e00",
        b: "e01",
        aPoints: 1,
        bPoints: 1,
        mutualCooperations: 1,
      },
      {
        fixtureId: "f",
        a: "e00",
        b: "e01",
        aPoints: 1,
        bPoints: 1,
        mutualCooperations: 1,
      },
    ]),
  ).toThrow();
});

it("alternates the same bot pairs even when a new batch has new registration IDs", () => {
  const previous = entries.slice(0, 4);
  const renewed = previous.map((e, i) => ({ ...e, id: "new" + (10 - i) }));
  const first = schedule(previous, 1).map((p) => [
    previous.find((e) => e.id === p.a)!.botId,
    previous.find((e) => e.id === p.b)!.botId,
  ]);
  const second = schedule(renewed, 2).map((p) => [
    renewed.find((e) => e.id === p.a)!.botId,
    renewed.find((e) => e.id === p.b)!.botId,
  ]);
  expect(second).toEqual(first.map(([a, b]) => [b, a]));
});
