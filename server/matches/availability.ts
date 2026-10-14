import { confirmCoordinatorLease } from "../persistence/coordinator-lease";
import { transaction, dbTime } from "../persistence/db";
import { loadMatch, saveMatch } from "./repository";
// This timestamp is committed only after recovery checks. It is deliberately
// durable: a writer that died during a DB outage cannot forget the gap on boot.
export async function maintainCoordinator() {
  const result = await transaction(async (db) => {
    await db.query("SET LOCAL soap.enforce_coordinator = 'on'");
    const row = (
      await db.query(
        "SELECT extract(epoch from last_success)*1000 AS last FROM coordinator_health WHERE singleton=true FOR UPDATE",
      )
    ).rows[0];
    if (!row) throw Error("Missing coordinator health record");
    const now = await dbTime(db),
      gap = Math.max(0, now - Number(row.last));
    let aborted = 0;
    if (gap >= 5000) {
      const ids = (
        await db.query(
          "SELECT id FROM matches WHERE phase IN ('countdown','collecting','revealing') ORDER BY id",
        )
      ).rows;
      for (const { id } of ids) {
        const m = await loadMatch(db, id, true);
        if (
          (await dbTime(db)) - Number(row.last) < m.settings.decisionMs ||
          !["countdown", "collecting", "revealing"].includes(m.phase)
        )
          continue;
        if (m.phase === "countdown") {
          m.phase = "waiting";
          for (const s of m.seats) s.ready = false;
        } else {
          m.phase = "aborted";
          m.abortReason = "infrastructure";
          aborted++;
        }
        m.deadline = null;
        m.version++;
        await saveMatch(db, m, "match.infrastructure-interruption", true);
      }
    }
    // Get the clock again after locks/recovery, rather than signing a stale lease.
    await db.query(
      "UPDATE coordinator_health SET last_success=clock_timestamp() WHERE singleton=true",
    );
    return { gap, aborted };
  });
  confirmCoordinatorLease();
  return result;
}
