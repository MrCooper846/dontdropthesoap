import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
async function main() {
  const name = "soap_migration_" + randomUUID().replaceAll("-", "");
  if (!/^soap_migration_[a-f0-9]{32}$/.test(name))
    throw new Error("Invalid temporary database");
  const admin = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/postgres",
  });
  let created = false;
  try {
    await admin.query('CREATE DATABASE "' + name + '"');
    created = true;
    const connectionString =
      "postgresql://soap:soap_local_only@localhost:55432/" + name;
    for (let i = 0; i < 2; i++) {
      const result = spawnSync("npm", ["run", "db:migrate"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: connectionString },
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status !== 0)
        throw new Error("Fresh/repeated migration failed: " + result.stderr);
    }
    const db = new Pool({ connectionString });
    try {
      const migrations = Number(
        (await db.query("SELECT count(*) FROM schema_migrations")).rows[0]
          .count,
      );
      const trigger = (
        await db.query(
          "SELECT 1 FROM pg_trigger WHERE tgname='visual_version_immutable'",
        )
      ).rowCount;
      const decisions = (
        await db.query(
          "SELECT to_regclass('public.visual_decisions') IS NOT NULL AS present",
        )
      ).rows[0].present;
      if (migrations < 5 || trigger !== 1 || !decisions)
        throw new Error("Fresh schema incomplete");
      console.log(
        JSON.stringify({
          freshInstall: "PASS",
          repeatedMigrations: "PASS",
          migrations,
          visualConstraints: "PRESENT",
        }),
      );
    } finally {
      await db.end();
    }
  } finally {
    if (created) await admin.query('DROP DATABASE "' + name + '"');
    await admin.end();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Migration check failed",
  );
  process.exitCode = 1;
});
