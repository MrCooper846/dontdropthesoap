import { describe, it, expect, vi, afterEach } from "vitest";
import {
  makeLobby,
  makePlayer,
  startRound,
  revealRound,
  autoCooperateMissingMoves,
  allMovesSubmitted,
  resetLobbyForReplay,
  buildAwards,
} from "../lib/game";
function lobby(count = 2) {
  const l = makeLobby("TEST", makePlayer("p0", "s0", "Host", true), 3, 12);
  for (let i = 1; i < count; i++)
    l.players.push(makePlayer("p" + i, "s" + i, "Player " + i, false));
  return l;
}
afterEach(() => vi.restoreAllMocks());
describe("legacy baseline", () => {
  it.each([
    ["C", "C", 1, 1],
    ["C", "D", -2, 3],
    ["D", "C", 3, -2],
    ["D", "D", -1, -1],
  ] as const)("scores %s/%s with the ante", (a, b, da, db) => {
    const l = lobby();
    startRound(l);
    l.pairings[0].moves = { p0: a, p1: b };
    revealRound(l);
    expect(l.players.map((p) => p.score)).toEqual([50 + da, 50 + db]);
    expect(l.resultsHistory).toHaveLength(1);
    revealRound(l);
    expect(l.resultsHistory).toHaveLength(1);
  });
  it.each([2, 3, 4, 5, 8, 12])(
    "pairs each connected player once with %i players",
    (count) => {
      const l = lobby(count);
      startRound(l);
      const seats = l.pairings.flatMap((p) => [p.aPlayerId, p.bPlayerId]);
      expect(new Set(seats).size).toBe(seats.length);
      expect(seats.filter((id) => id !== "BOT").sort()).toEqual(
        l.players.map((p) => p.playerId).sort(),
      );
      expect(seats.includes("BOT")).toBe(count % 2 === 1);
    },
  );
  it("excludes disconnected players from legacy pairing", () => {
    const l = lobby(3);
    l.players[2].connected = false;
    startRound(l);
    expect(l.pairings).toHaveLength(1);
    expect(l.pairings[0].bPlayerId).not.toBe("BOT");
  });
  it("Clanker carries betrayal memory between different humans", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const l = lobby(3);
    startRound(l);
    const first = l.pairings.find((p) => p.bPlayerId === "BOT")!;
    first.moves[first.aPlayerId] = "D";
    autoCooperateMissingMoves(l);
    revealRound(l);
    expect(l.resultsHistory.find((r) => r.bPlayerId === "BOT")!.bMove).toBe(
      "C",
    );
    expect(l.botState.lastHumanMoveAgainstBot).toBe("D");
    startRound(l);
    autoCooperateMissingMoves(l);
    revealRound(l);
    expect(l.resultsHistory.filter((r) => r.bPlayerId === "BOT")[1].bMove).toBe(
      "D",
    );
    expect(l.botState.lastHumanMoveAgainstBot).toBe("C");
  });
  it("timeouts preserve submitted moves and complete a three-round game", () => {
    const l = lobby();
    for (let r = 0; r < 3; r++) {
      startRound(l);
      l.pairings[0].moves.p0 = "D";
      expect(allMovesSubmitted(l)).toBe(false);
      autoCooperateMissingMoves(l);
      expect(l.pairings[0].moves.p0).toBe("D");
      expect(allMovesSubmitted(l)).toBe(true);
      revealRound(l);
    }
    expect(l.status).toBe("finished");
    expect(l.players.map((p) => p.score)).toEqual([59, 44]);
    expect(buildAwards(l)[0].playerName).toBe("Host");
    resetLobbyForReplay(l);
    expect(l.status).toBe("waiting");
    expect(l.resultsHistory).toEqual([]);
    expect(l.players[0].gameStartScore).toBe(59);
    expect(l.players[0].stats.defections).toBe(0);
  });
});
