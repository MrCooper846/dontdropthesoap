import { runSoak } from "./soak";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { io, type Socket } from "socket.io-client";
import { starter } from "../../shared/bots/presets";
import { YARD_MAP } from "../../shared/yard/map";
import type { Snapshot } from "../../shared/protocol/commands";
const database = "postgresql://soap:soap_local_only@localhost:55432/soap_load";
const local = "http://127.0.0.1:3117",
  origin = "https://soap-load.invalid";
assert.equal(new URL(database).pathname, "/soap_load");
const scale = process.argv.includes("--twice") ? 2 : 1;
const soakDurationMs = process.argv.includes("--soak")
  ? 3600000
  : process.argv.includes("--soak-smoke")
    ? 60000
    : 0;
assert.ok(
  !(soakDurationMs && scale === 2),
  "Run sustained soak at the public nominal capacity",
);
assert.ok(
  !(process.argv.includes("--soak") && process.argv.includes("--soak-smoke")),
);
const evidenceId = Date.now() + "-" + randomUUID();
const source = {
  revision: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  dirty:
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
      .length > 0,
  buildId: existsSync(".next/BUILD_ID")
    ? readFileSync(".next/BUILD_ID", "utf8").trim()
    : null,
  node: process.version,
};
const serviceSamples: any[] = [];
let metricsTruncated = false;
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "3117",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: database,
  SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
  COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  MAX_YARD_PLAYERS: String(32 * scale),
  FEATURE_YARD: "true",
  FEATURE_VOICE: "false",
  FEATURE_LEAGUE: "false",
  FEATURE_EXTERNAL_BOTS: "true",
  FEATURE_VISUAL_BOTS: "true",
};
const db = new Pool({ connectionString: database });
let service: ChildProcess | undefined,
  output = "",
  moving: ReturnType<typeof setInterval> | undefined,
  chatting: ReturnType<typeof setInterval> | undefined;
const bots: ChildProcess[] = [],
  clients: Client[] = [],
  acks: number[] = [],
  externalAcks: number[] = [],
  failures: string[] = [];
type Client = {
  cookie: string;
  csrf: string;
  id: string;
  epoch: number;
  socket: Socket;
  seq: number;
  position: { x: number; y: number };
  botId?: string;
  latest?: Snapshot;
  sent: Set<string>;
  busy: boolean;
};
const ROUNDS = 10;
const matches: string[] = [],
  deadlines = new Map<string, number>(),
  resolutionLags: number[] = [];
let playing = false,
  measuredAt = 0,
  metricStartCount = 0;
