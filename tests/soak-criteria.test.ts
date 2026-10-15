import { it, expect } from "vitest";
import { assessSoakMemory } from "./runtime/soak";
const mib = 1024 * 1024;
function fixture(heapSlope = 0, rssSlope = 0) {
  return Array.from({ length: 360 }, (_, i) => ({
    uptimeMs: i * 10000,
    // Normal collection cycles create large peaks but stable floors.
    heapUsedBytes: (200 + ((i % 30) / 30) * 100 + (i / 6) * heapSlope) * mib,
    rssBytes: (400 + (i % 60 < 30 ? 20 : 0) + (i / 6) * rssSlope) * mib,
  }));
}
it("accepts stable floors despite ordinary heap sawtooth and RSS variation", () => {
  expect(assessSoakMemory(fixture(), 0).status).toBe("PASS");
});
it("rejects sustained heap leaks and RSS trends even within the final growth allowance", () => {
  expect(() => assessSoakMemory(fixture(2.5), 0)).toThrow(/heap floor growth/);
  expect(() => assessSoakMemory(fixture(0, 3), 0)).toThrow(
    /RSS floor keeps growing/,
  );
});
it("cannot call incomplete post-warmup measurement windows stable", () => {
  const partial = fixture().filter((s) => s.uptimeMs < 3300000);
  expect(() => assessSoakMemory(partial, 0)).toThrow(/actual samples/);
});
it("rejects an excessive absolute peak even when low memory floors stay flat", () => {
  const peak = fixture();
  peak[200].rssBytes = 1600 * mib;
  expect(() => assessSoakMemory(peak, 0)).toThrow(
    /RSS exceeds declared ceiling/,
  );
});
