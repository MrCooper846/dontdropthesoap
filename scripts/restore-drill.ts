import { assertProductionArtifacts } from "./release-artifacts";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  createHash,
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, type PoolClient } from "pg";
const base = "postgresql://soap:soap_local_only@localhost:55432/";
const sources = ["soap_test", "soap_league_recovery"];
const root = process.cwd(),
  folder = path.join(root, "data/restore-drills", randomUUID());
const origin = "https://soap-restore.invalid",
  local = "http://127.0.0.1:3113";
const pepper = randomBytes(32).toString("hex"),
  signing = randomBytes(32).toString("hex");
const admin = new Pool({ connectionString: base + "soap" });
const created = new Set<string>(),
  report: Record<string, unknown>[] = [];
let service: ChildProcess | undefined;
function compose(args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync(
      "docker",
      ["compose", "exec", "-T", "postgres", ...args],
      {
        cwd: root,
        input,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      Buffer.isBuffer(error.stderr)
    )
      writeFileSync(
        path.join(folder, "postgres-diagnostic-" + randomUUID() + ".log"),
        error.stderr,
        { mode: 0o600, flag: "wx" },
      );
    throw new Error(
      "PostgreSQL backup/restore command failed; see private restore-drill diagnostics",
    );
  }
}
async function waitFor<T>(
  check: () => Promise<T | false | undefined>,
  what: string,
): Promise<T> {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value as T;
    await delay(200);
  }
  throw Error("Timed out: " + what);
}
type Fingerprints = Record<string, { count: string; fingerprint: string }>;
async function fingerprints(
  db: PoolClient | Pool,
  only?: string[],
): Promise<Fingerprints> {
  const tables =
    only ??
    (
      await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map((r) => r.tablename);
  const result: Fingerprints = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    result[table] = (
      await db.query(
        "SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM \"" +
          table +
          '" t',
      )
    ).rows[0];
  }
  return result;
}
async function schema(db: PoolClient | Pool) {
  const constraints = (
    await db.query(
      "SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname",
    )
  ).rows;
  const triggers = (
    await db.query(
      "SELECT c.relname AS table_name,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    )
  ).rows;
  const functions = (
    await db.query(
      "SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)",
    )
  ).rows;
  const indexes = (
    await db.query(
      "SELECT c.relname AS table_name,i.relname AS index_name,pg_get_indexdef(i.oid,0,true) AS definition FROM pg_index k JOIN pg_class c ON c.oid=k.indrelid JOIN pg_class i ON i.oid=k.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,i.relname",
    )
  ).rows;
  return { constraints, triggers, functions, indexes };
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
async function start(directory: string, database: string) {
  assert.match(database, /^soap_restore_[a-f0-9]{32}$/);
  assert.ok(created.has(database));
  let output = "";
  service = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: directory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "3113",
      PUBLIC_ORIGIN: origin,
      DATABASE_URL: base + database,
      SESSION_SECRET_PEPPER: pepper,
      COMMAND_KEY_SIGNING_SECRET: signing,
      FEATURE_YARD: "false",
      FEATURE_LEAGUE: "true",
      FEATURE_VOICE: "false",
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
  await waitFor(async () => {
    if (service!.exitCode !== null || service!.signalCode !== null)
      throw Error("Restored service exited: " + output);
    try {
      return (await fetch(local + "/health/ready")).ok;
    } catch {
      return false;
    }
  }, "restored service readiness");
  assert.equal((await fetch(local + "/leagues")).status, 200);
  assert.equal((await fetch(local + "/api/v1/leagues")).status, 200);
}
// Exercise actual authenticated HTTP writes in the standalone match regression mode.
// The SQL backstop must hold even when the previous binary has no maintenance code.
async function pausedAdmission(cookie: string, db: Pool) {
  const session = await (
    await fetch(local + "/api/v1/session", { headers: { Cookie: cookie } })
  ).json();
  async function post(route: string, input: unknown) {
    return fetch(local + "/api/v1" + route, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "x-csrf-token": session.csrfToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  }
  const controller = await post("/controller/acquire", {});
  assert.equal(controller.status, 200);
  const { controllerEpoch } = await controller.json();
  const keyResponse = await post("/command-keys", {});
  assert.equal(keyResponse.status, 201);
  const { key } = await keyResponse.json();
  const before = (await db.query("SELECT count(*)::text AS n FROM matches"))
    .rows[0].n;
  const attempt = await post("/matches", {
    commandId: randomUUID(),
    key,
    controllerEpoch,
  });
  assert.ok(
    [409, 503].includes(attempt.status),
    "Paused admission must reject on both current and previous binaries",
  );
  assert.equal(
    (await db.query("SELECT count(*)::text AS n FROM matches")).rows[0].n,
    before,
    "No match may persist during maintenance",
  );
  const control = (await db.query("SELECT matches_open FROM service_controls"))
    .rows[0];
  assert.equal(control.matches_open, false);
}
async function restoreOne(
  source: string,
  rollback?: string,
  rollbackRevision?: string,
) {
  assert.ok(sources.includes(source));
  const migration = spawn(
    process.execPath,
    ["--import", "tsx", "server/persistence/migrate.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: base + source,
        FEATURE_VOICE: "false",
      },
      stdio: "ignore",
    },
  );
  assert.equal(
    await new Promise((resolve) => migration.once("exit", resolve)),
    0,
  );
  const sourcePool = new Pool({ connectionString: base + source });
  const seeded = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        'const {createGuest}=require("./server/auth/sessions.ts"); const {pool}=require("./server/persistence/db.ts"); createGuest("Pre-backup restore identity").then(value=>process.stdout.write(JSON.stringify(value))).finally(()=>pool.end()).catch(()=>{console.error("Restore session fixture failed");process.exitCode=1;});',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "production",
          PUBLIC_ORIGIN: origin,
          DATABASE_URL: base + source,
          SESSION_SECRET_PEPPER: pepper,
          COMMAND_KEY_SIGNING_SECRET: signing,
          FEATURE_VOICE: "false",
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  assert.match(seeded.ownerId, /^[a-f0-9-]{36}$/);
  assert.match(seeded.secret, /^[a-f0-9]{64}$/);
  const snapshot = await sourcePool.connect();
  const destination = "soap_restore_" + randomUUID().replaceAll("-", "");
  let before: Fingerprints,
    expectedSchema: unknown,
    plain: Buffer,
    backupTimestamp: string;
  const started = performance.now();
  try {
    await snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(
      (await snapshot.query("SELECT current_database() AS name")).rows[0].name,
      source,
    );
    const exported = (
      await snapshot.query(
        "SELECT pg_export_snapshot() AS token,clock_timestamp() AS timestamp",
      )
    ).rows[0];
    const token = exported.token;
    backupTimestamp = exported.timestamp.toISOString();
    before = await fingerprints(snapshot);
    expectedSchema = await schema(snapshot);
    assert.ok(Number(before.schema_migrations.count) >= 10);
    assert.ok(
      Number(before.round_results.count) > 0,
      "Source must contain real completed fixture decisions",
    );
    plain = compose([
      "pg_dump",
      "-U",
      "soap",
      "--dbname=" + source,
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--snapshot=" + token,
    ]);
    await snapshot.query("COMMIT");
  } finally {
    await snapshot.query("ROLLBACK");
    snapshot.release();
    try {
      // Remove only the identity this drill created, after the snapshot is closed.
      await sourcePool.query("DELETE FROM sessions WHERE owner_id=$1", [
        seeded.ownerId,
      ]);
      await sourcePool.query("DELETE FROM owners WHERE id=$1", [
        seeded.ownerId,
      ]);
    } finally {
      await sourcePool.end();
    }
  }
  const key = randomBytes(32),
    nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const archive = Buffer.concat([
    Buffer.from("SOAPBACKUP1"),
    nonce,
    cipher.getAuthTag(),
    encrypted,
  ]);
  const filename = path.join(folder, source + ".pgdump.aesgcm");
  writeFileSync(filename, archive, { mode: 0o600, flag: "wx" });
  const saved = readFileSync(filename),
    digest = createHash("sha256").update(saved).digest("hex");
  function recover(bytes: Buffer) {
    const header = Buffer.from("SOAPBACKUP1").length;
    assert.equal(bytes.subarray(0, header).toString(), "SOAPBACKUP1");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      bytes.subarray(header, header + 12),
    );
    decipher.setAuthTag(bytes.subarray(header + 12, header + 28));
    return Buffer.concat([
      decipher.update(bytes.subarray(header + 28)),
      decipher.final(),
    ]);
  }
  const tampered = Buffer.from(saved);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => recover(tampered));
  const recovered = recover(saved);
  assert.equal(
    createHash("sha256").update(recovered).digest("hex"),
    createHash("sha256").update(plain).digest("hex"),
  );
  await admin.query('CREATE DATABASE "' + destination + '"');
  created.add(destination);
  compose(
    [
      "pg_restore",
      "-U",
      "soap",
      "--dbname=" + destination,
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
    ],
    recovered,
  );
  const restored = new Pool({ connectionString: base + destination });
  try {
    assert.deepEqual(await fingerprints(restored), before);
    assert.deepEqual(await schema(restored), expectedSchema);
    const restoreMs = Math.round(performance.now() - started);
    const durableTables = [
      "round_results",
      "balance_entries",
      "league_settlements",
    ];
    const ledger = await fingerprints(restored, durableTables);
    await restored.query("UPDATE service_controls SET matches_open=false");
    await start(root, destination);
    const cookie = "dds_session=" + seeded.secret;
    const restoredSession = await fetch(local + "/api/v1/session", {
      headers: { Cookie: cookie },
    });
    assert.equal(
      restoredSession.status,
      200,
      "A session created before backup must still authenticate",
    );
    const session = await restoredSession.json();
    assert.equal(session.ownerId, seeded.ownerId);
    await pausedAdmission(cookie, restored);
    const publicBefore = await (await fetch(local + "/api/v1/leagues")).json();
    const restoredReadyMs = Math.round(performance.now() - started);
    await stop();
    assert.deepEqual(await fingerprints(restored, durableTables), ledger);
    if (rollback) {
      assert.equal(
        (
          await restored.query(
            "SELECT count(*) FROM matches WHERE phase IN ('countdown','collecting','revealing')",
          )
        ).rows[0].count,
        "0",
        "Drain active games before a binary rollback",
      );
      await start(rollback, destination);
      const response = await fetch(local + "/api/v1/session", {
        headers: { Cookie: cookie },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ownerId, session.ownerId);
      await pausedAdmission(cookie, restored);
      assert.deepEqual(
        await (await fetch(local + "/api/v1/leagues")).json(),
        publicBefore,
      );
      assert.deepEqual(await fingerprints(restored, durableTables), ledger);
      assert.ok(
        Number(
          (await fingerprints(restored, ["schema_migrations"]))
            .schema_migrations.count,
        ) >= 10,
      );
      await stop();
      await start(root, destination);
      const forward = await fetch(local + "/api/v1/session", {
        headers: { Cookie: cookie },
      });
      assert.equal(forward.status, 200);
      assert.equal((await forward.json()).ownerId, session.ownerId);
      await pausedAdmission(cookie, restored);
      await restored.query("UPDATE service_controls SET matches_open=true");
      assert.deepEqual(await fingerprints(restored, durableTables), ledger);
      await stop();
    }
    const summary = {
      source,
      backupTimestamp,
      encryptedArchive: path.relative(root, filename),
      encryptedBytes: archive.length,
      sha256: digest,
      validatedTables: Object.keys(before).length,
      rows: Object.fromEntries(
        Object.entries(before).map(([table, value]) => [
          table,
          Number(value.count),
        ]),
      ),
      restoreMs,
      restoredReadyMs,
      exactDataAndConstraints: "PASS",
      tamperDetection: "PASS",
      restoredProductionBoot: "PASS",
      preBackupSessionRestored: "PASS",
      ledgerPreservation: "PASS",
      rollback: rollback ? "PASS" : "NOT_RUN",
      rollbackRevision: rollbackRevision ?? null,
      pausedAdmissionAcrossBinaryChanges: rollback ? "PASS" : "CURRENT_ONLY",
      keyLifecycle: "EPHEMERAL_TEST_KEY_DISCARDED",
      publicTLS: "NOT_TESTED",
    };
    report.push(summary);
    writeFileSync(
      path.join(folder, source + ".report.json"),
      JSON.stringify(summary, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    console.log(JSON.stringify(summary));
  } finally {
    await stop();
    await restored.end();
  }
}
function verifyRollback(directory: string) {
  const revision = readFileSync(
    path.join(directory, "release-revision.txt"),
    "utf8",
  ).trim();
  assert.match(revision, /^[a-f0-9]{40}$/);
  execFileSync("git", ["merge-base", "--is-ancestor", revision, "HEAD"], {
    cwd: root,
    stdio: "pipe",
  });
  assert.notEqual(
    revision,
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  );
  const entries = execFileSync(
    "git",
    ["ls-tree", "-rz", "--full-tree", revision],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const entry of entries) {
    const match = /^([0-9]+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    assert.ok(match, "Unexpected rollback tree entry");
    const [, mode, hash, name] = match;
    assert.ok(
      mode === "100644" || mode === "100755",
      "Rollback source symlinks require a separate package review",
    );
    if (name === "next-env.d.ts") continue; // Next regenerates this declaration during a build.
    const resolved = path.resolve(directory, name);
    assert.ok(resolved.startsWith(directory + path.sep));
    const contents = readFileSync(resolved);
    const actual = createHash("sha1")
      .update(Buffer.from("blob " + contents.length + "\0"))
      .update(contents)
      .digest("hex");
    assert.equal(
      actual,
      hash,
      "Rollback source differs from committed revision: " + name,
    );
  }
  assert.notEqual(
    readFileSync(path.join(directory, ".next/BUILD_ID"), "utf8").trim(),
    readFileSync(path.join(root, ".next/BUILD_ID"), "utf8").trim(),
  );
  return revision;
}
async function run() {
  assert.ok(
    existsSync(path.join(root, ".next/BUILD_ID")),
    "Build current application first",
  );
  const rollback = process.env.SOAP_ROLLBACK_DIR
    ? path.resolve(process.env.SOAP_ROLLBACK_DIR)
    : undefined;
  if (process.argv.includes("--require-rollback"))
    assert.ok(
      rollback,
      "Set SOAP_ROLLBACK_DIR to a verified package from npm run prepare:rollback",
    );
  if (rollback) {
    assert.match(rollback, /^\/tmp\/soap-rollback-[a-f0-9]{32}$/);
    assertProductionArtifacts(rollback);
  }
  const revision = rollback ? verifyRollback(rollback) : undefined;
  for (const source of sources) {
    assert.ok(
      (
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          source,
        ])
      ).rowCount,
      "Run test:setup, test:integration and test:league-recovery to prepare isolated restore fixtures",
    );
  }
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  for (const source of sources) await restoreOne(source, rollback, revision);
  assert.ok(
    report.some((r) => (r.rows as Record<string, number>).balance_entries > 0),
    "Need casual settlement coverage",
  );
  assert.ok(
    report.some(
      (r) => (r.rows as Record<string, number>).league_settlements >= 6,
    ),
    "Need full league coverage",
  );
  return {
    restoreDrill: "PASS",
    rollbackDrill: rollback ? "PASS" : "NOT_RUN",
    sourceDatabases: "LOCAL_SYNTHETIC_FIXTURES",
    productionRTO: "NOT_ESTABLISHED",
  };
}
let completed: unknown;
run()
  .then((result) => {
    completed = result;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stop();
    for (const database of created) {
      assert.match(database, /^soap_restore_[a-f0-9]{32}$/);
      await admin.query('DROP DATABASE "' + database + '" WITH (FORCE)');
    }
    await admin.end();
    if (!process.exitCode)
      console.log(
        JSON.stringify({
          ...(completed as object),
          ownedDatabaseCleanup: "PASS",
        }),
      );
  })
  .catch(() => {
    console.error(
      "Restore drill cleanup failed; inspect its generated isolated databases",
    );
    process.exitCode = 1;
  });
