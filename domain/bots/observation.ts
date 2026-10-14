import type { Match } from "../match/model";
import { RuleError } from "../match/model";
import type { Observation } from "./interpreter";
// Only revealed encounters between this seat and its current opponent contribute
// strategy history. In particular, collecting-phase accepted moves are never read.
export function visualObservation(m: Match, seatId: string): Observation {
  const seat = m.seats.find((s) => s.id === seatId),
    pair = m.pairs.find((p) => p.a === seatId || p.b === seatId);
  if (!seat || !pair || m.phase !== "collecting")
    throw new RuleError("WRONG_PHASE");
  const opponentId = pair.a === seatId ? pair.b : pair.a,
    opponent = m.seats.find((s) => s.id === opponentId)!;
  const history = m.results
    .filter(
      (r) =>
        r.round < m.round &&
        ((r.a === seatId && r.b === opponentId) ||
          (r.b === seatId && r.a === opponentId)),
    )
    .sort((a, b) => a.round - b.round);
  const own = history.map((r) => (r.a === seatId ? r.aMove : r.bMove)),
    other = history.map((r) => (r.a === opponentId ? r.aMove : r.bMove));
  return {
    round: m.round,
    ownScore: seat.score,
    opponentScore: opponent.score,
    lastOpponentMove: other.at(-1) ?? null,
    ownCooperations: own.filter((x) => x === "C").length,
    ownBetrayals: own.filter((x) => x === "D").length,
    opponentCooperations: other.filter((x) => x === "C").length,
    opponentBetrayals: other.filter((x) => x === "D").length,
  };
}
