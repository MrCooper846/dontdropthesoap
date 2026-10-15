import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { config } from "../../server/config";
import { createGuest } from "../../server/auth/sessions";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  project,
} from "../../domain/match/engine";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import {
  inspectWaitingRoom,
  sweepWaitingRooms,
} from "../../server/matches/waiting";
import { recoverMatches } from "../../server/commands/matches";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Waiting fixtures require soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
async function room(mode: "human" | "league" = "human") {
  const a = await createGuest("Waiting expiry A"),
    b = await createGuest("Waiting expiry B");
  const m = createMatch(
    randomUUID(),
    a.ownerId,
    mode,
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
    Date.now(),
    123,
  );
  for (const owner of [a, b])
    addSeat(
      m,
      makeSeat(
        randomUUID(),
        owner.ownerId,
        "Waiting",
        mode === "league" ? "external" : "human",
      ),
    );
  await transaction((db) => saveMatch(db, m));
  return m;
}
async function old(id: string) {
  await pool.query(
    "UPDATE matches SET waiting_empty_since=clock_timestamp()-interval '16 minutes' WHERE id=$1",
    [id],
  );
}
async function state(id: string) {
  return transaction((db) => loadMatch(db, id));
}
it("records absence durably, cancels only after fifteen minutes, preserves history and emits once without settlement", async () => {
  const m = await room();
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  expect(
    (
      await pool.query(
        "SELECT waiting_empty_since IS NOT NULL AS marked FROM matches WHERE id=$1",
        [m.id],
      )
    ).rows[0].marked,
  ).toBe(true);
  await pool.query(
    "UPDATE matches SET waiting_empty_since=clock_timestamp()-interval '14 minutes' WHERE id=$1",
    [m.id],
  );
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  await old(m.id);
  // Startup's actual recovery path must not renew a persisted waiting absence.
  const beforeRecovery = (
    await pool.query("SELECT waiting_empty_since FROM matches WHERE id=$1", [
      m.id,
    ])
  ).rows[0].waiting_empty_since;
  await recoverMatches();
  expect(
    (
      await pool.query("SELECT waiting_empty_since FROM matches WHERE id=$1", [
        m.id,
      ])
    ).rows[0].waiting_empty_since,
  ).toEqual(beforeRecovery);
  const recoveredVersion = (await state(m.id)).version;
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(true);
  const cancelled = await state(m.id);
  expect(cancelled.phase).toBe("cancelled");
  expect(cancelled.version).toBe(recoveredVersion + 1);
  expect(cancelled.seats).toHaveLength(2);
  expect(project(cancelled, null).cancelReason).toBe("empty");
  expect(cancelled.results).toEqual([]);
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM match_events WHERE match_id=$1 AND type='match.waiting-expired'",
        [m.id],
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM balance_entries WHERE match_id=$1",
        [m.id],
      )
    ).rows[0].n,
  ).toBe(0);
});
it("a returning participant resets the durable absence instead of expiring an occupied room", async () => {
  const m = await room();
  await old(m.id);
  expect(await inspectWaitingRoom(m.id, () => true)).toBe(false);
  expect(
    (
      await pool.query("SELECT waiting_empty_since FROM matches WHERE id=$1", [
        m.id,
      ])
    ).rows[0].waiting_empty_since,
  ).toBeNull();
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  expect((await state(m.id)).phase).toBe("waiting");
});
it("league waiting rooms and admitted countdown/collecting games are exempt", async () => {
  const league = await room("league");
  await old(league.id);
  expect(await inspectWaitingRoom(league.id, () => false)).toBe(false);
  expect((await state(league.id)).phase).toBe("waiting");
  const m = await room();
  await old(m.id);
  for (const s of m.seats) ready(m, s.id, true);
  requestStart(m, Date.now());
  await transaction((db) => saveMatch(db, m));
  expect(
    (
      await pool.query("SELECT waiting_empty_since FROM matches WHERE id=$1", [
        m.id,
      ])
    ).rows[0].waiting_empty_since,
  ).toBeNull();
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  advance(m, m.deadline! + 1);
  await transaction((db) => saveMatch(db, m));
  expect(await inspectWaitingRoom(m.id, () => false)).toBe(false);
  expect((await state(m.id)).phase).toBe("collecting");
});
it("rechecks the locked phase after racing an already admitted start", async () => {
  const m = await room();
  await old(m.id);
  const db = await pool.connect();
  let inspection: Promise<boolean> | undefined;
  try {
    await db.query("BEGIN");
    const current = await loadMatch(db, m.id, true);
    for (const s of current.seats) ready(current, s.id, true);
    requestStart(current, Date.now());
    await saveMatch(db, current);
    const pid = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    inspection = inspectWaitingRoom(m.id, () => false);
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
              [pid],
            )
          ).rows[0].n,
        { timeout: 2000, interval: 20 },
      )
      .toBeGreaterThan(0);
    await db.query("COMMIT");
    expect(await inspection).toBe(false);
    expect((await state(m.id)).phase).toBe("countdown");
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await inspection;
  }
});

it("bounds each scan page and eventually reaches rooms beyond its first hundred candidates", async () => {
  const owner = await createGuest("Waiting page fixture");
  const ids: string[] = [];
  try {
    for (let i = 0; i < 101; i++) {
      const m = createMatch(
        randomUUID(),
        owner.ownerId,
        "human",
        { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
        Date.now(),
        123,
      );
      await transaction((db) => saveMatch(db, m));
      ids.push(m.id);
    }
    const observed = new Set<string>();
    for (let page = 0; page < 5 && observed.size < ids.length; page++) {
      let visited = 0;
      await sweepWaitingRooms((m) => {
        visited++;
        if (ids.includes(m.id)) observed.add(m.id);
        return true;
      });
      expect(visited).toBeLessThanOrEqual(100);
    }
    expect(observed.size).toBe(101);
  } finally {
    await pool.query(
      "DELETE FROM match_events WHERE match_id=ANY($1::uuid[])",
      [ids],
    );
    await pool.query("DELETE FROM matches WHERE id=ANY($1::uuid[])", [ids]);
  }
});
