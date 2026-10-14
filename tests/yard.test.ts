import { it, expect } from "vitest";
import { Yard, inputSchema } from "../domain/yard/yard";
import {
  movePoint,
  MOVE_SPEED,
  TICK_MS,
  YARD_MAP,
  allowedPoint,
} from "../shared/yard/map";
it("normalizes diagonals and bounds elapsed-time movement", () => {
  const p = { x: 300, y: 300 },
    straight = movePoint(p, 1, 0, TICK_MS),
    diagonal = movePoint(p, 1, 1, TICK_MS);
  expect(Math.hypot(diagonal.x - p.x, diagonal.y - p.y)).toBeCloseTo(
    straight.x - p.x,
    8,
  );
  expect(movePoint(p, 1, 0, 999999)).toEqual(straight);
  expect(straight.x - p.x).toBeCloseTo((MOVE_SPEED * TICK_MS) / 1000);
});
it("blocks walls and obstacles while allowing axis sliding", () => {
  expect(movePoint({ x: 902, y: 500 }, 1, 0, 50).x).toBe(902);
  const p = { x: 410, y: 300 },
    next = movePoint(p, 1, 1, 50);
  expect(next.x).toBe(410);
  expect(next.y).toBeGreaterThan(300);
  expect(allowedPoint(next)).toBe(true);
});
it("rejects teleport payloads, out-of-range axes and unreasonable sequences", () => {
  expect(() =>
    inputSchema.parse({ seq: 1, axisX: 0, axisY: 0, x: 720, y: 190 }),
  ).toThrow();
  expect(() => inputSchema.parse({ seq: 1, axisX: 100, axisY: 0 })).toThrow();
  const y = new Yard();
  y.enter("a", "A", "s", 1, 0);
  expect(() =>
    y.input("a", "s", 1, { seq: 9999, axisX: 1, axisY: 0 }, 1),
  ).toThrow("Input sequence jump");
});
it("fences sockets/controllers and ignores delayed or duplicate inputs", () => {
  const y = new Yard();
  y.enter("a", "A", "old", 1, 0);
  y.input("a", "old", 1, { seq: 1, axisX: 1, axisY: 0 }, 0);
  expect(y.input("a", "old", 1, { seq: 0, axisX: -1, axisY: 0 }, 1)).toBe(
    false,
  );
  y.enter("a", "A", "new", 2, 10);
  expect(() =>
    y.input("a", "old", 1, { seq: 2, axisX: 1, axisY: 0 }, 20),
  ).toThrow("CONTROLLER_STALE");
  y.leave("a", "old");
  expect(y.has("a")).toBe(true);
});
it("stops stale movement after 250 ms and keeps anchored humans seated", () => {
  const y = new Yard();
  y.enter("a", "A", "s", 1, 0);
  y.input("a", "s", 1, { seq: 0, axisX: 1, axisY: 0 }, 0);
  const first = y.step(50).players[0];
  expect(first.x).toBeGreaterThan(YARD_MAP.spawn.x);
  expect(y.step(250).players[0].x).toBe(first.x);
  y.anchor("a", { x: 240, y: 190 });
  y.input("a", "s", 1, { seq: 1, axisX: 1, axisY: 0 }, 300);
  expect(y.step(350).players[0]).toMatchObject({
    x: 240,
    y: 190,
    seated: true,
  });
});
it("enforces capacity and checks circle distance from server position", () => {
  const y = new Yard(1);
  y.enter("a", "A", "s", 1, 0);
  expect(() => y.enter("b", "B", "t", 1, 0)).toThrow("CAPACITY_FULL");
  expect(() => y.circle("a", "yard-circle-1")).toThrow("Move nearer");
  y.anchor("a", { x: 240, y: 190 });
  y.step(1);
  expect(y.circle("a", "yard-circle-1").name).toBe("Trust Issues");
});
it("nearby recipient routing enforces distance and symmetric blocks", () => {
  const y = new Yard();
  y.enter("a", "A", "a", 1, 0);
  y.enter("b", "B", "b", 1, 0);
  y.enter("c", "C", "c", 1, 0);
  y.anchor("c", { x: 100, y: 100 });
  y.step(1);
  expect(y.recipients("a", () => false)).toEqual(["a", "b"]);
  expect(
    y.recipients(
      "a",
      (a, b) => (a === "a" && b === "b") || (a === "b" && b === "a"),
    ),
  ).toEqual(["a"]);
});
it("projects only public presence and acknowledgement fields", () => {
  const y = new Yard();
  y.enter("a", "A", "private-socket", 42, 0);
  const snapshot = y.snapshot();
  expect(JSON.stringify(snapshot)).not.toContain("private-socket");
  expect(snapshot.players[0]).not.toHaveProperty("controllerEpoch");
  expect(snapshot.players[0]).not.toHaveProperty("input");
});

it("never downgrades a controller from an older metadata refresh and excludes disconnected recipients", () => {
  const y = new Yard();
  y.enter("a", "A", "a", 3, 0);
  y.enter("b", "B", "b", 1, 0);
  y.setController("a", 2);
  expect(() => y.input("a", "a", 2, { seq: 0, axisX: 1, axisY: 0 }, 1)).toThrow(
    "CONTROLLER_STALE",
  );
  expect(y.input("a", "a", 3, { seq: 0, axisX: 1, axisY: 0 }, 1)).toBe(true);
  y.disconnect("b", "b", 2);
  expect(y.recipients("a", () => false)).toEqual(["a"]);
  y.enter("b", "B", "new", 2, 10);
  expect(y.active("b")).toBe(true);
  y.disconnect("b", "new", 10);
  y.prune(30011);
  expect(y.has("b")).toBe(false);
});
