import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { Socket } from "socket.io-client";
import { DurationHistogram } from "../../server/observability/metrics";
type Client = {
  id: string;
  epoch: number;
  seq: number;
  busy: boolean;
  socket: Socket;
  botId?: string;
};
export const SOAK_CRITERIA = {
  fullDurationMs: 3600000,
  warmupMs: 600000,
  memoryWindowMs: 300000,
  minSamplesPerWindow: 24,
  maxSampleGapMs: 30000,
  maxHeapGrowthMiB: 64,
  maxRssGrowthMiB: 128,
  maxHeapSlopeMiBPerMinute: 1,
  maxRssSlopeMiBPerMinute: 2,
  maxHeapMiB: 1024,
  maxRssMiB: 1536,
};
const mib = 1024 * 1024;
function percentile(values: number[], fraction: number) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)];
}
function slope(values: number[]) {
  const xs = values.map((_, i) => 12.5 + i * 5);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    values.reduce((sum, y, i) => sum + (xs[i] - mx) * (y - my), 0) /
    xs.reduce((sum, x) => sum + (x - mx) ** 2, 0)
  );
}
export async function runSoak<T extends Client>(context: {
  clients: T[];
  rpc: (client: T, event: string, input: unknown) => Promise<any>;
  guest: (serial: number) => Promise<void>;
  samples: () => any[];
  healthy: () => boolean;
  failures: string[];
  durationMs: number;
  source: unknown;
  evidenceId: string;
}) {
  const { clients, durationMs } = context;
  assert.equal(clients.length, 32, "Soak uses the public 32-presence target");
  assert.ok([60000, SOAK_CRITERIA.fullDurationMs].includes(durationMs));
  const full = durationMs === SOAK_CRITERIA.fullDurationMs;
  console.log(
    JSON.stringify({
      event: "soak.criteria",
      mode: full ? "FULL_HOUR" : "SMOKE_ONLY",
      criteria: SOAK_CRITERIA,
    }),
  );
  const check = () => {
    assert.ok(
      context.healthy(),
      "The real game and all three external processes must stay alive",
    );
    assert.equal(
      context.failures.length,
      0,
      "Unexpected workload rejection: " + context.failures[0],
    );
  };
  const initialSamples = context.samples().length;
  const boundaryEnd = performance.now() + 15000;
  while (context.samples().length === initialSamples) {
    check();
    assert.ok(
      performance.now() < boundaryEnd,
      "Need a fresh metric boundary before soak",
    );
    await delay(100);
  }
  const baseUptime = context.samples().at(-1).uptimeMs;
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const pending = new Map<T, Set<Promise<void>>>(),
    paused = new Set<T>();
  const input = new DurationHistogram(),
    chat = new DurationHistogram();
  let cycles = 0,
    reconnects = 0,
    explicitReentries = 0,
    replacementGuests = 0,
    nextProgress = 60000;
  function failure(error: unknown) {
    if (context.failures.length < 16)
      context.failures.push(
        error instanceof Error ? error.message : "Soak operation failed",
      );
  }
  function track(
    c: T,
    event: string,
    payload: unknown,
    histogram?: DurationHistogram,
  ) {
    const start = performance.now();
    const work = context
      .rpc(c, event, payload)
      .then((r) => {
        assert.equal(r.ok, true, "Soak " + event + " " + r.error?.code);
        if (event === "yard.input")
          assert.equal(
            r.result.accepted,
            true,
            "Synthetic movement must be accepted, not merely ACKed",
          );
        histogram?.observe(performance.now() - start);
      })
      .catch(failure);
    const jobs = pending.get(c) ?? new Set<Promise<void>>();
    jobs.add(work);
    pending.set(c, jobs);
    void work.finally(() => {
      jobs.delete(work);
      if (!jobs.size) pending.delete(c);
    });
    return work;
  }
  assert.match(context.evidenceId, /^\d+-[a-f0-9-]+$/);
  mkdirSync("data/load-runs", { recursive: true, mode: 0o700 });
  const evidence =
    "data/load-runs/" + context.evidenceId + ".soak-progress.json";
  function persist(status: string) {
    const body = {
      status,
      source: context.source,
      startedAt,
      baseUptime,
      mode: full ? "FULL_HOUR" : "SMOKE_ONLY",
      elapsedMs: performance.now() - started,
      durationMs,
      cycles,
      reconnects,
      explicitReentries,
      replacementGuests,
      input: input.snapshot(),
      chat: chat.snapshot(),
      criteria: SOAK_CRITERIA,
      metrics: context.samples(),
    };
    writeFileSync(evidence + ".tmp", JSON.stringify(body), { mode: 0o600 });
    renameSync(evidence + ".tmp", evidence);
  }
  const moving = setInterval(() => {
    for (const c of clients) {
      if (paused.has(c) || c.busy || !c.socket.connected) continue;
      c.busy = true;
      void track(
        c,
        "yard.input",
        {
          controllerEpoch: c.epoch,
          payload: {
            seq: c.seq++,
            axisX:
              Math.floor((performance.now() - started) / 2000) % 2 ? 1 : -1,
            axisY: 0,
          },
        },
        input,
      ).finally(() => {
        c.busy = false;
      });
    }
  }, 50);
  const chatting = setInterval(() => {
    for (const c of clients) {
      if (paused.has(c) || !c.socket.connected) continue;
      void track(
        c,
        "chat.send",
        { controllerEpoch: c.epoch, text: "Synthetic sustained conversation" },
        chat,
      );
    }
  }, 1100);
  persist("RUNNING");
  try {
    while (performance.now() - started < durationMs) {
      await delay(
        Math.min(2000, Math.max(1, durationMs - (performance.now() - started))),
      );
      check();
      if (performance.now() - started >= durationMs) break;
      const index: number = cycles % clients.length;
      const c: T = clients[index];
      paused.add(c);
      await Promise.all([...(pending.get(c) ?? [])]);
      check();
      if (cycles % 3 === 0) {
        c.socket.disconnect();
        await delay(100);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("Soak reconnect timed out")),
            15000,
          );
          const done = () => {
            clearTimeout(timer);
            c.socket.off("connect_error", failed);
            resolve();
          };
          const failed = (e: Error) => {
            clearTimeout(timer);
            c.socket.off("connect", done);
            reject(e);
          };
          c.socket.once("connect", done);
          c.socket.once("connect_error", failed);
          c.socket.connect();
        });
        assert.equal(
          (await context.rpc(c, "yard.enter", { controllerEpoch: c.epoch })).ok,
          true,
        );
        c.seq = 0;
        reconnects++;
      } else {
        assert.equal((await context.rpc(c, "yard.leave", {})).ok, true);
        if (cycles % 3 === 2 && !c.botId) {
          c.socket.disconnect();
          await context.guest(10000 + replacementGuests);
          const replacement = clients.pop()!;
          assert.equal(clients.length, 32);
          clients[index] = replacement;
          replacementGuests++;
        } else {
          assert.equal(
            (await context.rpc(c, "yard.enter", { controllerEpoch: c.epoch }))
              .ok,
            true,
          );
          c.seq = 0;
          explicitReentries++;
        }
      }
      paused.delete(c);
      const view = await context.rpc(clients[index], "yard.sync", {});
      assert.equal(view.ok, true);
      assert.equal(
        view.result.snapshot.players.length,
        32,
        "Churn must preserve the public yard cap",
      );
      assert.ok(view.result.chat.length <= 256, "Recent chat remains bounded");
      cycles++;
      const elapsed = performance.now() - started;
      if (elapsed >= nextProgress) {
        const latest = context.samples().at(-1);
        console.log(
          JSON.stringify({
            event: "soak.progress",
            elapsedSeconds: Math.floor(elapsed / 1000),
            cycles,
            reconnects,
            explicitReentries,
            replacementGuests,
            inputCount: input.snapshot().count,
            rssMiB: latest.rssBytes / mib,
            heapMiB: latest.heapUsedBytes / mib,
          }),
        );
        persist("RUNNING");
        nextProgress += 60000;
      }
    }
  } finally {
    clearInterval(moving);
    clearInterval(chatting);
    await Promise.all([...pending.values()].flatMap((jobs) => [...jobs]));
  }
  check();
  const elapsedMs = performance.now() - started;
  assert.ok(
    elapsedMs >= durationMs,
    "The actual elapsed soak duration cannot be abbreviated",
  );
  assert.ok(
    cycles >= Math.floor(durationMs / 5000),
    "Churn must remain sustained throughout the run",
  );
  assert.ok(
    input.snapshot().count >= Math.floor((durationMs / 50) * 32 * 0.7),
    "Movement cadence must remain sustained",
  );
  assert.ok(
    chat.snapshot().count >= Math.floor((durationMs / 1100) * 32 * 0.7),
    "Chat cadence must remain sustained",
  );
  const samples = context
    .samples()
    .filter(
      (s) => s.uptimeMs >= baseUptime && s.uptimeMs <= baseUptime + durationMs,
    );
  assert.ok(samples.length >= Math.floor(durationMs / 10000) - 2);
  for (let i = 1; i < samples.length; i++)
    assert.ok(
      samples[i].uptimeMs - samples[i - 1].uptimeMs <=
        SOAK_CRITERIA.maxSampleGapMs,
      "A sampling/suspend gap invalidates continuous soak evidence",
    );
  for (const s of samples) {
    assert.ok(
      s.ready && !s.draining && s.durableMetricsAvailable,
      "The service remains ready with current durable observations",
    );
    assert.ok(
      s.eventLoop.p95Ms < 50,
      "Nominal soak event-loop p95 stays below 50ms",
    );
    for (const name of [
      "http.rejected",
      "socket.rejected",
      "socket.auth.rejected",
      "connection.backpressure",
      "game.tick.failed",
      "outbox.failed",
      "metrics.refresh.failed",
      "worker.failed",
    ])
      assert.equal(s.counters[name], 0, "Unexpected soak counter " + name);
  }
  let memory: unknown = { status: "NOT_RUN_SMOKE" };
  if (full) {
    memory = assessSoakMemory(samples, baseUptime);
  }
  persist("PHASE_COMPLETE");
  return {
    evidence,
    startedAt,
    baseUptime,
    mode: full ? "FULL_HOUR" : "SMOKE_ONLY",
    durationMs: elapsedMs,
    cycles,
    reconnects,
    explicitReentries,
    replacementGuests,
    input: input.snapshot(),
    chat: chat.snapshot(),
    metricSamples: samples.length,
    memory,
    criteria: SOAK_CRITERIA,
    voiceLoad: "NOT_TESTED",
    physicalMobileFPS: "NOT_TESTED",
  };
}