async function until(check: () => Promise<boolean>, label: string, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (failures.length)
      throw Error("Unexpected workload rejection: " + failures[0]);
    if (service?.exitCode !== null && service?.exitCode !== undefined)
      throw Error("Load service exited");
    if (await check()) return;
    await delay(100);
  }
  throw Error("Timed out: " + label);
}
async function rpc(c: Client, event: string, input: unknown): Promise<any> {
  return new Promise((resolve, reject) =>
    c.socket
      .timeout(15000)
      .emit(event, input, (error: Error | null, result: any) =>
        error ? reject(error) : resolve(result),
      ),
  );
}
async function api(
  c: Pick<Client, "cookie" | "csrf">,
  route: string,
  input?: unknown,
) {
  const response = await fetch(local + "/api/v1" + route, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: c.cookie,
      "x-csrf-token": c.csrf,
      "Content-Type": "application/json",
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error("Load HTTP " + (result.error?.code ?? response.status));
  return result;
}
async function resource(c: Client, route: string, payload: unknown) {
  const { key } = await api(c, "/command-keys", {});
  return api(c, route, {
    commandId: randomUUID(),
    key,
    controllerEpoch: c.epoch,
    payload,
  });
}
async function command(c: Client, input: Record<string, unknown>) {
  const payload = {
    v: 1,
    commandId: randomUUID(),
    controllerEpoch: c.epoch,
    ...input,
  };
  const copies = playing ? scale : 1;
  const results = await Promise.all(
    Array.from({ length: copies }, async () => {
      const started = performance.now();
      const result = await rpc(c, "command", payload);
      if (!result.ok) throw Error("Load command " + result.error?.code);
      if (playing) acks.push(performance.now() - started);
      return result;
    }),
  );
  return results[0];
}
function accept(c: Client, s: Snapshot) {
  c.latest = s;
  if (!playing || !matches.includes(s.id)) return;
  const roundKey = s.id + ":" + s.round;
  if (s.phase === "collecting") deadlines.set(roundKey, s.deadline!);
  if (s.phase === "revealing" && s.round === 3 && deadlines.has(roundKey)) {
    const lag = Date.now() - deadlines.get(roundKey)!;
    if (!resolutionLags.length || !deadlines.has(roundKey + ":seen")) {
      resolutionLags.push(lag);
      deadlines.set(roundKey + ":seen", 0);
    }
  }
  const own = s.seats.find((seat) => seat.id === s.ownSeatId);
  if (
    s.phase !== "collecting" ||
    own?.kind !== "human" ||
    s.ownMove ||
    c.sent.has(roundKey)
  )
    return;
  c.sent.add(roundKey);
  // One deliberately silent human per table proves real deadline resolution.
  if (s.round === 3 && clients.indexOf(c) % 8 === 0) return;
  void command(c, {
    type: "move.submit",
    matchId: s.id,
    seatId: s.ownSeatId,
    round: s.round,
    payload: { move: "C" },
  }).catch((error) => failures.push(error.message));
}
async function guest(index: number) {
  const response = await fetch(local + "/api/v1/session/guest", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Load human " + index }),
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const session = await api({ cookie, csrf: "" }, "/session");
  const control = await api(
    { cookie, csrf: session.csrfToken },
    "/controller/acquire",
    {},
  );
  const socket = io(local + "/game-v1", {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: cookie },
    reconnection: false,
  });
  const c: Client = {
    cookie,
    csrf: session.csrfToken,
    id: session.ownerId,
    epoch: control.controllerEpoch,
    socket,
    seq: 0,
    position: { ...YARD_MAP.spawn },
    sent: new Set(),
    busy: false,
  };
  socket.on("yard.positions", (view) => {
    const p = view.players.find((p: any) => p.ownerId === c.id);
    if (p) c.position = { x: p.x, y: p.y };
  });
  socket.on("match.snapshot", (event) => accept(c, event.payload));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  assert.equal(
    (await rpc(c, "yard.enter", { controllerEpoch: c.epoch })).ok,
    true,
  );
  clients.push(c);
  await delay(410);
}
async function walk(c: Client, x: number, y: number) {
  for (const target of [
    { x, y: 560 },
    { x, y },
  ]) {
    const end = Date.now() + 20000;
    while (Math.hypot(c.position.x - target.x, c.position.y - target.y) > 10) {
      assert.ok(Date.now() < end, "Walk must reach authoritative circle");
      const dx = target.x - c.position.x,
        dy = target.y - c.position.y;
      const r = await rpc(c, "yard.input", {
        controllerEpoch: c.epoch,
        payload: {
          seq: c.seq++,
          axisX: Math.abs(dx) > 7 ? Math.sign(dx) : 0,
          axisY: Math.abs(dy) > 7 ? Math.sign(dy) : 0,
        },
      });
      assert.equal(r.ok, true);
      await delay(100);
    }
  }
  await rpc(c, "yard.input", {
    controllerEpoch: c.epoch,
    payload: { seq: c.seq++, axisX: 0, axisY: 0 },
  });
}
async function stop() {
  if (moving) clearInterval(moving);
  if (chatting) clearInterval(chatting);
  for (const c of clients) c.socket.disconnect();
  for (const child of bots) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  for (const child of bots)
    await Promise.race([
      new Promise((resolve) =>
        child.exitCode !== null ? resolve(null) : child.once("exit", resolve),
      ),
      delay(5000, undefined, { ref: false }).then(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }),
    ]);
  const child = service;
  if (child?.pid && child.exitCode === null) {
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", resolve),
    );
    process.kill(-child.pid, "SIGTERM");
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, 15000);
    try {
      assert.equal(await exited, 0, "Load service must drain normally");
    } finally {
      clearTimeout(timer);
      service = undefined;
    }
  }
}
function metricSamples(): any[] {
  assert.equal(
    metricsTruncated,
    false,
    "Metric evidence exceeded its declared bound",
  );
  return serviceSamples;
}

