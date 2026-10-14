import { Pool } from "pg";
import { config } from "../server/config";
const url = new URL(config.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432")
  throw new Error(
    "Test setup only targets the local Compose PostgreSQL on port 55432",
  );
const pool = new Pool({ connectionString: config.DATABASE_URL });
async function run() {
  for (const name of [
    "soap_test",
    "soap_browser",
    "soap_recovery",
    "soap_yard_browser",
    "soap_visual_browser",
  ]) {
    if (
      !(await pool.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    ) {
      await pool.query('CREATE DATABASE "' + name + '"');
      console.log("Created " + name);
    }
  }
}
run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
