import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const origin = "http://127.0.0.1:3102";
let service: ChildProcess | undefined;
const env = {
  ...process.env,
  PORT: "3102",
  FEATURE_YARD: "false",
  PUBLIC_ORIGIN: origin,
  DATABASE_URL:
    "postgresql://soap:soap_local_only@localhost:55432/soap_recovery",
};
async function stop(signal: NodeJS.Signals = "SIGTERM") {
  if (!service?.pid) return;
  const p = service;
  const exited = new Promise<void>((resolve) =>
    p.once("exit", () => resolve()),
  );
  process.kill(-p.pid!, signal);
  await Promise.race([
    exited,
    delay(10000).then(() => {
      if (p.exitCode === null && p.signalCode === null)
        process.kill(-p.pid!, "SIGKILL");
    }),
  ]);
  service = undefined;
}
async function start() {
  let output = "";
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: process.cwd(),
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout!.on("data", (chunk) => (output += chunk));
  service.stderr!.on("data", (chunk) => (output += chunk));
  for (let i = 0; i < 120; i++) {
    if (service.exitCode !== null) throw new Error(output);
    try {
      const r = await fetch(origin + "/health/ready");
      if (r.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error("Service did not become ready: " + output);
}
type Client = { cookie: string; csrf: string; epoch: number; ownerId: string };
async function request(c: Client, path: string, data?: unknown) {
  const r = await fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: c.cookie,
      "x-csrf-token": c.csrf,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(result));
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
    epoch: 0,
    ownerId: "",
  };
  const s = await request(c, "/session");
  c.csrf = s.csrfToken;
  c.ownerId = s.ownerId;
  c.epoch = (await request(c, "/controller/acquire", {})).controllerEpoch;
  return c;
}
async function singleton() {
  const second = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    env: { ...env, PORT: "3103" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  second.stderr.on("data", (c) => (output += c));
  const code = await new Promise<number | null>((resolve) =>
    second.once("exit", resolve),
  );
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(output.trim()), {
    event: "service.startup.failed",
    code: "WRITER_ALREADY_RUNNING",
  });
}
async function externalRecovery() {
  const human = await guest("External recovery human"),
    owner = await guest("External recovery owner");
  async function resource(path: string, payload: unknown) {
    const { key } = await request(owner, "/command-keys", {});
    return request(owner, path, {
      key,
      commandId: randomUUID(),
      controllerEpoch: owner.epoch,
      payload,
    });
  }
  const bot = await resource("/bots", { name: "Recovery snake" }),
    credential = await resource("/bots/" + bot.id + "/credentials", {});
  let runner: ChildProcess | undefined;
  function launch() {
    runner = spawn(
      process.execPath,
      ["--import", "tsx", "examples/bots/client.ts"],
      {
        env: {
          ...process.env,
          SOAP_URL: origin,
          SOAP_BOT_TOKEN: credential.secret,
          SOAP_STRATEGY: "betray",
        },
        stdio: "ignore",
      },
    );
  }
  async function waitFor(check: () => Promise<boolean>) {
    for (let i = 0; i < 80; i++) {
      if (await check()) return;
      await delay(250);
    }
    throw new Error("External recovery condition did not become true");
  }
  try {
    launch();
    await waitFor(async () => {
      const { bots } = await request(owner, "/bots");
      return !!bots.find(
        (b: { id: string; online: boolean }) => b.id === bot.id,
      )?.online;
    });
    const { key } = await request(human, "/command-keys", {}),
      { id } = await request(human, "/matches", {
        key,
        commandId: randomUUID(),
        controllerEpoch: human.epoch,
        mode: "mixed",
        settings: { rounds: 5, decisionMs: 10000, revealMs: 1000, maxSeats: 8 },
      });
    const joinKey = await request(owner, "/command-keys", {});
    await request(owner, "/matches/" + id + "/join", {
      key: joinKey.key,
      commandId: randomUUID(),
      controllerEpoch: owner.epoch,
      botId: bot.id,
    });
    let state = await request(human, "/matches/" + id);
    const hs = state.seats.find((s: { kind: string }) => s.kind === "human").id,
      bs = state.seats.find((s: { botId: string }) => s.botId === bot.id).id;
    function command(
      c: Client,
      type: string,
      seatId: string,
      payload: unknown,
    ) {
      return {
        v: 1,
        commandId: randomUUID(),
        controllerEpoch: c.epoch,
        type,
        matchId: id,
        seatId,
        round: state.round,
        matchVersion: state.version,
        payload,
      };
    }
    assert.equal(
      (
        await request(
          human,
          "/commands",
          command(human, "seat.ready", hs, { ready: true }),
        )
      ).ok,
      true,
    );
    assert.equal(
      (
        await request(
          owner,
          "/commands",
          command(owner, "seat.ready", bs, { ready: true }),
        )
      ).ok,
      true,
    );
    state = await request(human, "/matches/" + id);
    assert.equal(
      (await request(human, "/commands", command(human, "match.start", hs, {})))
        .ok,
      true,
    );
    await waitFor(async () => {
      const s = await request(owner, "/matches/" + id);
      return s.phase === "collecting" && s.ownMove === "D";
    });
    await stop("SIGKILL");
    await start();
    state = await request(human, "/matches/" + id);
    assert.equal(state.ownMove, null);
    assert.equal(state.interruptions, 1);
    assert.equal((await request(owner, "/matches/" + id)).ownMove, "D");
    human.epoch = (
      await request(human, "/controller/acquire", {})
    ).controllerEpoch;
    for (let round = 1; round <= 5; round++) {
      await waitFor(async () => {
        state = await request(human, "/matches/" + id);
        return state.phase === "collecting" && state.round === round;
      });
      if (round === 3) {
        await waitFor(async () => {
          return (await request(owner, "/matches/" + id)).ownMove === "D";
        });
        runner?.kill("SIGTERM");
        await new Promise<void>((resolve) =>
          runner!.once("exit", () => resolve()),
        );
        launch();
      }
      assert.equal(
        (
          await request(
            human,
            "/commands",
            command(human, "move.submit", hs, { move: "C" }),
          )
        ).ok,
        true,
      );
    }
    await waitFor(async () => {
      state = await request(human, "/matches/" + id);
      return state.phase === "finished";
    });
    assert.equal(
      state.seats.find((s: { id: string }) => s.id === hs).score,
      -10,
    );
    assert.equal(
      state.seats.find((s: { id: string }) => s.id === bs).score,
      15,
    );
    console.log(
      "External bot recovery passed: accepted bot decision survives a physical server crash, remains private, client reacquires fenced lease, bot process reconnects mid-match, and the full game scores once.",
    );
  } finally {
    runner?.kill("SIGTERM");
  }
}

async function run() {
  await start();
  await singleton();
  const a = await guest("Recovery A"),
    b = await guest("Recovery B"),
    { key } = await request(a, "/command-keys", {});
  const { id } = await request(a, "/matches", {
    commandId: randomUUID(),
    key,
    controllerEpoch: a.epoch,
    settings: { rounds: 5, decisionMs: 10000, revealMs: 1000, maxSeats: 8 },
  });
  const guestKey = await request(b, "/command-keys", {});
  await request(b, "/matches/" + id + "/join", {
    key: guestKey.key,
    controllerEpoch: b.epoch,
    commandId: randomUUID(),
  });
  let state = await request(a, "/matches/" + id);
  const sa = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === a.ownerId,
    ).id,
    sb = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === b.ownerId,
    ).id;
  const cmd = (
    c: Client,
    type: string,
    seatId: string,
    payload: unknown,
    round = 0,
    version?: number,
  ) => ({
    v: 1,
    commandId: randomUUID(),
    type,
    controllerEpoch: c.epoch,
    matchId: id,
    seatId,
    round,
    matchVersion: version,
    payload,
  });
  await request(a, "/commands", cmd(a, "seat.ready", sa, { ready: true }));
  await request(b, "/commands", cmd(b, "seat.ready", sb, { ready: true }));
  state = await request(a, "/matches/" + id);
  await request(
    a,
    "/commands",
    cmd(a, "match.start", sa, {}, 0, state.version),
  );
  do {
    await delay(250);
    state = await request(a, "/matches/" + id);
  } while (state.phase !== "collecting");
  const move = cmd(a, "move.submit", sa, { move: "D" }, 1);
  assert.equal((await request(a, "/commands", move)).ok, true);
  await stop("SIGKILL");
  await start();
  state = await request(a, "/matches/" + id);
  assert.equal(state.ownMove, "D");
  assert.equal(state.interruptions, 1);
  assert.equal((await request(b, "/matches/" + id)).ownMove, null);
  assert.equal(
    (await request(a, "/commands", cmd(a, "move.submit", sa, { move: "C" }, 1)))
      .error.code,
    "CONTROLLER_STALE",
  );
  for (const c of [a, b])
    c.epoch = (await request(c, "/controller/acquire", {})).controllerEpoch;
  assert.equal(
    (await request(b, "/commands", cmd(b, "move.submit", sb, { move: "C" }, 1)))
      .ok,
    true,
  );
  state = await request(a, "/matches/" + id);
  assert.equal(state.seats.find((s: { id: string }) => s.id === sa).score, 3);
  await stop("SIGKILL");
  await start();
  state = await request(a, "/matches/" + id);
  assert.equal(state.phase, "aborted");
  assert.equal(state.interruptions, 2);
  console.log(
    "Physical crash/restart passed: singleton exclusion, durable hidden move, renewed deadline, epoch fencing, no duplicate score, second-interruption abort.",
  );
}
run()
  .then(() => externalRecovery())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => stop());
