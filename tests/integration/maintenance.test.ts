import type { IncomingMessage } from "node:http";
import {
  newMatch,
  joinMatch,
  command,
  observe,
} from "../../server/commands/matches";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  submit,
} from "../../domain/match/engine";
import { saveMatch, loadMatch } from "../../server/matches/repository";
import { applyOperator } from "../../server/operators/service";
import {
  SERVICE_CONTROL_ID,
  matchesOpen,
  maintenanceStatus,
} from "../../server/operators/maintenance";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Maintenance tests require soap_test");
const operator = "maintenance-fixture";
const action = (open: boolean) => ({
  commandId: randomUUID(),
  action: open ? "matches.resume" : "matches.pause",
  targetId: SERVICE_CONTROL_ID,
  reason: "Synthetic admission fixture",
});
beforeAll(async () => {
  await migrate();
  await applyOperator(operator, action(true));
});
afterAll(async () => {
  await applyOperator(operator, action(true));
  await pool.end();
});
async function match(seats = 2) {
  const owners = await Promise.all(
    Array.from({ length: seats }, (_, i) => createGuest("Maintenance " + i)),
  );
  const m = createMatch(
    randomUUID(),
    owners[0].ownerId,
    "human",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    Date.now(),
    123,
  );
  for (const owner of owners)
    addSeat(m, makeSeat(randomUUID(), owner.ownerId, "Fixture", "human"));
  await transaction((db) => saveMatch(db, m));
  return m;
}
it("pause blocks new games, new human seats and waiting starts but admits an already accepted odd-table countdown through settlement", async () => {
  const active = await match(3),
    waiting = await match();
  for (const seat of active.seats) ready(active, seat.id, true);
  requestStart(active, Date.now());
  await transaction((db) => saveMatch(db, active));
  const pause = action(false);
  const result = await applyOperator(operator, pause);
  expect(await applyOperator(operator, pause)).toEqual(result);
  expect(await matchesOpen()).toBe(false);
  const newOwner = await createGuest("Paused creator");
  const denied = createMatch(
    randomUUID(),
    newOwner.ownerId,
    "human",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    Date.now(),
    5,
  );
  await expect(transaction((db) => saveMatch(db, denied))).rejects.toThrow(
    "New games are paused",
  );
  addSeat(
    waiting,
    makeSeat(randomUUID(), newOwner.ownerId, "Paused join", "human"),
  );
  await expect(transaction((db) => saveMatch(db, waiting))).rejects.toThrow(
    "New games are paused",
  );
  waiting.seats.pop();
  for (const seat of waiting.seats) ready(waiting, seat.id, true);
  requestStart(waiting, Date.now());
  await expect(transaction((db) => saveMatch(db, waiting))).rejects.toThrow(
    "New games are paused",
  );
  expect((await transaction((db) => loadMatch(db, waiting.id))).phase).toBe(
    "waiting",
  );
  for (let round = 1; round <= 5; round++) {
    if (round === 1) advance(active, active.deadline! + 1);
    if (round === 1)
      expect(active.seats.some((s) => s.kind === "system")).toBe(true);
    await transaction((db) => saveMatch(db, active));
    for (const seat of active.seats.filter((s) => s.kind === "human"))
      submit(active, seat.id, round, "C", active.deadline! - 100);
    await transaction((db) => saveMatch(db, active));
    advance(active, active.deadline! + 1);
    await transaction((db) => saveMatch(db, active));
  }
  expect(active.phase).toBe("finished");
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM balance_entries WHERE match_id=$1",
        [active.id],
      )
    ).rows[0].n,
  ).toBe(3);
  expect((await maintenanceStatus()).matchesOpen).toBe(false);
  await applyOperator(operator, action(true));
  await match();
});
it("pause waits for an earlier admitted transaction to commit; new admissions then reject", async () => {
  await applyOperator(operator, action(true));
  const existing = await match();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT require_match_admissions()");
    let finished = false;
    const paused = applyOperator(operator, action(false)).then((result) => {
      finished = true;
      return result;
    });
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%service_controls%' AND cardinality(pg_blocking_pids(pid))>0",
            )
          ).rows[0].n,
        { timeout: 2000, interval: 20 },
      )
      .toBeGreaterThan(0);
    expect(finished).toBe(false);
    await db.query("COMMIT");
    await paused;
    const fresh = { ...existing, id: randomUUID(), seats: [] };
    await expect(transaction((tx) => saveMatch(tx, fresh))).rejects.toThrow(
      "New games are paused",
    );
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await applyOperator(operator, action(true));
  }
});
it("an admission waiting behind an uncommitted pause sees the committed closed state", async () => {
  await applyOperator(operator, action(true));
  const existing = await match(),
    db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "UPDATE service_controls SET matches_open=false WHERE id=$1",
      [SERVICE_CONTROL_ID],
    );
    let done = false;
    const attempted = transaction((tx) =>
      saveMatch(tx, { ...existing, id: randomUUID(), seats: [] }),
    )
      .then(
        () => ({ code: "accepted" }),
        (e) => ({ code: e.code }),
      )
      .finally(() => {
        done = true;
      });
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'INSERT INTO matches%' AND cardinality(pg_blocking_pids(pid))>0",
            )
          ).rows[0].n,
        { timeout: 2000, interval: 20 },
      )
      .toBeGreaterThan(0);
    expect(done).toBe(false);
    await db.query("COMMIT");
    expect(await attempted).toEqual({ code: "ADMISSIONS_PAUSED" });
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await applyOperator(operator, action(true));
  }
});

