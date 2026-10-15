import { Pool } from "pg";
import { spawnSync } from "node:child_process";
export default async function setup() {
  const databaseURL =
    "postgresql://soap:soap_local_only@localhost:55432/soap_browser";
  const url = new URL(databaseURL);
  if (
    url.hostname !== "localhost" ||
    url.port !== "55432" ||
    url.pathname !== "/soap_browser"
  )
    throw new Error(
      "Alpha fixture cleanup requires its isolated local database",
    );
  const migration = spawnSync("npm", ["run", "db:migrate"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseURL },
    encoding: "utf8",
    timeout: 30000,
  });
  if (migration.status !== 0)
    throw new Error("Alpha fixture migration failed: " + migration.stderr);
  const db = new Pool({ connectionString: databaseURL });
  try {
    if (
      (await db.query("SELECT current_database() AS name")).rows[0].name !==
      "soap_browser"
    )
      throw new Error("Wrong league fixture database");
    await db.query("TRUNCATE owners CASCADE");
  } finally {
    await db.end();
  }
}