async function run() {
  assert.ok(existsSync(".next/BUILD_ID"), "Build before production load test");
  const migrated = spawn(
    process.execPath,
    ["--import", "tsx", "server/persistence/migrate.ts"],
    { env, stdio: "ignore" },
  );
  assert.equal(
    await new Promise((resolve) => migrated.once("exit", resolve)),
    0,
  );
  assert.equal(
    (await db.query("SELECT current_database() AS name")).rows[0].name,
    "soap_load",
  );
  await db.query("TRUNCATE owners CASCADE");
  await db.query("UPDATE service_controls SET matches_open=true");
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [service.stdout!, service.stderr!]) {
    let fragment = "";
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-500000);
      fragment += chunk.toString();
      const lines = fragment.split("\n");
      fragment = lines.pop()!.slice(-100000);
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (value.event === "service.metrics") {
            if (serviceSamples.length >= 1000) {
              serviceSamples.shift();
              metricsTruncated = true;
            }
            serviceSamples.push(value);
          }
        } catch {}
      }
    });
  }
  await until(async () => {
    try {
      return (await fetch(local + "/health/ready")).ok;
    } catch {
      return false;
    }
  }, "readiness");
  for (let i = 0; i < 32 * scale; i++) await guest(i);
  assert.equal((await api(clients[0], "/yard")).players.length, 32 * scale);
  for (let table = 1; table < 4; table++) {
    const visual = clients[table * 8 + 6],
      external = clients[table * 8 + 7];
    visual.botId = (
      await resource(visual, "/bots/visual", {
        name: "Load visual " + table,
        workspace: starter("cooperate"),
      })
    ).id;
    external.botId = (
      await resource(external, "/bots", { name: "Load external " + table })
    ).id;
    const token = await resource(
      external,
      "/bots/" + external.botId + "/credentials",
      {},
    );
    const child =
      table === 3
        ? spawn("python3", ["examples/bots/client.py"], {
            env: {
              ...process.env,
              SOAP_URL: local,
              SOAP_BOT_TOKEN: token.secret,
              SOAP_STRATEGY: "cooperate",
              SOAP_METRICS: "true",
            },
            stdio: ["ignore", "pipe", "ignore"],
          })
        : spawn(
            process.execPath,
            ["--import", "tsx", "examples/bots/client.ts"],
            {
              env: {
                ...process.env,
                SOAP_URL: local,
                SOAP_BOT_TOKEN: token.secret,
                SOAP_STRATEGY: "cooperate",
                SOAP_METRICS: "true",
              },
              stdio: ["ignore", "pipe", "ignore"],
            },
          );
    bots.push(child);
    assert.ok(child.stdout, "External metric stream must be piped");
    let metricsBuffer = "";
    child.stdout!.on("data", (chunk) => {
      metricsBuffer += chunk.toString();
      const lines = metricsBuffer.split("\n");
      metricsBuffer = lines.pop()!;
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (
            value.event === "bot.ack.latency" &&
            Number.isFinite(value.elapsedMs) &&
            value.elapsedMs >= 0
          )
            externalAcks.push(value.elapsedMs);
        } catch {}
      }
      if (metricsBuffer.length > 4096) {
        metricsBuffer = "";
        failures.push("Unexpected external metric stream");
      }
    });
    await until(async () => {
      const rows = (await api(external, "/bots")).bots;
      return rows.some((b: any) => b.id === external.botId && b.online);
    }, "external bot heartbeat");
  }
  await Promise.all(
    clients.map((c, i) => {
      const circle = YARD_MAP.circles[Math.floor(i / 8)];
      return i < 32
        ? walk(c, circle.x, circle.y)
        : walk(c, 240 + (i % 8) * 60, 560);
    }),
  );
  for (let table = 0; table < 4; table++) {
    const group = clients.slice(table * 8, table * 8 + 8),
      host = group[0],
      circle = YARD_MAP.circles[table];
    const { key } = await api(host, "/command-keys", {});
    const created = await api(host, "/matches", {
      key,
      commandId: randomUUID(),
      controllerEpoch: host.epoch,
      circleId: circle.id,
      mode: circle.mode,
      settings: {
        rounds: ROUNDS,
        decisionMs: 5000,
        revealMs: 1000,
        maxSeats: 8,
      },
    });
    matches.push(created.id);
    for (const c of group.slice(1)) {
      const { key } = await api(c, "/command-keys", {});
      await api(c, "/matches/" + created.id + "/join", {
        key,
        commandId: randomUUID(),
        controllerEpoch: c.epoch,
        ...(c.botId ? { botId: c.botId } : {}),
      });
    }
    for (const c of group) {
      const sync = await rpc(c, "state.sync", { matchId: created.id });
      assert.equal(sync.ok, true);
      accept(c, sync.snapshot);
      await delay(40);
      await command(c, {
        type: "seat.ready",
        matchId: created.id,
        seatId: sync.snapshot.ownSeatId,
        payload: { ready: true },
      });
    }
  }
  const kinds = (
    await db.query(
      "SELECT kind,count(*)::int AS seats FROM match_seats WHERE match_id=ANY($1::uuid[]) GROUP BY kind ORDER BY kind",
      [matches],
    )
  ).rows;
  assert.deepEqual(
    kinds,
    [
      { kind: "external", seats: 3 },
      { kind: "human", seats: 26 },
      { kind: "visual", seats: 3 },
    ],
    "Every claimed bot must actually occupy its typed seat",
  );
  // Warmup/setup precede the measured active-game window.
  await delay(10000);
  measuredAt = performance.now();
  metricStartCount = metricSamples().length;
  playing = true;
  moving = setInterval(() => {
    for (const c of clients) {
      if (c.busy) continue;
      c.busy = true;
      void rpc(c, "yard.input", {
        controllerEpoch: c.epoch,
        payload: {
          seq: c.seq++,
          axisX: c.botId ? (Math.floor(Date.now() / 2000) % 2 ? 1 : -1) : 0,
          axisY: 0,
        },
      })
        .then((r) => {
          if (!r.ok) failures.push("Input " + r.error?.code);
        })
        .catch((error) => failures.push(error.message))
        .finally(() => {
          c.busy = false;
        });
    }
  }, 50);
  chatting = setInterval(() => {
    for (const c of clients)
      void rpc(c, "chat.send", {
        controllerEpoch: c.epoch,
        text: "Synthetic load conversation",
      })
        .then((r) => {
          if (!r.ok) failures.push("Chat " + r.error?.code);
        })
        .catch((error) => failures.push(error.message));
  }, 1100);
  await Promise.all(
    matches.map(async (id, table) => {
      const c = clients[table * 8],
        view = await api(c, "/matches/" + id + "/observation");
      await command(c, {
        type: "match.start",
        matchId: id,
        matchVersion: view.version,
        payload: {},
      });
    }),
  );
  await until(
    async () =>
      matches.every((id) =>
        clients.some(
          (c) => c.latest?.id === id && c.latest.phase === "finished",
        ),
      ),
    "all four full games",
    90000,
  );
  playing = false;
  const elapsedMs = performance.now() - measuredAt;
  if (moving) clearInterval(moving);
  if (chatting) clearInterval(chatting);
  const counts = (
    await db.query(
      "SELECT (SELECT count(*)::int FROM moves WHERE match_id=ANY($1::uuid[])) AS moves,(SELECT count(*)::int FROM moves WHERE match_id=ANY($1::uuid[]) AND source='timeout') AS timeouts,(SELECT count(*)::int FROM round_results WHERE match_id=ANY($1::uuid[])) AS results,(SELECT count(*)::int FROM balance_entries WHERE match_id=ANY($1::uuid[])) AS credits",
      [matches],
    )
  ).rows[0];
  assert.deepEqual(counts, {
    moves: ROUNDS * 32,
    timeouts: 4,
    results: ROUNDS * 16,
    credits: 32,
  });
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM visual_decisions WHERE match_id=ANY($1::uuid[]) AND status='accepted'",
        [matches],
      )
    ).rows[0].n,
    ROUNDS * 3,
    "Real native visual decisions must commit",
  );
  assert.equal(failures.length, 0, "No unexpected workload rejection");
  assert.equal(resolutionLags.length, 4);
  assert.ok(
    resolutionLags.every((ms) => ms >= 0 && ms < 1000),
    "Deliberately silent rounds resolve within one second of deadline: " +
      JSON.stringify(resolutionLags),
  );
  const soak = soakDurationMs
    ? await runSoak({
        clients,
        rpc,
        guest,
        samples: metricSamples,
        healthy: () =>
          service?.exitCode === null && bots.every((b) => b.exitCode === null),
        failures,
        source,
        evidenceId,
        durationMs: soakDurationMs,
      })
    : undefined;
  const returning = clients[0];
  returning.socket.disconnect();
  await delay(100);
  await new Promise<void>((resolve, reject) => {
    returning.socket.once("connect", resolve);
    returning.socket.once("connect_error", reject);
    returning.socket.connect();
  });
  const reentered = await rpc(returning, "yard.enter", {
    controllerEpoch: returning.epoch,
  });
  assert.equal(reentered.ok, true);
  await stop();
  const sorted = acks.sort((a, b) => a - b),
    p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert.equal(
    sorted.length,
    ROUNDS * 26 * scale,
    "One measured move per active human (minus deliberate timeouts) and four starts",
  );
  if (scale === 1)
    assert.ok(
      p95 < 250,
      "Nominal loopback socket ACK p95 must be below 250 ms",
    );
  assert.equal(
    externalAcks.length,
    ROUNDS * 3,
    "Each actual external HTTP decision must report an accepted ACK",
  );
  const sortedExternal = externalAcks.sort((a, b) => a - b),
    externalP95 = sortedExternal[Math.ceil(sortedExternal.length * 0.95) - 1];
  if (scale === 1)
    assert.ok(
      externalP95 < 250,
      "Nominal external HTTP ACK p95 must be below 250 ms",
    );
  const metrics = metricSamples()
    .slice(metricStartCount + 1)
    .filter(
      (sample) =>
        !sample.draining && sample.connectedSockets === clients.length,
    ); // Exclude the partial setup/measurement window.
  assert.ok(
    metrics.length > 0,
    "At least one complete measured event-loop window is required",
  );
  if (scale === 1)
    assert.ok(
      metrics.every((sample) => sample.eventLoop.p95Ms < 50),
      "Nominal event-loop p95 must remain below 50 ms",
    );
  const allSamples = metricSamples();
  assert.equal(
    allSamples.reduce((n, s) => n + s.counters["yard.reconnected"], 0),
    1 + (soak?.reconnects ?? 0),
    "Actual retained-presence reconnects agree with the workload",
  );
  const measuredMoves = allSamples.reduce(
    (n, s) => n + s.counters["move.recorded"],
    0,
  );
  const measuredTimeouts = allSamples.reduce(
    (n, s) => n + s.counters["move.timeout"],
    0,
  );
  assert.equal(
    measuredMoves,
    counts.moves,
    "Committed decision metrics agree with durable rows",
  );
  assert.equal(
    measuredTimeouts,
    counts.timeouts,
    "Timeout metrics agree with durable rows",
  );
  assert.ok(
    allSamples.some(
      (s) =>
        s.durableMetricsAvailable &&
        s.activeMatches === 4 &&
        s.activeSeats === 32 &&
        s.yardPlayers === clients.length &&
        s.outboxOldestAgeMs >= 0,
    ),
    "Production gauges observe the real four-table workload",
  );
  const report = {
    source,
    profile: scale === 1 ? "nominal" : "2x-presence-and-command-traffic",
    workloadComplete: true,
    committedDecisionMetrics: "PASS",
    reconnectMetrics: "PASS",
    durableGaugeSample: "PASS",
    timingTargetsMet:
      p95 < 250 &&
      externalP95 < 250 &&
      metrics.every((sample) => sample.eventLoop.p95Ms < 50),
    humanPresences: 32 * scale,
    durableCommandCopies: scale,
    yardCapacityForTest: 32 * scale,
    tables: 4,
    seats: 32,
    humanSeats: 26,
    visualBots: 3,
    externalBots: 3,
    externalProcesses: { typescript: 2, python: 1 },
    inputCadenceMs: 50,
    chatCadenceMs: 1100,
    roundsPerTable: ROUNDS,
    elapsedMs,
    clientSocketAckSamples: sorted.length,
    clientSocketAckP95Ms: p95,
    externalHttpAckSamples: externalAcks.length,
    externalHttpAckP95Ms: externalP95,
    deadlineResolutionLagsMs: resolutionLags,
    counts,
    metrics,
    voiceLoad: "NOT_TESTED",
    physicalMobileFPS: "NOT_TESTED",
    soak60Minutes: soak?.mode === "FULL_HOUR" ? "PASS" : "NOT_RUN",
    soak,
  };
  mkdirSync("data/load-runs", { recursive: true, mode: 0o700 });
  writeFileSync(
    "data/load-runs/" + Date.now() + ".json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ ...report, metrics: undefined }));
}
run()
  .catch((error) => {
    mkdirSync("data/load-runs", { recursive: true, mode: 0o700 });
    writeFileSync(
      "data/load-runs/" + evidenceId + ".failure.json",
      JSON.stringify(
        {
          source,
          soakDurationMs,
          criteria: soakDurationMs ? "tests/runtime/soak.ts" : null,
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Load test failed",
          resolutionLagsMs: resolutionLags,
          metrics: serviceSamples,
          metricsTruncated,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.error(error instanceof Error ? error.message : "Load test failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    await db.end();
  });