it("failed resource admission preserves its creation key and host start returns the common paused ACK, then retries once after resume", async () => {
  const a = await createGuest("Creation retry"),
    b = await createGuest("Start retry");
  const reqA = {
    headers: { cookie: "dds_session=" + a.secret },
  } as IncomingMessage;
  const reqB = {
    headers: { cookie: "dds_session=" + b.secret },
  } as IncomingMessage;
  const key = randomUUID(),
    bkey = randomUUID(),
    commandId = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '10 minutes'),($3,$4,clock_timestamp()+interval '10 minutes')",
    [key, a.ownerId, bkey, b.ownerId],
  );
  const payload = { key, commandId, controllerEpoch: 0 };
  await applyOperator(operator, action(false));
  await expect(newMatch(reqA, payload)).rejects.toMatchObject({
    code: "ADMISSIONS_PAUSED",
  });
  expect(
    (
      await pool.query("SELECT consumed_at FROM creation_keys WHERE id=$1", [
        key,
      ])
    ).rows[0].consumed_at,
  ).toBeNull();
  expect(
    (
      await pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
        commandId,
      ])
    ).rowCount,
  ).toBe(0);
  await applyOperator(operator, action(true));
  const created = await newMatch(reqA, payload);
  expect(await newMatch(reqA, payload)).toEqual(created);
  await joinMatch(reqB, created.id, {
    key: bkey,
    commandId: randomUUID(),
    controllerEpoch: 0,
  });
  const view = await observe(reqA, created.id);
  for (const [req, owner] of [
    [reqA, a],
    [reqB, b],
  ] as const) {
    const seatId = view.seats.find((s) => s.ownerId === owner.ownerId)!.id;
    expect(
      await command(req, {
        v: 1,
        commandId: randomUUID(),
        controllerEpoch: 0,
        type: "seat.ready",
        matchId: created.id,
        seatId,
        payload: { ready: true },
      }),
    ).toMatchObject({ ok: true });
  }
  const waiting = await observe(reqA, created.id);
  const start = {
    v: 1,
    commandId: randomUUID(),
    controllerEpoch: 0,
    type: "match.start",
    matchId: created.id,
    matchVersion: waiting.version,
    payload: {},
  };
  await applyOperator(operator, action(false));
  expect(await command(reqA, start)).toMatchObject({
    ok: false,
    error: { code: "ADMISSIONS_PAUSED", retryable: false },
  });
  expect((await observe(reqA, created.id)).phase).toBe("waiting");
  await applyOperator(operator, action(true));
  expect(await command(reqA, start)).toMatchObject({ ok: true });
  expect(await command(reqA, start)).toMatchObject({ ok: true });
  expect((await observe(reqA, created.id)).phase).toBe("countdown");
  for (const [req, owner] of [
    [reqA, a],
    [reqB, b],
  ] as const) {
    const seatId = view.seats.find((s) => s.ownerId === owner.ownerId)!.id;
    expect(
      await command(req, {
        v: 1,
        commandId: randomUUID(),
        controllerEpoch: 0,
        type: "seat.leave",
        matchId: created.id,
        seatId,
        payload: {},
      }),
    ).toMatchObject({ ok: true });
  }
});
