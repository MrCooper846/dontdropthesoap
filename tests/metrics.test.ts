import { it, expect } from "vitest";
import { DurationHistogram } from "../server/observability/metrics";
it("reports bounded conservative percentiles, ignores invalid samples and resets windows", () => {
  const h = new DurationHistogram();
  for (let i = 0; i < 95; i++) h.observe(23);
  for (let i = 0; i < 5; i++) h.observe(400);
  h.observe(NaN);
  h.observe(Infinity);
  h.observe(-1);
  expect(h.snapshot()).toEqual({ count: 100, p95UpperMs: 50, maxMs: 400 });
  h.reset();
  expect(h.snapshot()).toEqual({ count: 0, p95UpperMs: 0, maxMs: 0 });
  h.observe(12000);
  expect(h.snapshot()).toEqual({ count: 1, p95UpperMs: 12000, maxMs: 12000 });
});
