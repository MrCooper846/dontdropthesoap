import { it, expect } from "vitest";
import { audience } from "../domain/voice/audience";
import type { YardView } from "../shared/yard/types";
import { createMatch, makeSeat, addSeat } from "../domain/match/engine";
const view = (): YardView =>
  ({
    epoch: "e",
    tick: 0,
    serverTime: 0,
    mapVersion: 1,
    circles: [],
    players: [
      {
        ownerId: "a",
        name: "A",
        x: 0,
        y: 0,
        seated: false,
        connected: true,
        processedSeq: 0,
      },
      {
        ownerId: "b",
        name: "B",
        x: 96,
        y: 0,
        seated: false,
        connected: true,
        processedSeq: 0,
      },
      {
        ownerId: "c",
        name: "C",
        x: 257,
        y: 0,
        seated: false,
        connected: true,
        processedSeq: 0,
      },
    ],
  }) satisfies YardView;
it("uses authoritative distance, excludes disconnected/distant/blocked owners, and never extends range", () => {
  const v = view();
  expect(audience(v, [], "a", () => false)).toEqual([
    { ownerId: "b", gain: 1, sameTable: false },
  ]);
  v.players[1].x = 160;
  expect(audience(v, [], "a", () => false)[0].gain).toBeCloseTo(0.6);
  v.players[1].x = 256;
  expect(audience(v, [], "a", () => false)[0].gain).toBe(0);
  v.players[1].x = 256.1;
  expect(audience(v, [], "a", () => false)).toEqual([]);
  v.players[1].x = 32;
  expect(audience(v, [], "a", (a, b) => a === "a" && b === "b")).toEqual([]);
  v.players[1].connected = false;
  expect(audience(v, [], "a", () => false)).toEqual([]);
});
it("seated humans can suppress spectators without suppressing spectators hearing the table", () => {
  const v = view();
  v.players[2].x = 100;
  const m = createMatch(
    "m",
    "a",
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    0,
    1,
  );
  addSeat(m, makeSeat("sa", "a", "A"));
  addSeat(m, makeSeat("sb", "b", "B"));
  expect(
    audience(v, [m], "a", () => false, true).map((p) => p.ownerId),
  ).toEqual(["b"]);
  expect(audience(v, [m], "c", () => false).map((p) => p.ownerId)).toEqual([
    "a",
    "b",
  ]);
  expect(audience(v, [m], "a", (a, b) => a === "a" && b === "b", true)).toEqual(
    [],
  );
});
it("a bot seat does not give its roaming owner a remote acoustic position", () => {
  const v = view();
  const m = createMatch(
    "m",
    "a",
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    0,
    1,
  );
  addSeat(m, makeSeat("sa", "a", "A"));
  addSeat(m, makeSeat("sb", "c", "Bot", "external", "bot", "version"));
  expect(audience(v, [m], "a", () => false).map((p) => p.ownerId)).toEqual([
    "b",
  ]);
  expect(audience(v, [m], "c", () => false).some((p) => p.sameTable)).toBe(
    false,
  );
});
