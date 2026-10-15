import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { connect, type Socket as NetSocket } from "node:net";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";
const local = "http://127.0.0.1:3118",
  origin = "https://soap-resources.invalid";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  PORT: "3118",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL: "postgresql://soap:soap_local_only@localhost:55432/soap_load",
  SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
  COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
  FEATURE_YARD: "false",
  FEATURE_VOICE: "false",
  FEATURE_LEAGUE: "false",
  FEATURE_VISUAL_BOTS: "false",
  FEATURE_EXTERNAL_BOTS: "true",
  MAX_PENDING_PER_OWNER: "2",
  MAX_SOCKETS_PER_OWNER: "2",
  HTTP_REQUEST_TIMEOUT_MS: "3000",
};
let service: ChildProcess | undefined,
  output = "";
const sockets: NetSocket[] = [];
type Client = { cookie: string; csrf: string; epoch: number };
async function until(check: () => Promise<boolean>, label: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (service?.exitCode !== null && service?.exitCode !== undefined)
      throw Error("Resource fixture exited");
    if (await check()) return;
    await delay(50);
  }
  throw Error("Timed out: " + label);
}
async function request(
  path: string,
  data?: unknown,
  headers: Record<string, string> = {},
) {
  return new Promise<{
    status: number;
    body: any;
    headers: Record<string, unknown>;
  }>((resolve, reject) => {
    const req = httpRequest(
      local + path,
      {
        method: data === undefined ? "GET" : "POST",
        agent: false,
        headers: {
          Origin: origin,
          Connection: "close",
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => {
          text += chunk.toString();
        });
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode!,
              body: JSON.parse(text),
              headers: res.headers,
            });
          } catch {
            reject(Error("Invalid fixture response"));
          }
        });
      },
    );
    req.on("error", reject);
    req.end(data === undefined ? undefined : JSON.stringify(data));
  });
}
async function api(c: Client, path: string, data?: unknown) {
  const result = await request("/api/v1" + path, data, {
    Cookie: c.cookie,
    "x-csrf-token": c.csrf,
  });
  assert.ok(result.status < 400, "Fixture setup HTTP " + result.status);
  return result.body;
}
async function guest(name: string): Promise<Client> {
  const result = await request("/api/v1/session/guest", { name });
  assert.equal(result.status, 201);
  const cookie = (result.headers["set-cookie"] as string[])[0].split(";")[0];
  const c = { cookie, csrf: "", epoch: 0 };
  c.csrf = (await api(c, "/session")).csrfToken;
  c.epoch = (await api(c, "/controller/acquire", {})).controllerEpoch;
  return c;
}
async function resource(c: Client, path: string, payload: unknown) {
  const { key } = await api(c, "/command-keys", {});
  return api(c, path, {
    key,
    commandId: randomUUID(),
    controllerEpoch: c.epoch,
    payload,
  });
}
async function start(overrides: Record<string, string> = {}) {
  output = "";
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: { ...env, ...overrides },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [service.stdout!, service.stderr!])
    stream.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
  await until(
    async () => {
      try {
        return (await request("/health/ready")).status === 200;
      } catch {
        return false;
      }
    },
    "readiness",
    45000,
  );
  await delay(100);
}
async function stop() {
  for (const socket of sockets) socket.destroy();
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
    assert.equal(await exited, 0, "Resource fixture must drain normally");
  } finally {
    clearTimeout(timer);
    service = undefined;
  }
}
async function raw(localAddress = "127.0.0.1") {
  const socket = connect({ host: "127.0.0.1", port: 3118, localAddress });
  sockets.push(socket);
  let closed = false,
    text = "";
  const started = performance.now();
  socket.on("error", () => {});
  socket.on("close", () => {
    closed = true;
  });
  socket.on("data", (chunk) => {
    text += chunk.toString();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  return {
    socket,
    get closed() {
      return closed;
    },
    get text() {
      return text;
    },
    started,
  };
}
async function socketAuth(c: Client) {
  const socket = io(local + "/game-v1", {
    transports: ["websocket"],
    extraHeaders: { Origin: origin, Cookie: c.cookie },
    reconnection: false,
    timeout: 5000,
  });
  try {
    return await new Promise<string>((resolve) => {
      socket.once("connect", () => resolve("connected"));
      socket.once("connect_error", (error) => resolve(error.message));
    });
  } finally {
    socket.disconnect();
  }
}
async function run() {
  assert.ok(existsSync(".next/BUILD_ID"), "Build before resource checks");
  await start();
  const a = await guest("Owner budget A");
  await delay(400);
  const b = await guest("Owner budget B");
  const bot = await resource(a, "/bots", { name: "Shared owner budget" });
  const token = await resource(a, "/bots/" + bot.id + "/credentials", {});
  const held = await Promise.all([raw(), raw()]);
  for (const connection of held)
    connection.socket.write(
      "POST /api/v1/commands HTTP/1.1\r\nHost: 127.0.0.1:3118\r\nOrigin: " +
        origin +
        "\r\nCookie: " +
        a.cookie +
        "\r\nx-csrf-token: " +
        a.csrf +
        "\r\nContent-Type: application/json\r\nContent-Length: 512\r\n\r\n{",
    );
  const drip = setInterval(() => {
    for (const connection of held)
      if (!connection.closed) connection.socket.write(" ");
  }, 200);
  try {
    await until(
      async () =>
        (await request("/api/v1/session", undefined, { Cookie: a.cookie }))
          .status === 503,
      "owner isolation",
    );
    const denied = await request("/api/v1/session", undefined, {
      Cookie: a.cookie,
    });
    assert.equal(denied.status, 503);
    assert.equal(denied.body.error.retryable, true);
    assert.equal(
      (
        await request("/api/v1/bot/assignments", undefined, {
          Authorization: "Bearer " + token.secret,
        })
      ).status,
      503,
      "Owned bot credentials share the human owner's budget",
    );
    assert.equal(
      (await request("/api/v1/session", undefined, { Cookie: b.cookie }))
        .status,
      200,
      "Another owner remains available",
    );
    assert.equal(await socketAuth(a), "SERVICE_UNAVAILABLE");
    assert.equal(await socketAuth(b), "connected");
    await until(
      async () => held.every((c) => c.closed),
      "absolute body deadline despite drip",
      6500,
    );
    for (const connection of held) {
      assert.match(connection.text, /^HTTP\/1.1 408/);
      assert.ok(performance.now() - connection.started < 7000);
    }
  } finally {
    clearInterval(drip);
  }
  assert.equal(
    (await request("/api/v1/session", undefined, { Cookie: a.cookie })).status,
    200,
    "Body cancellation releases owner and global work",
  );
  assert.equal(await socketAuth(a), "connected");
  async function open(headers: Record<string, string>) {
    const socket = io(local + "/game-v1", {
      transports: ["websocket"],
      extraHeaders: { Origin: origin, ...headers },
      reconnection: false,
      timeout: 5000,
    });
    const result = await new Promise<string>((resolve) => {
      socket.once("connect", () => resolve("connected"));
      socket.once("connect_error", (error) => resolve(error.message));
    });
    return { socket, result };
  }
  const human = await open({ Cookie: a.cookie }),
    external = await open({ Authorization: "Bearer " + token.secret });
  try {
    assert.equal(human.result, "connected");
    assert.equal(external.result, "connected");
    assert.equal(
      (await request("/api/v1/session", undefined, { Cookie: a.cookie }))
        .status,
      200,
      "Open sockets do not consume permanent work slots",
    );
    assert.equal(
      await socketAuth(a),
      "SERVICE_UNAVAILABLE",
      "Browser and bot share open-connection capacity",
    );
    assert.equal(await socketAuth(b), "connected");
    human.socket.disconnect();
    await delay(100);
    assert.equal(
      await socketAuth(a),
      "connected",
      "Namespace disconnect releases its owner slot",
    );
  } finally {
    human.socket.disconnect();
    external.socket.disconnect();
  }
  assert.ok(!output.includes(a.cookie.split("=")[1]));
  assert.ok(!output.includes(token.secret));
  await stop();
  console.log(
    JSON.stringify({
      ownerIsolation: "PASS",
      browserAndBotShareBudget: "PASS",
      otherOwnerAvailable: "PASS",
      socketIsolationAndRecovery: "PASS",
      sharedOwnerConnectionLimitAndRelease: "PASS",
      absoluteDrippingBodyDeadline: "PASS",
      testOwnerCapacity: 2,
      defaultOwnerCapacity: 8,
      testReceiveMs: 3000,
      defaultReceiveMs: 30000,
    }),
  );
  await start({
    MAX_TCP_CONNECTIONS: "8",
    MAX_TCP_PER_IP: "4",
    HTTP_REQUEST_TIMEOUT_MS: "5000",
  });
  const accepted: Awaited<ReturnType<typeof raw>>[] = [];
  for (const address of ["127.0.0.1", "127.0.0.2"]) {
    for (let i = 0; i < 4; i++) {
      const c = await raw(address);
      c.socket.write("GET / HTTP/1.1\r\nHost:");
      accepted.push(c);
      await delay(30);
      assert.equal(c.closed, false);
    }
    const denied = await raw(address);
    denied.socket.write(
      "GET /health/live HTTP/1.1\r\nHost: x\r\nX-Forwarded-For: 203.0.113.50\r\n\r\n",
    );
    await until(async () => denied.closed, "source address ceiling", 1000);
    assert.ok(!denied.text.includes("200 OK"));
  }
  const globalDenied = await raw("127.0.0.3");
  globalDenied.socket.write("GET /health/live HTTP/1.1\r\nHost: x\r\n\r\n");
  await until(async () => globalDenied.closed, "global TCP ceiling", 1000);
  for (const c of accepted) assert.equal(c.closed, false);
  await until(
    async () => accepted.every((c) => c.closed),
    "incomplete header deadline",
    6500,
  );
  assert.equal(
    (await request("/health/live")).status,
    200,
    "Expired headers release TCP capacity",
  );
  const replacement = await raw();
  replacement.socket.write(
    "GET /health/live HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
  );
  await until(async () => replacement.closed, "replacement HTTP request");
  assert.match(replacement.text, /^HTTP\/1.1 200/);
  await stop();
  console.log(
    JSON.stringify({
      globalAndPerAddressTcpLimits: "PASS",
      forwardedHeaderCannotBypassPeerLimit: "PASS",
      incompleteHeaderDeadline: "PASS",
      connectionSlotsRecovered: "PASS",
      testTcpCapacity: 8,
      testPerAddressCapacity: 4,
      defaultTcpCapacity: 1024,
      defaultPerAddressCapacity: 256,
    }),
  );
}
run()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Resource fixture failed",
    );
    process.exitCode = 1;
  })
  .finally(stop);
