import data from "./map.json";
import type { RestaurantZone } from "../restaurant/types";
export const UNITY_MAP = data;
export type Point = { x: number; z: number };
export function blocked(p: Point, radius = UNITY_MAP.radius) {
  const b = UNITY_MAP.bounds;
  return (
    p.x < b.xMin + radius ||
    p.x > b.xMax - radius ||
    p.z < b.zMin + radius ||
    p.z > b.zMax - radius ||
    UNITY_MAP.obstacles.some(
      (o) =>
        Math.abs(p.x - o.x) < o.w / 2 + radius &&
        Math.abs(p.z - o.z) < o.d / 2 + radius,
    )
  );
}
export function movePoint(p: Point, x: number, z: number, dt: number): Point {
  if (![x, z, dt, p.x, p.z].every(Number.isFinite)) return { ...p };
  const length = Math.max(1, Math.hypot(x, z));
  const distance = UNITY_MAP.speed * Math.max(0, Math.min(0.1, dt));
  const steps = Math.max(1, Math.ceil(distance / 0.06));
  const next = { ...p };
  for (let i = 0; i < steps; i++) {
    const px = { x: next.x + ((x / length) * distance) / steps, z: next.z };
    if (!blocked(px)) next.x = px.x;
    const pz = { x: next.x, z: next.z + ((z / length) * distance) / steps };
    if (!blocked(pz)) next.z = pz.z;
  }
  return next;
}
export function zoneAt(p: Point): RestaurantZone {
  return (UNITY_MAP.zones.find(
    (z) => p.x >= z.xMin && p.x <= z.xMax && p.z >= z.zMin && p.z <= z.zMax,
  )?.zone ?? "dining") as RestaurantZone;
}
export function nearStation(p: Point, kind: string, table?: number) {
  return UNITY_MAP.stations.some(
    (s) =>
      s.kind === kind &&
      zoneAt(p) === s.zone &&
      (table === undefined || ("table" in s && s.table === table)) &&
      Math.hypot(p.x - s.x, p.z - s.z) <= s.radius,
  );
}
