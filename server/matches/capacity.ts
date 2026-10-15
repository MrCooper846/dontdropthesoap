import type { PoolClient } from "pg";
import { config } from "../config";
import { RuleError } from "../../domain/match/model";
// All public social/challenge creation paths hold the shared 724102 lock.
export async function requireTableCapacity(db: PoolClient) {
  const n = Number(
    (
      await db.query(
        "SELECT count(*) FROM matches WHERE mode<>'league' AND phase NOT IN ('finished','cancelled','aborted')",
      )
    ).rows[0].count,
  );
  if (n >= config.MAX_ACTIVE_MATCHES)
    throw new RuleError("CAPACITY_FULL", "All configured tables are busy");
}
