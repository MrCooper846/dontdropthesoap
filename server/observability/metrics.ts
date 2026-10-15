import { monitorEventLoopDelay } from "node:perf_hooks";
export class DurationHistogram {
  private readonly bounds = [
    1,
    2,
    5,
    10,
    20,
    50,
    100,
    150,
    250,
    500,
    1000,
    2500,
    5000,
    Infinity,
  ];
  private counts = this.bounds.map(() => 0);
  private count = 0;
  private max = 0;
  observe(ms: number) {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.count++;
    this.max = Math.max(this.max, ms);
    this.counts[this.bounds.findIndex((bound) => ms <= bound)]++;
  }
  snapshot() {
    let seen = 0,
      p95 = 0;
    for (let i = 0; i < this.bounds.length; i++) {
      seen += this.counts[i];
      if (this.count && seen >= Math.ceil(this.count * 0.95)) {
        p95 = Math.min(this.bounds[i], this.max);
        break;
      }
    }
    return { count: this.count, p95UpperMs: p95, maxMs: this.max };
  }
  reset() {
    this.counts.fill(0);
    this.count = 0;
    this.max = 0;
  }
}
const durations = {
  "command.accepted": new DurationHistogram(),
  "db.transaction": new DurationHistogram(),
  "voice.policy.refresh": new DurationHistogram(),
  "retention.batch": new DurationHistogram(),
};
const counters = {
  "command.rejected": 0,
  "work.overload": 0,
  "connection.rejected": 0,
  "connection.backpressure": 0,
  "waiting.expired": 0,
  "retention.history": 0,
  "http.rejected": 0,
  "socket.rejected": 0,
  "socket.auth.rejected": 0,
  "socket.transport.rejected": 0,
  "socket.connected": 0,
  "socket.disconnected": 0,
  "yard.reconnected": 0,
  "move.recorded": 0,
  "move.timeout": 0,
  "worker.failed": 0,
  "worker.timeout": 0,
  "voice.policy.failed": 0,
  "voice.policy.stale": 0,
  "outbox.published": 0,
  "game.tick.failed": 0,
  "metrics.refresh.failed": 0,
};
export function duration(name: keyof typeof durations, ms: number) {
  durations[name].observe(ms);
}
export type Counter = keyof typeof counters;
export function increment(name: Counter, amount = 1) {
  if (!Number.isSafeInteger(amount) || amount < 0) return;
  counters[name] = Math.min(Number.MAX_SAFE_INTEGER, counters[name] + amount);
}
export function startMetrics(
  state: () => Record<string, number | boolean>,
  emit: (value: unknown) => void = (value) =>
    console.log(JSON.stringify(value)),
) {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const started = performance.now();
  function sample() {
    const memory = process.memoryUsage();
    emit({
      event: "service.metrics",
      uptimeMs: Math.round(performance.now() - started),
      ...state(),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      eventLoop: {
        resolutionMs: 10,
        p95Ms: loop.count ? loop.percentile(95) / 1e6 : 0,
        maxMs: loop.count ? loop.max / 1e6 : 0,
      },
      timings: Object.fromEntries(
        Object.entries(durations).map(([name, h]) => [name, h.snapshot()]),
      ),
      counters: { ...counters },
    });
    loop.reset();
    for (const h of Object.values(durations)) h.reset();
    for (const name of Object.keys(counters) as (keyof typeof counters)[])
      counters[name] = 0;
  }
  const timer = setInterval(sample, 10000);
  timer.unref();
  return () => {
    clearInterval(timer);
    sample();
    loop.disable();
  };
}
