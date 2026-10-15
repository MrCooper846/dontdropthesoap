import { it, expect } from "vitest";
import { ExpiringMap } from "../server/lifecycle/expiring";
it("rejects new identities at capacity without evicting live limits; reclaims expired entries at the exact monotonic boundary", () => {
  let now = 0;
  const values = new ExpiringMap<number>(2, 1000, () => now);
  values.set("a", 1);
  values.set("b", 2);
  expect(() => values.set("c", 3)).toThrow("capacity is full");
  now = 999;
  expect(values.get("a")).toBe(1);
  values.set("a", 4);
  now = 1000;
  values.set("c", 3);
  expect([...values]).toEqual([
    ["a", 4],
    ["c", 3],
  ]);
  now = 1999;
  values.prune();
  expect(values.get("a")).toBeUndefined();
  expect(values.size).toBe(1);
  values.clear();
  expect(values.size).toBe(0);
});
it("removes idle records on pruning without needing another request from their identity", () => {
  let now = 10;
  const values = new ExpiringMap<object>(2, 30, () => now);
  values.set("gone", {});
  now = 40;
  values.prune();
  expect(values.size).toBe(0);
});
