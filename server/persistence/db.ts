import { coordinatorLeaseEnforced } from "./coordinator-lease";
import { RuleError } from "../../domain/match/model";
import { Pool, Client, type PoolClient } from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 12,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
  idle_in_transaction_session_timeout: 10000,
});
export async function transaction<T>(
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (coordinatorLeaseEnforced())
      await db.query("SET LOCAL soap.enforce_coordinator = 'on'");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    if (e && typeof e === "object" && "code" in e && e.code === "P0C01")
      throw new RuleError(
        "SERVICE_UNAVAILABLE",
        "Game service is recovering. Please retry.",
      );
    if (e && typeof e === "object" && "code" in e && e.code === "P0A01")
      throw new RuleError(
        "ADMISSIONS_PAUSED",
        "New games are paused for maintenance. Existing games can finish.",
      );
    throw e;
  } finally {
    db.release();
  }
}
export async function migrate() {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(724100)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = path.join(process.cwd(), "server/persistence/migrations");
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await db.query(await readFile(path.join(dir, name), "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    }
  });
}
export async function dbTime(db: PoolClient) {
  return Number(
    (await db.query("SELECT extract(epoch from clock_timestamp())*1000 AS now"))
      .rows[0].now,
  );
}
export async function acquireWriter(onLost: () => void) {
  const db = new Client({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 3000,
    statement_timeout: 10000,
  });
  await db.connect();
  const acquired = (
    await db.query("SELECT pg_try_advisory_lock(724101) AS locked")
  ).rows[0].locked;
  if (!acquired) {
    await db.end();
    throw new Error("Another game writer owns this database");
  }
  db.on("error", onLost);
  const timer = setInterval(
    () => void db.query("SELECT 1").catch(onLost),
    2000,
  );
  return async () => {
    clearInterval(timer);
    await db.query("SELECT pg_advisory_unlock(724101)");
    await db.end();
    db.removeListener("error", onLost);
  };
}
