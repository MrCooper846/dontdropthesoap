import type { PoolClient } from "pg";
import type { Match } from "../../domain/match/model";
import { RuleError } from "../../domain/match/model";
let enabled = false;
let confirmedAt = 0;
export function confirmCoordinatorLease() {
  confirmedAt = performance.now();
}
export function coordinatorAvailable() {
  return !enabled || performance.now() - confirmedAt < 2000;
}
export function coordinatorLeaseEnforced() {
  return enabled;
}
export function enforceCoordinatorLease(value = true) {
  enabled = value;
}
export async function assertCoordinatorFresh(db: PoolClient, m: Match) {
  if (!enabled) return;
  const row = (
    await db.query(
      "SELECT extract(epoch FROM (clock_timestamp()-last_success))*1000 AS gap FROM coordinator_health WHERE singleton=true",
    )
  ).rows[0];
  if (!row || Number(row.gap) >= m.settings.decisionMs)
    throw new RuleError(
      "SERVICE_UNAVAILABLE",
      "Game service is recovering. Please retry.",
    );
}
