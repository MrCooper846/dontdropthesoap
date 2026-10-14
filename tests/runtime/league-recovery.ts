import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { starter } from "../../shared/bots/presets";
const origin = "http://127.0.0.1:3110";
const databaseURL =
  "postgresql://soap:soap_local_only@localhost:55432/soap_league_recovery";
const target = new URL(databaseURL);
if (
  target.hostname !== "localhost" ||
  target.port !== "55432" ||
  target.pathname !== "/soap_league_recovery"
)
  throw Error("Only isolated local league recovery database is allowed");
const db = new Pool({ connectionString: databaseURL });
const env = {
  ...process.env,
  PORT: "3110",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: databaseURL,
  FEATURE_LEAGUE: "true",
  FEATURE_VISUAL_BOTS: "true",
  FEATURE_YARD: "false",
};
let service: ChildProcess | undefined, runner: ChildProcess | undefined;
type Client = { cookie: string; csrf: string; ownerId: string; epoch: number };
async function waitFor<T>(
  check: () => Promise<T | undefined | false>,
  label: string,
  timeout = 30000,
): Promise<T> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value as T;
    await delay(150);
  }
  throw Error("Timed out: " + label);
}
async function start() {
  let output = "";
  const child = (service = spawn(
    process.execPath,
    ["--import", "tsx", "server.ts"],
    { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  ));
  child.stdout!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  child.stderr!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  await waitFor(
    async () => {
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error("Server exited: " + output);
      try {
        return (await fetch(origin + "/health/ready")).ok;
      } catch {
        return false;
      }
    },
    "server readiness",
    60000,
  );
}
async function stop(signal: NodeJS.Signals = "SIGTERM") {
  const child = service;
  service = undefined;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  process.kill(-child.pid, signal);
  const timer = setTimeout(() => {
    try {
      process.kill(-child.pid!, "SIGKILL");
    } catch {}
  }, 10000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
async function request(c: Client | undefined, path: string, data?: unknown) {
  const response = await fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(c ? { Cookie: c.cookie, "x-csrf-token": c.csrf } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error?.message ?? "HTTP " + response.status);
  return result;
}
async function guest(name: string): Promise<Client> {
  const r = await fetch(origin + "/api/v1/session/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ name }),
  });
  assert.equal(r.status, 201);
  const c = {
    cookie: r.headers.get("set-cookie")!.split(";")[0],
    csrf: "",
    ownerId: "",
    epoch: 0,
  };
  const session = await request(c, "/session");
  c.csrf = session.csrfToken;
  c.ownerId = session.ownerId;
  c.epoch = session.controllerEpoch;
  return c;
}
async function resource(c: Client, path: string, payload: unknown) {
  const { key } = await request(c, "/command-keys", {});
  return request(c, path, {
    key,
    commandId: randomUUID(),
    controllerEpoch: c.epoch,
    payload,
  });
}
async function run() {
  const migration = spawn(
    process.execPath,
    ["--import", "tsx", "server/persistence/migrate.ts"],
    { env, stdio: "ignore" },
  );
  assert.equal(
    await new Promise((resolve) => migration.once("exit", resolve)),
    0,
  );
  assert.equal(
    (await db.query("SELECT current_database() AS name")).rows[0].name,
    "soap_league_recovery",
  );
  await db.query("TRUNCATE owners CASCADE");
  await start();
  const owners: Client[] = [],
    botIds: string[] = [];
  let credential = "";
  for (let i = 0; i < 4; i++) {
    if (i) await delay(400);
    const owner = await guest("Crash league " + i);
    owners.push(owner);
    const bot = await resource(
      owner,
      i === 0 ? "/bots" : "/bots/visual",
      i === 0
        ? { name: "Recovery external" }
        : { name: "Recovery visual " + i, workspace: starter("cooperate") },
    );
    botIds.push(bot.id);
    if (i === 0)
      credential = (
        await resource(owner, "/bots/" + bot.id + "/credentials", {})
      ).secret;
  }
  runner = spawn(
    process.execPath,
    ["--import", "tsx", "examples/bots/client.ts"],
    {
      env: {
        ...process.env,
        SOAP_URL: origin,
        SOAP_BOT_TOKEN: credential,
        SOAP_STRATEGY: "cooperate",
      },
      stdio: "ignore",
    },
  );
  await waitFor(
    async () =>
      (await request(owners[0], "/bots")).bots.find(
        (b: { id: string; online: boolean }) => b.id === botIds[0],
      )?.online,
    "external connection",
  );
  const batch = await resource(owners[0], "/leagues", {
    name: "Physical recovery batch",
  });
  for (let i = 0; i < 4; i++)
    await resource(owners[i], "/leagues/" + batch.id + "/register", {
      botId: botIds[i],
    });
  await resource(owners[0], "/leagues/" + batch.id + "/close", {});
  const entry = (await request(undefined, "/leagues/" + batch.id)).entries.find(
    (e: { botId: string }) => e.botId === botIds[0],
  );
  const fixture = await waitFor(async () => {
    const d = await request(undefined, "/leagues/" + batch.id);
    return d.fixtures.find(
      (f: { state: string; a: string; b: string }) =>
        f.state === "active" && (f.a === entry.id || f.b === entry.id),
    );
  }, "first external fixture");
  process.kill(runner.pid!, "SIGSTOP");
  const committed = await waitFor(async () => {
    const row = (
      await db.query("SELECT state_json FROM matches WHERE id=$1", [
        fixture.currentMatchId,
      ])
    ).rows[0].state_json;
    return row.phase === "collecting" && Object.keys(row.moves).length === 1
      ? row
      : false;
  }, "committed hidden visual move");
  const visual = committed.seats.find(
    (s: { kind: string }) => s.kind === "visual",
  );
  const viewer = owners.find((o) => o.ownerId === visual.ownerId)!;
  assert.equal(
    (await request(viewer, "/matches/" + committed.id)).ownMove,
    "C",
  );
  assert.equal(
    (await request(undefined, "/leagues/fixtures/" + fixture.id + "/replay"))
      .results.length,
    0,
  );
  await stop("SIGKILL");
  await start();
  const recovered = await request(viewer, "/matches/" + committed.id);
  assert.equal(recovered.interruptions, 1);
  assert.equal(recovered.ownMove, "C");
  assert.equal(recovered.round, committed.round);
  assert.ok(recovered.deadline > committed.deadline);
  console.log(
    "PASS: committed hidden visual decision survives a physical server SIGKILL",
  );
  await stop("SIGKILL");
  await start();
  const aborted = await request(
    undefined,
    "/leagues/fixtures/" + fixture.id + "/replay?attempt=1",
  );
  assert.equal(aborted.match.phase, "aborted");
  assert.equal(aborted.results.length, 0);
  assert.equal(
    (
      await db.query("SELECT 1 FROM league_settlements WHERE fixture_id=$1", [
        fixture.id,
      ])
    ).rowCount,
    0,
  );
  process.kill(runner.pid!, "SIGCONT");
  await waitFor(
    async () => {
      const d = await request(undefined, "/leagues/" + batch.id);
      const f = d.fixtures.find((f: { id: string }) => f.id === fixture.id);
      return f.attempts >= 2 && f.currentMatchId !== committed.id;
    },
    "new attempt after disconnected external reconnect",
    120000,
  );
  console.log(
    "PASS: second interruption aborts without credit; real external client reconnects into a new fixture attempt",
  );
  const final = await waitFor(
    async () => {
      const d = await request(undefined, "/leagues/" + batch.id);
      return d.batch.state === "finished" ? d : false;
    },
    "full recovered batch completion",
    240000,
  );
  assert.equal(final.fixtures.length, 6);
  assert.ok(
    final.fixtures.every((f: { state: string }) => f.state === "settled"),
  );
  assert.deepEqual(
    final.standings.map(
      (s: { rank: number; points: number; played: number }) => [
        s.rank,
        s.points,
        s.played,
      ],
    ),
    Array(4).fill([1, 60, 3]),
  );
  const ledgerBefore = (
    await db.query(
      "SELECT s.* FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1 ORDER BY s.fixture_id",
      [batch.id],
    )
  ).rows;
  assert.equal(ledgerBefore.length, 6);
  await stop("SIGKILL");
  await start();
  assert.deepEqual(
    (await request(undefined, "/leagues/" + batch.id)).standings,
    final.standings,
  );
  const ledgerAfter = (
    await db.query(
      "SELECT s.* FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1 ORDER BY s.fixture_id",
      [batch.id],
    )
  ).rows;
  assert.deepEqual(ledgerAfter, ledgerBefore);
  const publicReplay = await request(
    undefined,
    "/leagues/fixtures/" + fixture.id + "/replay",
  );
  assert.ok(publicReplay.attempt >= 2);
  assert.equal(publicReplay.results.length, 20);
  assert.equal(
    (
      await db.query(
        "SELECT 1 FROM balance_entries WHERE owner_id=ANY($1::uuid[])",
        [owners.map((o) => o.ownerId)],
      )
    ).rowCount,
    0,
  );
  console.log(
    "PASS: all six mixed-bot fixtures finish; post-settlement SIGKILL/restart preserves exactly six league credits and no casual credit",
  );
}
run()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (runner?.pid && runner.exitCode === null && runner.signalCode === null) {
      try {
        process.kill(runner.pid, "SIGCONT");
        runner.kill("SIGTERM");
      } catch {}
    }
    await stop();
    await db.end();
  });
