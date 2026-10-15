import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import { saveMatch } from "../../server/matches/repository";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  submit,
} from "../../domain/match/engine";
import { startMetrics } from "../../server/observability/metrics";
import { DurableMetrics } from "../../server/observability/durable";
beforeAll(migrate);
afterAll(() => pool.end());
function sample() {
  let value: any;
  startMetrics(
    () => ({}),
    (v) => {
      value = v;
    },
  )();
  return value;
}
it("counts only committed new decisions, survives rollback/retry and reports indexed durable state without payloads", async () => {
  sample();
  const a = await createGuest("Metric A"),
    b = await createGuest("Metric B");
  const now = Date.now();
  const m = createMatch(
    randomUUID(),
    a.ownerId,
    "human",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    now - 3000,
    7,
  );
  addSeat(m, makeSeat(randomUUID(), a.ownerId, "Metric A"));
  addSeat(m, makeSeat(randomUUID(), b.ownerId, "Metric B"));
  for (const seat of m.seats) ready(m, seat.id, true);
  requestStart(m, now - 3000);
  advance(m, now);
  await transaction((db) => saveMatch(db, m));
  submit(m, m.seats[0].id, 1, "D", Date.now());
  await expect(
    transaction(async (db) => {
      await saveMatch(db, m);
      throw Error("synthetic rollback");
    }),
  ).rejects.toThrow("synthetic rollback");
  expect(sample().counters["move.recorded"]).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM moves WHERE match_id=$1",
        [m.id],
      )
    ).rows[0].n,
  ).toBe(0);
  await transaction((db) => saveMatch(db, m));
  m.deadline = Date.now() - 1;
  advance(m, Date.now());
  await transaction((db) => saveMatch(db, m));
  await transaction((db) => saveMatch(db, m));
  const counts = sample().counters;
  expect(counts["move.recorded"]).toBe(2);
  expect(counts["move.timeout"]).toBe(1);
  await pool.query(
    "UPDATE match_events SET created_at=clock_timestamp()-interval '30 seconds' WHERE match_id=$1",
    [m.id],
  );
  const durable = new DurableMetrics();
  expect(durable.snapshot().durableMetricsAvailable).toBe(false);
  expect(durable.snapshot().outboxOldestAgeMs).toBe(-1);
  await durable.refresh();
  const state = durable.snapshot();
  expect(state.durableMetricsAvailable).toBe(true);
  expect(state.activeMatches).toBe(1);
  expect(state.activeSeats).toBe(2);
  expect(state.outboxOldestAgeMs).toBeGreaterThanOrEqual(30000);
  expect(JSON.stringify(state)).not.toContain(m.id);
  const query = vi
    .spyOn(pool, "query")
    .mockRejectedValueOnce(Error("synthetic unavailable"));
  try {
    await durable.refresh();
  } finally {
    query.mockRestore();
  }
  expect(durable.snapshot().durableMetricsAvailable).toBe(false);
  expect(durable.snapshot().outboxOldestAgeMs).toBeGreaterThanOrEqual(
    state.outboxOldestAgeMs,
  );
  expect(sample().counters["metrics.refresh.failed"]).toBe(1);
});