export function assessSoakMemory(samples: any[], baseUptime: number) {
  const windows = Array.from({ length: 10 }, (_, i) => {
    const window = samples.filter(
      (s) =>
        s.uptimeMs - baseUptime >=
          SOAK_CRITERIA.warmupMs + i * SOAK_CRITERIA.memoryWindowMs &&
        s.uptimeMs - baseUptime <
          SOAK_CRITERIA.warmupMs + (i + 1) * SOAK_CRITERIA.memoryWindowMs,
    );
    assert.ok(
      window.length >= SOAK_CRITERIA.minSamplesPerWindow,
      "Each post-warmup window needs actual samples",
    );
    return {
      heapMiB: percentile(
        window.map((s) => s.heapUsedBytes / mib),
        0.2,
      ),
      rssMiB: percentile(
        window.map((s) => s.rssBytes / mib),
        0.2,
      ),
      samples: window.length,
    };
  });
  const heaps = windows.map((w) => w.heapMiB),
    rss = windows.map((w) => w.rssMiB);
  const heapGrowth = (heaps.at(-1)! + heaps.at(-2)! - heaps[0] - heaps[1]) / 2;
  const rssGrowth = (rss.at(-1)! + rss.at(-2)! - rss[0] - rss[1]) / 2;
  const heapSlope = slope(heaps),
    rssSlope = slope(rss);
  assert.ok(
    heapGrowth <= SOAK_CRITERIA.maxHeapGrowthMiB,
    "Post-warmup heap floor growth exceeds the declared budget",
  );
  assert.ok(
    rssGrowth <= SOAK_CRITERIA.maxRssGrowthMiB,
    "Post-warmup RSS floor growth exceeds the declared budget",
  );
  assert.ok(
    heapSlope <= SOAK_CRITERIA.maxHeapSlopeMiBPerMinute,
    "Heap floor keeps growing",
  );
  assert.ok(
    rssSlope <= SOAK_CRITERIA.maxRssSlopeMiBPerMinute,
    "RSS floor keeps growing",
  );
  assert.ok(
    Math.max(...samples.map((s) => s.heapUsedBytes / mib)) <=
      SOAK_CRITERIA.maxHeapMiB,
    "Heap exceeds declared ceiling",
  );
  assert.ok(
    Math.max(...samples.map((s) => s.rssBytes / mib)) <=
      SOAK_CRITERIA.maxRssMiB,
    "RSS exceeds declared ceiling",
  );
  return {
    status: "PASS",
    windows,
    heapGrowthMiB: heapGrowth,
    rssGrowthMiB: rssGrowth,
    heapSlopeMiBPerMinute: heapSlope,
    rssSlopeMiBPerMinute: rssSlope,
  };
}
