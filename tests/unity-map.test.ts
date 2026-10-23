import { describe, it, expect } from "vitest";
import {
  UNITY_MAP,
  blocked,
  movePoint,
  zoneAt,
  nearStation,
} from "../shared/unity-restaurant/map";
describe("Unity authoritative spatial map", () => {
  it("starts eight players outside walls and counters", () => {
    expect(new Set(UNITY_MAP.spawns.map((p) => `${p.x},${p.z}`)).size).toBe(8);
    for (const p of UNITY_MAP.spawns) expect(blocked(p)).toBe(false);
  });
  it("bounds movement using server time and normalized input", () => {
    const p = { x: 1, z: -3 };
    expect(
      Math.hypot(
        movePoint(p, 100, 100, 0.1).x - p.x,
        movePoint(p, 100, 100, 0.1).z - p.z,
      ),
    ).toBeCloseTo(0.37);
    expect(movePoint(p, 1, 0, 999)).toEqual(movePoint(p, 1, 0, 0.1));
    expect(movePoint(p, Number.NaN, 0, 0.1)).toEqual(p);
    expect(movePoint(p, 1, 0, -1)).toEqual(p);
  });
  it("blocks an exterior wall even under repeated movement", () => {
    let p = { x: 10, z: 3 };
    for (let i = 0; i < 1000; i++) p = movePoint(p, 1, 0, 0.1);
    expect(p.x).toBeLessThanOrEqual(12.3);
    expect(blocked(p)).toBe(false);
  });
  it("allows the kitchen door but blocks the adjoining wall", () => {
    let open = { x: -1, z: -1.8 };
    let wall = { x: -1, z: 2 };
    for (let i = 0; i < 20; i++) {
      open = movePoint(open, -1, 0, 0.1);
      wall = movePoint(wall, -1, 0, 0.1);
    }
    expect(open.x).toBeLessThan(-5);
    expect(wall.x).toBeGreaterThan(-2);
  });
  it("makes each station reachable from the lobby using collision-constrained input", () => {
    // Flood the actual expanded obstacles, then check a reachable interaction point.
    const grid = 0.2,
      start = { x: 0, z: -3 };
    const key = (p: { x: number; z: number }) =>
      `${Math.round(p.x / grid)},${Math.round(p.z / grid)}`;
    const queue = [start],
      seen = new Set([key(start)]);
    for (let i = 0; i < queue.length; i++)
      for (const [dx, dz] of [
        [grid, 0],
        [-grid, 0],
        [0, grid],
        [0, -grid],
      ]) {
        const p = {
          x: Math.round((queue[i].x + dx) * 10) / 10,
          z: Math.round((queue[i].z + dz) * 10) / 10,
        };
        if (!seen.has(key(p)) && !blocked(p)) {
          seen.add(key(p));
          queue.push(p);
        }
      }
    for (const s of UNITY_MAP.stations)
      expect(
        queue.some(
          (p) =>
            Math.hypot(p.x - s.x, p.z - s.z) < s.radius - 0.1 &&
            zoneAt(p) === s.zone,
        ),
        s.id,
      ).toBe(true);
  });
  it("derives rooms and interaction range from geometry", () => {
    expect(zoneAt({ x: -7, z: 1 })).toBe("kitchen");
    expect(zoneAt({ x: 3, z: 9 })).toBe("office");
    expect(zoneAt({ x: 0, z: 6 })).toBe("dining");
    expect(nearStation({ x: 1, z: -3 }, "cook")).toBe(false);
    expect(nearStation({ x: -7.5, z: 1 }, "cook")).toBe(true);
    expect(nearStation({ x: 4.5, z: -1 }, "serve", 1)).toBe(true);
    expect(nearStation({ x: 4.5, z: -1 }, "serve", 2)).toBe(false);
    // Inside the hatch radius across the kitchen wall is not a dining pickup.
    expect(nearStation({ x: -6, z: -3.5 }, "pickup")).toBe(false);
    expect(nearStation({ x: -6, z: -6.8 }, "pickup")).toBe(true);
  });
});
