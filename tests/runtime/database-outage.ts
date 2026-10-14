import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
const name = "soap-outage-" + randomUUID().replaceAll("-", "");
const label = "soap.test=database-outage";
const origin = "http://127.0.0.1:3112";
const databaseURL =
  "postgresql://soap:soap_local_only@localhost:55434/soap_outage";
const env = {
  ...process.env,
  PORT: "3112",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: databaseURL,
  FEATURE_YARD: "false",
  FEATURE_VOICE: "false",
  FEATURE_LEAGUE: "false",
};
let created = false,
  service: ChildProcess | undefined;
function docker(...args: string[]) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function waitFor<T>(
  check: () => Promise<T | false | undefined>,
  what: string,
  ms = 30000,
): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value as T;
    await delay(150);
  }
  throw Error("Timed out: " + what);
}
async function start() {
  let output = "";
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  service.stderr!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  await waitFor(
    async () => {
      if (service!.exitCode !== null || service!.signalCode !== null)
        throw Error("Server exited: " + output);
      try {
        return (await fetch(origin + "/health/ready")).ok;
      } catch {
        return false;
      }
    },
    "game readiness",
    60000,
  );
}
async function stop() {
  const child = service;
  service = undefined;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  process.kill(-child.pid, "SIGTERM");
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
type Client = { cookie: string; csrf: string; ownerId: string; epoch: number };
async function request(c: Client, path: string, data?: unknown) {
  const r = await fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: c.cookie,
      "x-csrf-token": c.csrf,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error?.message ?? "HTTP " + r.status);
  return v;
}
async function guest(name: string): Promise<Client> {
  const r = await fetch(origin + "/api/v1/session/guest", {
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
    key,
    commandId: randomUUID(),
    controllerEpoch: c.epoch,
    ...payload,
  });
}
async function run() {
  docker("image", "inspect", "postgres:17-alpine"); // Never pull or stop the shared development database.
  docker(
    "create",
    "--name",
    name,
    "--label",
    label,
    "--publish",
    "127.0.0.1:55434:5432",
    "--env",
    "POSTGRES_USER=soap",
    "--env",
    "POSTGRES_PASSWORD=soap_local_only",
    "--env",
    "POSTGRES_DB=soap_outage",
    "postgres:17-alpine",
  );
  created = true;
  docker("start", name);
  await waitFor(async () => {
    try {
      return docker(
        "exec",
        name,
        "pg_isready",
        "-U",
        "soap",
        "-d",
        "soap_outage",
      ).includes("accepting connections");
    } catch {
      return false;
    }
  }, "isolated database");
  await start();
  const a = await guest("Outage human A"),
    b = await guest("Outage human B");
  const match = await resource(a, "/matches", {
    mode: "human",
    settings: { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
  });
  await resource(b, "/matches/" + match.id + "/join", {});
  let state = await request(a, "/matches/" + match.id);
  const sa = state.seats.find(
    (s: { ownerId: string }) => s.ownerId === a.ownerId,
  ).id;
  const sb = state.seats.find(
    (s: { ownerId: string }) => s.ownerId === b.ownerId,
  ).id;
  async function act(c: Client, type: string, seatId: string, payload: object) {
    const s = await request(c, "/matches/" + match.id);
    return request(c, "/commands", {
      v: 1,
      commandId: randomUUID(),
      controllerEpoch: c.epoch,
      type,
      matchId: match.id,
      matchVersion: s.version,
      round: s.round,
      seatId,
      payload,
    });
  }
  assert.equal((await act(a, "seat.ready", sa, { ready: true })).ok, true);
  assert.equal((await act(b, "seat.ready", sb, { ready: true })).ok, true);
  assert.equal((await act(a, "match.start", sa, {})).ok, true);
  await waitFor(async () => {
    state = await request(a, "/matches/" + match.id);
    return state.phase === "collecting";
  }, "collecting round");
  assert.equal((await act(a, "move.submit", sa, { move: "D" })).ok, true);
  assert.equal((await request(a, "/matches/" + match.id)).ownMove, "D");
  const child = service!;
  const died = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  docker("stop", "--time", "1", name);
  await waitFor(
    async () => child.exitCode !== null || child.signalCode !== null,
    "writer exits on lost DB ownership",
    15000,
  );
  await died;
  await delay(6000); // Longer than the real five-second decision window.
  docker("start", name);
  await waitFor(async () => {
    try {
      return docker(
        "exec",
        name,
        "pg_isready",
        "-U",
        "soap",
        "-d",
        "soap_outage",
      ).includes("accepting connections");
    } catch {
      return false;
    }
  }, "database returns");
  await start();
  const recovered = await request(a, "/matches/" + match.id);
  assert.equal(recovered.phase, "aborted");
  assert.equal(recovered.abortReason, "infrastructure");
  assert.equal(recovered.ownMove, "D");
  assert.equal(recovered.revealedMoves, undefined);
  assert.deepEqual(
    recovered.seats.map((s: { score: number }) => s.score),
    [0, 0],
  );
  assert.equal((await request(b, "/matches/" + match.id)).ownMove, null);
  const db = new Pool({ connectionString: databaseURL });
  try {
    assert.equal(
      (
        await db.query("SELECT count(*) FROM moves WHERE match_id=$1", [
          match.id,
        ])
      ).rows[0].count,
      "1",
    );
    assert.equal(
      (
        await db.query("SELECT 1 FROM round_results WHERE match_id=$1", [
          match.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
          match.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM match_events WHERE match_id=$1 AND type='match.infrastructure-interruption'",
          [match.id],
        )
      ).rowCount,
      1,
    );
  } finally {
    await db.end();
  }
  console.log(
    JSON.stringify({
      isolatedPhysicalDatabaseOutage: "PASS",
      lostWriterExit: "PASS",
      durableGapRecovery: "PASS",
      abortWithoutTimeoutScoring: "PASS",
      hiddenMovePreserved: "PASS",
      developmentDatabase: "UNTOUCHED",
    }),
  );
}
run()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    if (created) {
      const metadata = JSON.parse(docker("inspect", name))[0];
      assert.equal(metadata.Config.Labels["soap.test"], "database-outage");
      assert.equal(metadata.Name, "/" + name);
      docker("rm", "--force", "--volumes", name);
    }
  });
