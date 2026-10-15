import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import { enforceCoordinatorLease } from "../../server/persistence/coordinator-lease";
import { maintainCoordinator } from "../../server/matches/availability";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  submit,
  project,
} from "../../domain/match/engine";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Outage tests require isolated soap_test");
beforeAll(migrate);
afterAll(async () => {
  enforceCoordinatorLease(false);
  await pool.query(
    "UPDATE coordinator_health SET last_success=clock_timestamp()",
  );
  await pool.end();
});
async function game(decisionMs = 5000) {
  enforceCoordinatorLease(false);
  const a = await createGuest("Outage A"),
    b = await createGuest("Outage B"),
    now = Date.now();
  const m = createMatch(
    randomUUID(),
    a.ownerId,
    "human",
    { rounds: 5, decisionMs, revealMs: 1000, maxSeats: 2 },
    now - 3000,
    17,
  );
  addSeat(m, makeSeat(randomUUID(), a.ownerId, "A"));
  addSeat(m, makeSeat(randomUUID(), b.ownerId, "B"));
  for (const s of m.seats) ready(m, s.id, true);
  requestStart(m, now - 3000);
  advance(m, now);
  submit(m, m.seats[0].id, 1, "D", now + 1);
  await transaction((db) => saveMatch(db, m));
  return m;
}
it("prolonged coordinator loss fences durable writes, aborts without timeout scoring and preserves hidden choices", async () => {
  const m = await game();
  await pool.query(
    "UPDATE coordinator_health SET last_success=clock_timestamp()-interval '6 seconds'",
  );
  enforceCoordinatorLease();
  await expect(
    transaction(async (db) => {
      const current = await loadMatch(db, m.id, true);
      submit(current, current.seats[1].id, 1, "C", Date.now());
      await saveMatch(db, current);
    }),
  ).rejects.toThrow("Game service is recovering. Please retry.");
  expect(
    (await pool.query("SELECT count(*) FROM moves WHERE match_id=$1", [m.id]))
      .rows[0].count,
  ).toBe("1");
  await maintainCoordinator();
  const current = await transaction((db) => loadMatch(db, m.id));
  expect(current.phase).toBe("aborted");
  expect(current.abortReason).toBe("infrastructure");
  expect(current.results).toEqual([]);
  expect(current.seats.map((s) => s.score)).toEqual([0, 0]);
  expect(project(current, null)).not.toHaveProperty("revealedMoves");
  expect(project(current, m.seats[0].ownerId).ownMove).toBe("D");
  expect(
    (
      await pool.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
        m.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (await pool.query("SELECT 1 FROM round_results WHERE match_id=$1", [m.id]))
      .rowCount,
  ).toBe(0);
});
it("short gaps retain committed decisions and normal interrupted-match recovery remains available", async () => {
  const m = await game(10000);
  await pool.query(
    "UPDATE coordinator_health SET last_success=clock_timestamp()-interval '1 second'",
  );
  enforceCoordinatorLease();
  await maintainCoordinator();
  const current = await transaction((db) => loadMatch(db, m.id));
  expect(current.phase).toBe("collecting");
  expect(current.moves).toEqual(m.moves);
  await transaction(async (db) => {
    const next = await loadMatch(db, m.id, true);
    submit(next, next.seats[1].id, 1, "C", Date.now());
    await saveMatch(db, next);
  });
  expect((await transaction((db) => loadMatch(db, m.id))).phase).toBe(
    "revealing",
  );
});
it("rechecks database time after waiting for a match lock before renewing the lease", async () => {
  const m = await game(6000),
    locker = await pool.connect();
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM matches WHERE id=$1 FOR UPDATE", [m.id]);
    await pool.query(
      "UPDATE coordinator_health SET last_success=clock_timestamp()-interval '5.5 seconds'",
    );
    enforceCoordinatorLease();
    const recovery = maintainCoordinator();
    await delay(900);
    await locker.query("COMMIT");
    await recovery;
    expect((await transaction((db) => loadMatch(db, m.id))).phase).toBe(
      "aborted",
    );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
  }
});

it("commit-time enforcement rolls back a decision if availability is lost after application checks", async () => {
  const m = await game();
  await maintainCoordinator();
  enforceCoordinatorLease();
  await expect(
    transaction(async (db) => {
      const current = await loadMatch(db, m.id, true);
      submit(current, current.seats[1].id, 1, "C", Date.now());
      await saveMatch(db, current);
      // Save passed its application check, but the deferred trigger must still reject COMMIT.
      await pool.query(
        "UPDATE coordinator_health SET last_success=clock_timestamp()-interval '6 seconds'",
      );
    }),
  ).rejects.toThrow("Game service is recovering. Please retry.");
  const current = await transaction((db) => loadMatch(db, m.id));
  expect(current.phase).toBe("collecting");
  expect(current.moves).toEqual(m.moves);
  expect(current.results).toEqual([]);
  expect(current.seats.map((s) => s.score)).toEqual([0, 0]);
  expect(
    (await pool.query("SELECT 1 FROM round_results WHERE match_id=$1", [m.id]))
      .rowCount,
  ).toBe(0);
  await maintainCoordinator();
  expect((await transaction((db) => loadMatch(db, m.id))).phase).toBe(
    "aborted",
  );
});

it("cannot renew over a previously inspected match whose window expires while another match is locked", async () => {
  const one = await game(10000),
    two = await game(10000);
  const [first, last] = [one, two].sort((a, b) => a.id.localeCompare(b.id));
  const locker = await pool.connect();
  try {
    await locker.query("BEGIN");
    await locker.query("SELECT id FROM matches WHERE id=$1 FOR UPDATE", [
      last.id,
    ]);
    await pool.query(
      "UPDATE coordinator_health SET last_success=clock_timestamp()-interval '5.1 seconds'",
    );
    enforceCoordinatorLease();
    const recovery = maintainCoordinator();
    const rejected = expect(recovery).rejects.toThrow(
      "Game service is recovering",
    );
    // Prove recovery has inspected the earlier UUID and is waiting on the
    // later one before crossing the deadline; elapsed sleep alone cannot
    // establish that ordering on a busy host.
    const pid = (await locker.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
              [pid],
            )
          ).rows[0].n,
        { timeout: 3000, interval: 20 },
      )
      .toBeGreaterThan(0);
    expect(
      Number(
        (
          await pool.query(
            "SELECT extract(epoch FROM (clock_timestamp()-last_success))*1000 AS age FROM coordinator_health",
          )
        ).rows[0].age,
      ),
    ).toBeLessThan(10000);
    await expect
      .poll(
        async () =>
          Number(
            (
              await pool.query(
                "SELECT extract(epoch FROM (clock_timestamp()-last_success))*1000 AS age FROM coordinator_health",
              )
            ).rows[0].age,
          ),
        { timeout: 7000, interval: 20 },
      )
      .toBeGreaterThanOrEqual(10000);
    await locker.query("COMMIT");
    await rejected;
    expect((await transaction((db) => loadMatch(db, first.id))).phase).toBe(
      "collecting",
    );
    await maintainCoordinator();
    for (const m of [one, two])
      expect((await transaction((db) => loadMatch(db, m.id))).phase).toBe(
        "aborted",
      );
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
  }
});
