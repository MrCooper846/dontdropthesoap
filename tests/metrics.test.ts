import { it, expect, vi } from "vitest";
import {
  DurationHistogram,
  startMetrics,
} from "../server/observability/metrics";
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

it.each([2000, -2000])(
  "exposes a %i ms wall-clock step without redefining monotonic uptime",
  (step) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const initial = Date.now();
    const samples: any[] = [];
    const stop = startMetrics(
      () => ({}),
      (value) => samples.push(value),
    );
    try {
      vi.setSystemTime(initial + step);
    } finally {
      stop();
      vi.useRealTimers();
    }
    expect(samples).toHaveLength(1);
    const sample = samples[0];
    expect(sample.clock.wallElapsedMs).toBe(step);
    expect(sample.clock.monotonicElapsedMs).toBeGreaterThanOrEqual(0);
    expect(Math.abs(sample.clock.cumulativeDriftMs - step)).toBeLessThan(50);
    expect(sample.clock.windowDriftMs).toBe(sample.clock.cumulativeDriftMs);
    expect(sample.uptimeMs).toBe(Math.round(sample.clock.monotonicElapsedMs));
  },
);
