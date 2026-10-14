import { starter } from "../../shared/bots/presets";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { connect as tcpConnect } from "node:net";
import { Pool } from "pg";
import { io } from "socket.io-client";
assert.equal(
  process.platform,
  "linux",
  "Run the physical shutdown test in Ubuntu",
);
const local = "http://127.0.0.1:3114",
  origin = "https://soap-drain.invalid";
const databaseURL =
  "postgresql://soap:soap_local_only@localhost:55432/soap_shutdown";
assert.equal(new URL(databaseURL).pathname, "/soap_shutdown");
const db = new Pool({ connectionString: databaseURL, max: 4 });
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "3114",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: databaseURL,
  SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
  COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  FEATURE_YARD: "false",
  FEATURE_VOICE: "false",
  FEATURE_LEAGUE: "true",
  FEATURE_VISUAL_BOTS: "true",
};
let service: ChildProcess | undefined,
  output = "";
type Client = { cookie: string; csrf: string; ownerId: string; epoch: number };
async function waitFor<T>(
  check: () => Promise<T | false | undefined>,
  what: string,
  ms = 30000,
): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const result = await check();
    if (result) return result as T;
    await delay(100);
  }
  throw Error("Timed out: " + what);
}
async function start(grace = 10000, overrides: Record<string, string> = {}) {
  output = "";
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: { ...env, ...overrides, SHUTDOWN_GRACE_MS: String(grace) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout!.on("data", (c) => {
    output = (output + c).slice(-24000);
  });
  service.stderr!.on("data", (c) => {
    output = (output + c).slice(-24000);
  });
  await waitFor(async () => {
    if (service!.exitCode !== null || service!.signalCode !== null)
      throw Error("Service exited: " + output);
    try {
      return (await fetch(local + "/health/ready")).ok;
    } catch {
      return false;
    }
  }, "server readiness");
}
async function exited(child: ChildProcess) {
  await waitFor(
    async () => child.exitCode !== null || child.signalCode !== null,
    "process exit",
    15000,
  );
  return child.exitCode;
}
async function stop() {
  const child = service;
  service = undefined;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  process.kill(-child.pid, "SIGTERM");
  try {
    assert.equal(await exited(child), 0, output);
  } catch (error) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    throw error;
  }
}
async function reset() {
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
    "soap_shutdown",
  );
  await db.query("TRUNCATE owners CASCADE");
}
async function request(c: Client, path: string, data?: unknown) {
  const r = await fetch(local + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: c.cookie,
      "x-csrf-token": c.csrf,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await r.json();
  if (!r.ok) throw Error(body.error?.message ?? "HTTP " + r.status);
  return body;
}
async function guest(name: string): Promise<Client> {
  const r = await fetch(local + "/api/v1/session/guest", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert.equal(r.status, 201);
  const c = {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: "",
    ownerId: "",
    epoch: 0,
  };
  const s = await request(c, "/session");
  c.csrf = s.csrfToken;
  c.ownerId = s.ownerId;
  c.epoch = s.controllerEpoch;
  return c;
}
async function resource(c: Client, path: string, payload: object) {
  const { key } = await request(c, "/command-keys", {});
  return request(c, path, {
    commandId: randomUUID(),
    key,
    controllerEpoch: c.epoch,
    ...payload,
  });
}
async function nominal(transport: "websocket" | "polling") {
  await reset();
  await start();
  const a = await guest("Drain A"),
    b = await guest("Drain B");
  const { id } = await resource(a, "/matches", {
    mode: "human",
    settings: { rounds: 5, decisionMs: 20000, revealMs: 1000, maxSeats: 2 },
  });
  await resource(b, "/matches/" + id + "/join", {});
  let state = await request(a, "/matches/" + id);
  const sa = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === a.ownerId,
    ).id,
    sb = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === b.ownerId,
    ).id;
  const input = (c: Client, type: string, seatId: string, payload: object) => ({
    v: 1,
    commandId: randomUUID(),
    controllerEpoch: c.epoch,
    type,
    matchId: id,
    matchVersion: state.version,
    round: state.round,
    seatId,
    payload,
  });
  assert.equal(
    (await request(a, "/commands", input(a, "seat.ready", sa, { ready: true })))
      .ok,
    true,
  );
  assert.equal(
    (await request(b, "/commands", input(b, "seat.ready", sb, { ready: true })))
      .ok,
    true,
  );
  state = await request(a, "/matches/" + id);
  assert.equal(
    (await request(a, "/commands", input(a, "match.start", sa, {}))).ok,
    true,
  );
  await waitFor(async () => {
    state = await request(a, "/matches/" + id);
    return state.phase === "collecting";
  }, "collecting phase");
  const socket = io(local + "/game-v1", {
    transports: [transport],
    upgrade: false,
    reconnection: false,
    extraHeaders: { Origin: origin, Cookie: a.cookie },
    timeout: 10000,
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  const locker = await db.connect();
  try {
    assert.equal(
      (await socket.timeout(10000).emitWithAck("state.sync", { matchId: id }))
        .ok,
      true,
    );
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM matches WHERE id=$1 FOR UPDATE", [id]);
    await locker.query("SELECT id FROM owners WHERE id=$1 FOR UPDATE", [
      a.ownerId,
    ]);
    const first = input(a, "move.submit", sa, { move: "C" }),
      second = input(b, "move.submit", sb, { move: "D" });
    const ws = socket.timeout(15000).emitWithAck("command", first);
    const http = request(b, "/commands", second);
    const preview = request(a, "/bots/preview", {
      controllerEpoch: a.epoch,
      workspace: starter("cooperate"),
      observation: {
        round: 1,
        ownScore: 0,
        opponentScore: 0,
        lastOpponentMove: null,
        ownCooperations: 0,
        ownBetrayals: 0,
        opponentCooperations: 0,
        opponentBetrayals: 0,
      },
    });
    const admittedResponses = Promise.all([ws, http, preview]);
    void admittedResponses.catch(() => {});
    await waitFor(
      async () =>
        Number(
          (
            await db.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname='soap_shutdown' AND wait_event_type='Lock' AND (query LIKE '%SELECT state_json FROM matches%' OR query LIKE '%controller_epoch FROM owners%')",
            )
          ).rows[0].count,
        ) >= 3,
      "game commands and preview admitted before drain and blocked on real row locks",
    );
    const restart = new Promise<void>((resolve) =>
      socket.once("service.restarting", () => resolve()),
    );
    const child = service!;
    process.kill(-child.pid!, "SIGTERM");
    await Promise.race([
      restart,
      delay(5000).then(() => {
        throw Error("Missing namespace restart notice");
      }),
    ]);
    process.kill(-child.pid!, "SIGTERM"); // repeated signals must not bypass the drain
    const health = await fetch(local + "/health/ready");
    assert.equal(health.status, 503);
    assert.equal((await health.json()).draining, true);
    const late = input(a, "move.submit", sa, { move: "D" });
    const rejected = await fetch(local + "/api/v1/commands", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        "x-csrf-token": a.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(late),
    });
    assert.equal(rejected.status, 503);
    const lateSocket = await socket.timeout(5000).emitWithAck("command", late);
    assert.equal(lateSocket.error.code, "SERVICE_UNAVAILABLE");
    assert.equal(lateSocket.error.retryable, true);
    assert.equal(
      (await locker.query("SELECT pg_try_advisory_lock(724101) AS locked"))
        .rows[0].locked,
      false,
    );
    const competitor = spawn(
      process.execPath,
      ["--import", "tsx", "server.ts"],
      { env: { ...env, PORT: "3115" }, stdio: ["ignore", "ignore", "pipe"] },
    );
    let error = "";
    competitor.stderr!.on("data", (c) => {
      error += c;
    });
    assert.equal(await exited(competitor), 1);
    assert.match(error, /Another game writer/);
    assert.equal(
      child.exitCode,
      null,
      "Writer must stay alive while admitted commands are blocked",
    );
    await locker.query("COMMIT");
    const [socketAck, httpAck, previewAck] = await admittedResponses;
    assert.equal(socketAck.ok, true);
    assert.equal(httpAck.ok, true);
    assert.equal(previewAck.move, "C");
    assert.equal(previewAck.preview, true);
    assert.equal(await exited(child), 0, output);
    service = undefined;
    assert.match(output, /"event":"service.drain.complete"/);
    assert.doesNotMatch(output, /"event":"service.drain.timeout"/);
    assert.equal(
      (await locker.query("SELECT pg_try_advisory_lock(724101) AS locked"))
        .rows[0].locked,
      true,
    );
    await locker.query("SELECT pg_advisory_unlock(724101)");
    const rows = await db.query(
      "SELECT count(*) FROM command_receipts WHERE command_id=ANY($1::uuid[])",
      [[first.commandId, second.commandId]],
    );
    assert.equal(rows.rows[0].count, "2");
    assert.equal(
      (
        await db.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
          late.commandId,
        ])
      ).rowCount,
      0,
    );
    await start();
    const recovered = await request(a, "/matches/" + id);
    assert.equal(recovered.ownMove, "C");
    assert.deepEqual(
      recovered.seats.map((s: { score: number }) => s.score),
      [-2, 3],
    );
    assert.equal(
      (await db.query("SELECT count(*) FROM moves WHERE match_id=$1", [id]))
        .rows[0].count,
      "2",
    );
    assert.equal(
      (
        await db.query("SELECT count(*) FROM round_results WHERE match_id=$1", [
          id,
        ])
      ).rows[0].count,
      "1",
    );
    await stop();
    console.log(
      JSON.stringify({
        transport,
        inFlightHttpAndSocketAcknowledgements: "PASS",
        previewAllocatedAfterDrainAndClosed: "PASS",
        lateAdmissionFenced: "PASS",
        writerHeldThroughDrain: "PASS",
        secondWriterExcluded: "PASS",
        restartDurability: "PASS",
      }),
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    socket.disconnect();
    await stop();
  }
}
async function voiceDrain() {
  await reset();
  await start(10000, {
    FEATURE_YARD: "true",
    FEATURE_VOICE: "true",
    VOICE_LISTEN_IP: "127.0.0.1",
    VOICE_ANNOUNCED_ADDRESS: "127.0.0.1",
    VOICE_MIN_PORT: "19500",
    VOICE_MAX_PORT: "19531",
  });
  const owner = await guest("Voice drain");
  const socket = io(local + "/game-v1", {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: { Origin: origin, Cookie: owner.cookie },
  });
  const locker = await db.connect();
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
    assert.equal(
      (
        await socket
          .timeout(5000)
          .emitWithAck("yard.enter", { controllerEpoch: owner.epoch })
      ).ok,
      true,
    );
    const voice = (payload: object) =>
      socket.timeout(10000).emitWithAck("voice.command", {
        controllerEpoch: owner.epoch,
        payload,
      });
    assert.equal((await voice({ op: "join" })).ok, true);
    assert.equal(
      (await voice({ op: "transport", direction: "recv" })).ok,
      true,
    );
    const child = service!;
    const native = execFileSync(
      "ps",
      ["--ppid", String(child.pid), "-o", "pid=,args="],
      { encoding: "utf8" },
    )
      .split("\n")
      .find((line) => line.includes("mediasoup-worker"));
    assert.ok(native, "A real native media worker must be running");
    const worker = Number(native.trim().split(/\s+/)[0]);
    assert.ok(Number.isSafeInteger(worker) && worker > 1);
    const removed = new Promise<void>((resolve) =>
      socket.on("voice.event", (event) => {
        if (event.type === "voice.closed") resolve();
      }),
    );
    await locker.query("BEGIN");
    await locker.query("LOCK TABLE owner_blocks IN ACCESS EXCLUSIVE MODE");
    await waitFor(
      async () =>
        Number(
          (
            await db.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname='soap_shutdown' AND wait_event_type='Lock' AND query LIKE '%owner_blocks%'",
            )
          ).rows[0].count,
        ) > 0,
      "actual voice policy refresh blocked",
    );
    const pending = voice({ op: "poll" });
    void pending.catch(() => {});
    await delay(100);
    process.kill(-child.pid!, "SIGTERM");
    await Promise.race([
      removed,
      delay(5000).then(() => {
        throw Error("Voice was not removed during drain");
      }),
    ]);
    assert.equal(
      child.exitCode,
      null,
      "Shutdown must await the blocked policy refresh",
    );
    assert.equal(
      (await locker.query("SELECT pg_try_advisory_lock(724101) AS locked"))
        .rows[0].locked,
      false,
    );
    await locker.query("COMMIT");
    assert.equal((await pending).ok, false);
    assert.equal(await exited(child), 0, output);
    service = undefined;
    await waitFor(async () => {
      try {
        process.kill(worker, 0);
        return false;
      } catch {
        return true;
      }
    }, "native media child exit");
    console.log(
      JSON.stringify({
        nativeVoiceShutdown: "PASS",
        voiceRemovedBeforeDatabaseRefreshReturns: "PASS",
        pendingPolicyDrained: "PASS",
        nativeWorkerExited: "PASS",
      }),
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
    socket.disconnect();
    await stop();
  }
}
async function forced() {
  await reset();
  await start(2000);
  const owner = await guest("Slow body fixture");
  const raw = tcpConnect(3114, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    raw.once("connect", () => resolve());
    raw.once("error", reject);
  });
  raw.on("error", () => {});
  raw.on("data", () => {});
  raw.write(
    "POST /api/v1/commands HTTP/1.1\r\nHost: 127.0.0.1:3114\r\nOrigin: " +
      origin +
      "\r\nCookie: " +
      owner.cookie +
      "\r\nx-csrf-token: " +
      owner.csrf +
      "\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{",
  );
  await delay(200);
  const child = service!,
    began = performance.now();
  process.kill(-child.pid!, "SIGTERM");
  assert.equal(await exited(child), 1);
  service = undefined;
  raw.destroy();
  assert.ok(performance.now() - began >= 1500);
  assert.ok(performance.now() - began < 10000);
  assert.match(output, /"event":"service.drain.timeout","pending":1/);
  const probe = await db.connect();
  try {
    await waitFor(
      async () =>
        (await probe.query("SELECT pg_try_advisory_lock(724101) AS locked"))
          .rows[0].locked,
      "ownership released by bounded process exit",
    );
    await probe.query("SELECT pg_advisory_unlock(724101)");
  } finally {
    probe.release();
  }
  await start();
  assert.equal((await request(owner, "/session")).ownerId, owner.ownerId);
  await stop();
  console.log(
    JSON.stringify({
      unfinishedRequestBoundedExit: "PASS",
      atomicWriterReleaseOnExit: "PASS",
      restartIdentity: "PASS",
      testGraceMs: 2000,
      defaultGraceMs: 30000,
    }),
  );
}
async function run() {
  assert.ok(
    existsSync(".next/BUILD_ID"),
    "Build before the production shutdown test",
  );
  await nominal("websocket");
  await nominal("polling");
  await voiceDrain();
  await forced();
}
run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    await db.end();
  });
