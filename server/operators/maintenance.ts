import type { PoolClient } from "pg";
import { pool } from "../persistence/db";
export const SERVICE_CONTROL_ID = "00000000-0000-4000-8000-000000000001";
export async function matchesOpen(db?: PoolClient, lock = false) {
  const client = db ?? pool;
  const row = (
    await client.query(
      "SELECT matches_open FROM service_controls WHERE id=$1" +
        (lock ? " FOR SHARE" : ""),
      [SERVICE_CONTROL_ID],
    )
  ).rows[0];
  return row?.matches_open === true;
}
export async function maintenanceStatus() {
  const row = (
    await pool.query(
      `SELECT c.matches_open AS "matchesOpen",
 (SELECT count(*)::int FROM matches WHERE phase IN ('countdown','collecting','revealing')) AS "activeGames",
 (SELECT count(*)::int FROM matches WHERE phase='waiting') AS "waitingGames"
 FROM service_controls c WHERE id=$1`,
      [SERVICE_CONTROL_ID],
    )
  ).rows[0];
  if (!row) throw new Error("Missing service admission control");
  return { serviceId: SERVICE_CONTROL_ID, ...row };
}
