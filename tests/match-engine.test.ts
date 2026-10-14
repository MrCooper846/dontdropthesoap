import { describe, it, expect } from "vitest";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  submit,
  advance,
  leave,
  recover,
  project,
  payoff,
} from "../domain/match/engine";
function game(count = 2) {
  const m = createMatch(
    "match",
    "owner0",
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    0,
    17,
  );
  for (let i = 0; i < count; i++)
    addSeat(m, makeSeat("s" + i, "owner" + i, "P" + i));
  for (const s of m.seats) ready(m, s.id, true);
  requestStart(m, 0);
  advance(m, 3000);
  return m;
}
describe("authoritative match rules", () => {
  it.each([
    ["C", "C", 1, 1],
    ["C", "D", -2, 3],
    ["D", "C", 3, -2],
    ["D", "D", -1, -1],
  ] as const)("canonical net matrix %s/%s", (a, b, x, y) =>
    expect(payoff(a, b)).toEqual([x, y]),
  );
  it("first move is irrevocable and exact round is required", () => {
    const m = game();
    submit(m, "s0", 1, "D", 3001);
    expect(() => submit(m, "s0", 1, "C", 3002)).toThrow("MOVE_LOCKED");
    expect(() => submit(m, "s1", 0, "C", 3002)).toThrow("ROUND_MISMATCH");
    expect(m.moves.s0.move).toBe("D");
  });
  it("only the controlling seat receives its hidden move", () => {
    const m = game();
    submit(m, "s0", 1, "D", 3001);
    const spectator = project(m, null);
    expect(spectator).not.toHaveProperty("moves");
    expect(spectator).not.toHaveProperty("revealedMoves");
    expect(spectator.ownMove).toBeNull();
    expect(project(m, "owner1").ownMove).toBeNull();
    expect(project(m, "owner0").ownMove).toBe("D");
    expect(JSON.stringify(spectator)).not.toContain("rngState");
    expect(spectator.results).toEqual([]);
  });
  it("deadline equality rejects a move and timeout is C", () => {
    const m = game();
    submit(m, "s0", 1, "D", 7999);
    expect(() => submit(m, "s1", 1, "D", 8000)).toThrow("DEADLINE_PASSED");
    advance(m, 8000);
    expect(m.phase).toBe("revealing");
    expect(m.moves.s1.source).toBe("timeout");
    expect(m.seats.map((s) => s.score)).toEqual([3, -2]);
    const before = JSON.stringify(m);
    advance(m, 8000);
    expect(JSON.stringify(m)).toBe(before);
  });
  it("active leave retains accepted moves and frozen roster", () => {
    const m = game();
    submit(m, "s0", 1, "D", 3001);
    leave(m, "s0");
    expect(m.seats).toHaveLength(2);
    expect(m.moves.s0.move).toBe("D");
    submit(m, "s1", 1, "C", 3002);
    expect(m.seats[0].score).toBe(3);
    advance(m, 4002);
    expect(() => submit(m, "s0", 2, "D", 4003)).toThrow("FORBIDDEN");
    advance(m, 9002);
    expect(m.moves.s0.source).toBe("timeout");
  });
  it("Clanker is a real system seat and remembers its last opponent", () => {
    const m = game(3);
    const system = m.seats.find((s) => s.kind === "system")!;
    expect(system.ownerId).toBeNull();
    expect(m.moves[system.id].move).toBe("C");
    for (const s of m.seats.filter((s) => s.kind !== "system"))
      submit(m, s.id, 1, "D", 3001);
    expect(m.clankerMemory).toBe("D");
    advance(m, 4001);
    expect(m.moves[system.id].move).toBe("D");
  });
  it("no results reveal until all pairings have resolved together", () => {
    const m = game(4);
    const p = m.pairs[0];
    submit(m, p.a, 1, "C", 3001);
    submit(m, p.b, 1, "D", 3002);
    expect(m.phase).toBe("collecting");
    expect(m.results).toEqual([]);
    advance(m, 8000);
    expect(m.results).toHaveLength(2);
  });
  it("a single restart preserves accepted moves and a second aborts", () => {
    const m = game();
    submit(m, "s0", 1, "D", 3001);
    recover(m, 50000);
    expect(m.moves.s0.move).toBe("D");
    expect(m.deadline).toBe(55000);
    recover(m, 60000);
    expect(m.phase).toBe("aborted");
    expect(m.deadline).toBeNull();
    expect(project(m, null)).not.toHaveProperty("revealedMoves");
    expect(project(m, "owner1")).not.toHaveProperty("revealedMoves");
    expect(project(m, "owner0").ownMove).toBe("D");
    expect(project(m, null).results).toEqual([]);
  });
  it("aborting during reveal preserves only decisions already resolved", () => {
    const m = game();
    submit(m, "s0", 1, "D", 3001);
    submit(m, "s1", 1, "C", 3002);
    recover(m, 50000);
    recover(m, 60000);
    expect(m.phase).toBe("aborted");
    expect(project(m, null).revealedMoves).toEqual({ s0: "D", s1: "C" });
    expect(project(m, null).results).toHaveLength(1);
  });
  it("countdown departures cancel and clear readiness", () => {
    const m = game();
    m.phase = "countdown";
    leave(m, "s0");
    expect(m.phase).toBe("waiting");
    expect(m.seats[0].ready).toBe(false);
  });
  it("terminal games never become waiting and retain final results", () => {
    const m = game();
    for (let i = 0; i < 5; i++) {
      const deadline = m.deadline!;
      advance(m, deadline);
      advance(m, m.deadline!);
    }
    expect(m.phase).toBe("finished");
    expect(m.results).toHaveLength(5);
    expect(recover(m, 999999)).toBe(false);
    expect(() => requestStart(m, 999999)).toThrow("WRONG_PHASE");
  });
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "freezes and pairs each seat once (%i entrants)",
    (n) => {
      const m = game(n);
      const ids = m.pairs.flatMap((p) => [p.a, p.b]);
      expect(ids.length).toBe(m.seats.length);
      expect(new Set(ids).size).toBe(ids.length);
      expect(() => addSeat(m, makeSeat("late", "late", "Late"))).toThrow(
        "WRONG_PHASE",
      );
    },
  );
});
