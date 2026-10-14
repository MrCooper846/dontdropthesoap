import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { connect, type Socket as NetSocket } from "node:net";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
const origin = "https://soap-overload.invalid",
  local = "http://127.0.0.1:3116";
const database = "postgresql://soap:soap_local_only@localhost:55432/soap_load";
assert.equal(new URL(database).hostname, "localhost");
assert.equal(new URL(database).pathname, "/soap_load");
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "3116",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: database,
  SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
  COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  FEATURE_YARD: "false",
  FEATURE_VOICE: "false",
  FEATURE_LEAGUE: "false",
  MAX_PENDING_WORK: "32",
};
let service: ChildProcess | undefined,
  output = "";
const held: NetSocket[] = [];
async function until(check: () => Promise<boolean>, label: string, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (service?.exitCode !== null && service?.exitCode !== undefined)
      throw Error("Overload fixture service exited");
    if (await check()) return;
    await delay(100);
  }
  throw Error("Timed out: " + label);
}
function samples() {
  return output.split("\n").flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value.event === "service.metrics" ? [value] : [];
    } catch {
      return [];
    }
  });
}
async function stop() {
  for (const socket of held) socket.destroy();
  const child = service;
  if (!child?.pid || child.exitCode !== null) return;
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
    assert.equal(await exited, 0, "Overload fixture must drain normally");
  } finally {
    clearTimeout(timer);
    service = undefined;
  }
}
async function run() {
  assert.ok(
    existsSync(".next/BUILD_ID"),
    "Build before production overload check",
  );
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [service.stdout!, service.stderr!])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
  await until(async () => {
    try {
      return (await fetch(local + "/health/ready")).ok;
    } catch {
      return false;
    }
  }, "readiness");
  const guest = await fetch(local + "/api/v1/session/guest", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Private overload fixture" }),
  });
  assert.equal(guest.status, 201);
  const cookie = guest.headers.get("set-cookie")!.split(";")[0];
  await delay(500);
  for (let i = 0; i < 32; i++) {
    const socket = connect(3116, "127.0.0.1");
    held.push(socket);
    socket.on("error", () => {});
    let response = "";
    socket.on("data", (chunk) => {
      response += chunk.toString();
    });
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    socket.write(
      "POST /api/v1/session/guest HTTP/1.1\r\nHost: 127.0.0.1:3116\r\nOrigin: " +
        origin +
        "\r\nContent-Type: application/json\r\nContent-Length: 64\r\nConnection: keep-alive\r\n\r\n{",
    );
    await delay(400);
    assert.equal(
      response,
      "",
      "Slow fixture must be admitted, rather than hit a different rate limit",
    );
  }
  await until(
    async () => samples().some((s) => s.pendingWork === 32),
    "all 32 admissions observed",
    20000,
  );
  const excess = await fetch(local + "/api/v1/service");
  assert.equal(excess.status, 503);
  assert.equal(excess.headers.get("retry-after"), "1");
  assert.deepEqual(await excess.json(), {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "Service is busy. Please retry.",
      retryable: true,
    },
  });
  assert.equal(
    (await fetch(local + "/health/live")).status,
    200,
    "Liveness must remain available during saturation",
  );
  const socket = io(local + "/game-v1", {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: cookie },
    reconnection: false,
  });
  try {
    const failure = await new Promise<string>((resolve) => {
      socket.once("connect", () => resolve("unexpected connection"));
      socket.once("connect_error", (error) => resolve(error.message));
    });
    assert.equal(
      failure,
      "SERVICE_UNAVAILABLE",
      "Handshake overload must be retryable rather than an identity error",
    );
  } finally {
    socket.disconnect();
  }
  const atCapacity = samples()
    .filter((s) => s.pendingWork === 32)
    .at(-1);
  assert.equal(
    atCapacity.dbWaiting,
    0,
    "Incomplete bodies must not consume database pool slots",
  );
  assert.ok(samples().every((s) => s.pendingWork <= 32));
  for (const connection of held) connection.destroy();
  await until(async () => {
    try {
      return (await fetch(local + "/health/ready")).ok;
    } catch {
      return false;
    }
  }, "readiness after releasing capacity");
  const session = await fetch(local + "/api/v1/session", {
    headers: { Cookie: cookie },
  });
  assert.equal(
    session.status,
    200,
    "Earlier guest remains usable after saturation",
  );
  const recovered = io(local + "/game-v1", {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: cookie },
    reconnection: false,
  });
  try {
    const connected = await new Promise<string>((resolve) => {
      recovered.once("connect", () => resolve("connected"));
      recovered.once("connect_error", (error) => resolve(error.message));
    });
    assert.equal(
      connected,
      "connected",
      "Socket authentication recovers after releasing capacity",
    );
  } finally {
    recovered.disconnect();
  }
  await stop();
  assert.ok(
    !output.includes(cookie.split("=")[1]),
    "Metrics/logs must not contain a session secret",
  );
  const overloads = samples().reduce(
    (total, s) => total + s.counters["work.overload"],
    0,
  );
  assert.ok(overloads >= 2);
  console.log(
    JSON.stringify({
      physicalOverload: "PASS",
      testPendingCapacity: 32,
      defaultPendingCapacity: 256,
      http503AndRetry: "PASS",
      handshakeRetryable: "PASS",
      livenessAvailable: "PASS",
      capacityReleased: "PASS",
      socketAuthenticationRecovered: "PASS",
      sessionSecretAbsentFromLogs: "PASS",
      pendingPeak: Math.max(...samples().map((s) => s.pendingWork)),
      nominal32HumanLoad: "NOT_RUN",
      soak60Minutes: "NOT_RUN",
    }),
  );
}
run()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Overload fixture failed",
    );
    process.exitCode = 1;
  })
  .finally(stop);
