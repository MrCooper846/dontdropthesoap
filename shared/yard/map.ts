export type Point = { x: number; y: number };
export type Rectangle = Point & { width: number; height: number };
export const TILE = 32,
  AVATAR_RADIUS = 10,
  MOVE_SPEED = 96,
  TICK_MS = 50,
  INPUT_TIMEOUT_MS = 250;
export const YARD_MAP = {
  version: 1,
  width: 960,
  height: 640,
  spawn: { x: 480, y: 560 },
  bounds: { left: 48, top: 48, right: 912, bottom: 592 },
  obstacles: [
    { x: 420, y: 260, width: 120, height: 100 },
    { x: 100, y: 320, width: 100, height: 24 },
    { x: 760, y: 320, width: 100, height: 24 },
  ] as Rectangle[],
  circles: [
    {
      id: "yard-circle-1",
      name: "Trust Issues",
      x: 240,
      y: 190,
      radius: 64,
      mode: "human" as const,
    },
    {
      id: "yard-circle-2",
      name: "Machine Therapy",
      x: 720,
      y: 190,
      radius: 64,
      mode: "mixed" as const,
    },
    {
      id: "yard-circle-3",
      name: "Noodle Exchange",
      x: 240,
      y: 450,
      radius: 64,
      mode: "mixed" as const,
    },
    {
      id: "yard-circle-4",
      name: "Snake Pit",
      x: 720,
      y: 450,
      radius: 64,
      mode: "mixed" as const,
    },
  ],
};
export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function allowedPoint(p: Point) {
  const b = YARD_MAP.bounds;
  if (
    p.x - AVATAR_RADIUS < b.left ||
    p.x + AVATAR_RADIUS > b.right ||
    p.y - AVATAR_RADIUS < b.top ||
    p.y + AVATAR_RADIUS > b.bottom
  )
    return false;
  return !YARD_MAP.obstacles.some(
    (r) =>
      p.x + AVATAR_RADIUS > r.x &&
      p.x - AVATAR_RADIUS < r.x + r.width &&
      p.y + AVATAR_RADIUS > r.y &&
      p.y - AVATAR_RADIUS < r.y + r.height,
  );
}
export function movePoint(
  p: Point,
  axisX: number,
  axisY: number,
  dtMs: number,
): Point {
  const scale = Math.max(1, Math.hypot(axisX, axisY)),
    step = (MOVE_SPEED * Math.max(0, Math.min(dtMs, TICK_MS))) / 1000;
  let next = { ...p };
  const horizontal = { x: p.x + (axisX / scale) * step, y: p.y };
  if (allowedPoint(horizontal)) next = horizontal;
  const vertical = { x: next.x, y: next.y + (axisY / scale) * step };
  if (allowedPoint(vertical)) next = vertical;
  return next;
}
