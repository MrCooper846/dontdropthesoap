import { it, expect } from "vitest";
import { createMatch, makeSeat, addSeat } from "../domain/match/engine";
import { visualObservation } from "../domain/bots/observation";
function fixture() {
  const m = createMatch(
    "m",
    "oa",
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 4 },
    0,
    123,
  );
  for (const id of ["a", "b", "c", "d"]) addSeat(m, makeSeat(id, "o" + id, id));
  m.phase = "collecting";
  m.round = 2;
  m.deadline = 5000;
  m.pairs = [
    { id: "p", a: "a", b: "b" },
    { id: "q", a: "c", b: "d" },
  ];
  m.results = [
    {
      pairId: "old",
      round: 1,
      a: "a",
      b: "b",
      aMove: "C",
      bMove: "C",
      aNet: 1,
      bNet: 1,
      message: "revealed",
    },
    {
      pairId: "other",
      round: 1,
      a: "c",
      b: "d",
      aMove: "D",
      bMove: "C",
      aNet: 3,
      bNet: -2,
      message: "revealed",
    },
  ];
  return m;
}
it("visual facts never read current hidden decisions or private pairing RNG", () => {
  const m = fixture(),
    before = visualObservation(m, "a");
  m.moves.b = { move: "D", source: "player", acceptedAt: 100 };
  m.rngState = 987654321;
  expect(visualObservation(m, "a")).toEqual(before);
  expect(before).toMatchObject({
    lastOpponentMove: "C",
    ownCooperations: 1,
    opponentCooperations: 1,
    opponentBetrayals: 0,
  });
  expect(Object.keys(before)).toHaveLength(8);
});
it("a new opponent starts fresh encounter facts despite their public moves against someone else", () => {
  const m = fixture();
  m.pairs = [
    { id: "p", a: "a", b: "c" },
    { id: "q", a: "b", b: "d" },
  ];
  expect(visualObservation(m, "a")).toMatchObject({
    lastOpponentMove: null,
    opponentCooperations: 0,
    opponentBetrayals: 0,
    ownCooperations: 0,
    ownBetrayals: 0,
  });
});
