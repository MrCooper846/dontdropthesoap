import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { createWorker } from "mediasoup";
import { starter } from "../shared/bots/presets";
const databaseName = "soap_release_smoke_" + randomUUID().replaceAll("-", "");
const databaseURL =
  "postgresql://soap:soap_local_only@localhost:55432/" + databaseName;
const adminURL = "postgresql://soap:soap_local_only@localhost:55432/soap";
let createdDatabase = false;
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
  assert.match(databaseName, /^soap_release_smoke_[a-f0-9]{32}$/);
  const target = new URL(databaseURL);
  assert.equal(target.hostname, "localhost");
  assert.equal(target.port, "55432");
  const admin = new Pool({ connectionString: adminURL });
  try {
    await admin.query('CREATE DATABASE "' + databaseName + '"');
    createdDatabase = true;
  } finally {
    await admin.end();
  }
  const fresh = new Pool({ connectionString: databaseURL });
  try {
    assert.equal(
      Number(
        (
          await fresh.query(
            "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].n,
      ),
      0,
      "Fresh smoke database must start empty",
    );
  } finally {
    await fresh.end();
  }
  const revision = readFileSync("release-revision.txt", "utf8").trim();
  assert.match(revision, /^[a-f0-9]{40}$/);
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
      SOAP_LEGACY: "true",
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
  assert.equal((await fetch(local + "/api/leaderboard?probe=1")).status, 404);
  const legacyPage = await fetch(local + "/create?probe=1", {
    redirect: "manual",
  });
  assert.equal(legacyPage.status, 302);
  assert.equal(legacyPage.headers.get("location"), "/yard");
  const failed = await fetch(local + "/api/v1/session", {
    headers: { "X-Request-ID": "untrusted-request-id" },
  });
  assert.equal(failed.status, 401);
  assert.match(failed.headers.get("x-request-id") ?? "", /^[a-f0-9-]{36}$/);
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
      revision,
      buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
      legacyIsolation: "PASS",
      requestCorrelation: "PASS",
      productionOnlyInstall: "PASS",
      npmStart: "PASS",
      migrationsAndReadiness: "PASS",
      freshDatabase: "PASS",
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
      const exited = new Promise<number | null>((resolve) =>
        child.once("exit", resolve),
      );
      process.kill(-child.pid!, "SIGTERM");
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {}
      }, 10000);
      try {
        assert.equal(
          await exited,
          0,
          "Production smoke service must drain normally",
        );
      } finally {
        clearTimeout(timer);
      }
    }
    if (createdDatabase) {
      assert.match(databaseName, /^soap_release_smoke_[a-f0-9]{32}$/);
      const admin = new Pool({ connectionString: adminURL });
      try {
        await admin.query('DROP DATABASE "' + databaseName + '"');
      } finally {
        await admin.end();
      }
    }
  });
