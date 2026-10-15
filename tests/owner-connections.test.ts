import { it, expect } from "vitest";
import { OwnerConnections } from "../server/lifecycle/owner-connections";
it("shares canonical owner slots, isolates other owners and releases each slot exactly once", () => {
  const slots = new OwnerConnections(2);
  const one = slots.acquire("owner"),
    two = slots.acquire("owner");
  expect(() => slots.acquire("owner")).toThrow("Too many open connections");
  const unrelated = slots.acquire("another");
  expect(slots.activeOwners).toBe(2);
  one();
  one();
  const replacement = slots.acquire("owner");
  two();
  replacement();
  unrelated();
  expect(slots.activeOwners).toBe(0);
});
