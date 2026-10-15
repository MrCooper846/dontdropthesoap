import { beforeEach, afterEach } from "vitest";
import { config } from "../../server/config";
import { pool, transaction } from "../../server/persistence/db";
import {
  coordinatorLeaseEnforced,
  enforceCoordinatorLease,
} from "../../server/persistence/coordinator-lease";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { leave, recover } from "../../domain/match/engine";
// Fixture teardown, never a production route: retain completed/settled evidence,
// but do not leave artificial active games consuming the next case's table cap.
async function closeUnfinishedFixtures() {
  const url = new URL(config.DATABASE_URL);
  if (
    url.pathname !== "/soap_test" ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.port !== "55432"
  )
    throw Error("Fixture cleanup requires local soap_test");
  const enforced = coordinatorLeaseEnforced();
  enforceCoordinatorLease(false);
  try {
    const ids = (
      await pool.query(
        "SELECT id FROM matches WHERE phase NOT IN ('finished','cancelled','aborted')",
      )
    ).rows;
    for (const { id } of ids)
      await transaction(async (db) => {
        const m = await loadMatch(db, id, true);
        if (["waiting", "countdown"].includes(m.phase)) {
          for (const seat of [...m.seats]) leave(m, seat.id);
          if (!m.seats.length) {
            m.phase = "cancelled";
            m.deadline = null;
            m.version++;
          }
        } else if (["collecting", "revealing"].includes(m.phase)) {
          recover(m, Date.now());
          recover(m, Date.now());
        } else return;
        await saveMatch(db, m, "test.fixture-closed");
      });
  } finally {
    enforceCoordinatorLease(enforced);
  }
}
beforeEach(closeUnfinishedFixtures);
afterEach(closeUnfinishedFixtures);
