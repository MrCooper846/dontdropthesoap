import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sentinel = "private-startup-sentinel-6271";
for (const [entrypoint, event] of [
  ["server.ts", "service.startup.failed"],
  ["server/persistence/migrate.ts", "migration.failed"],
]) {
  for (const injection of [
    { NODE_ENV: sentinel },
    {
      DATABASE_URL:
        "postgresql://invalid_user_" +
        sentinel +
        ":" +
        sentinel +
        "@127.0.0.1:55432/soap_test",
    },
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", entrypoint],
      {
        env: { ...process.env, ...injection } as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(result.status, 1);
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, new RegExp(sentinel));
    assert.deepEqual(JSON.parse(result.stderr.trim()), {
      event,
      code: "SERVICE_UNAVAILABLE",
    });
  }
}
const folder = mkdtempSync(path.join(tmpdir(), "soap-fatal-privacy-"));
try {
  for (const failure of ["throw new Error", "Promise.reject(new Error"]) {
    const entry = path.join(folder, "probe.mjs");
    const expression = failure.startsWith("throw")
      ? "throw new Error(" + JSON.stringify(sentinel) + ")"
      : "Promise.reject(new Error(" + JSON.stringify(sentinel) + "))";
    writeFileSync(
      entry,
      "await import(" +
        JSON.stringify(pathToFileURL(path.resolve("server.ts")).href) +
        ");\n" +
        "setTimeout(() => { " +
        expression +
        "; }, 0);\n",
    );
    const result = spawnSync(process.execPath, ["--import", "tsx", entry], {
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:55439/unused",
      },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
    assert.deepEqual(JSON.parse(result.stderr.trim()), {
      event: "service.fatal",
      code: "SERVICE_UNAVAILABLE",
    });
  }
} finally {
  rmSync(folder, { recursive: true, force: true });
}
console.log(
  JSON.stringify({
    invalidConfigurationRedacted: "PASS",
    migrationFailuresRedacted: "PASS",
    databaseFailureRedacted: "PASS",
    uncaughtExceptionRedacted: "PASS",
    unhandledRejectionRedacted: "PASS",
  }),
);
