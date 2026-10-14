import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { Pool } from "pg";
import { createWorker } from "mediasoup";
import { starter } from "../shared/bots/presets";
const databaseURL =
  "postgresql://soap:soap_local_only@localhost:55432/soap_release_smoke";
const origin = "https://soap-smoke.invalid",
  local = "http://127.0.0.1:3111";
let service: ChildProcess | undefined;
async function run() {
  assert.ok(
    existsSync(".next/BUILD_ID"),
    "Build the application before packaging",
  );
  assert.ok(
    existsSync("dist/workers/visual-worker.mjs"),
    "Package the compiled visual worker",
  );
  assert.equal(
    existsSync("node_modules/vitest"),
    false,
    "Run this smoke from a clean npm ci --omit=dev installation",
  );
  const admin = new Pool({
    connectionString: databaseURL.replace("/soap_release_smoke", "/soap"),
  });
  try {
    if (
      !(
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          "soap_release_smoke",
        ])
      ).rowCount
    )
      await admin.query('CREATE DATABASE "soap_release_smoke"');
  } finally {
    await admin.end();
  }
  const media = await createWorker({ logLevel: "error" });
  media.close();
  let output = "";
  service = spawn("npm", ["start"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "3111",
      PUBLIC_ORIGIN: origin,
      DATABASE_URL: databaseURL,
      SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
      COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
      FEATURE_VOICE: "false",
      FEATURE_LEAGUE: "true",
      FEATURE_YARD: "true",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  service.stdout!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  service.stderr!.on("data", (c) => {
    output = (output + c).slice(-12000);
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (service.exitCode !== null || service.signalCode !== null)
      throw Error("Production process exited: " + output);
    try {
      if ((await fetch(local + "/health/ready")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, "Production process readiness: " + output);
  for (const path of ["/yard", "/bots/build", "/leagues"]) {
    const r = await fetch(local + path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get("content-type") ?? "", /text\/html/);
  }
  const guest = await fetch(local + "/api/v1/session/guest", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Production smoke" }),
  });
  assert.equal(guest.status, 201);
  assert.match(guest.headers.get("set-cookie") ?? "", /Secure/);
  const cookie = guest.headers.get("set-cookie")!.split(";")[0];
  const session = await (
    await fetch(local + "/api/v1/session", { headers: { Cookie: cookie } })
  ).json();
  const preview = await fetch(local + "/api/v1/bots/preview", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "x-csrf-token": session.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      controllerEpoch: session.controllerEpoch,
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
    }),
  });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json()).move, "C");
  assert.equal((await fetch(local + "/api/v1/leagues")).status, 200);
  console.log(
    JSON.stringify({
      productionOnlyInstall: "PASS",
      npmStart: "PASS",
      migrationsAndReadiness: "PASS",
      builtPages: "PASS",
      secureCookie: "PASS",
      compiledVisualWorker: "PASS",
      nativeMediaBinary: "PASS",
      publicTLS: "NOT_TESTED",
    }),
  );
}
run()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (
      service?.pid &&
      service.exitCode === null &&
      service.signalCode === null
    ) {
      const child = service;
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      process.kill(-child.pid!, "SIGTERM");
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
  });
