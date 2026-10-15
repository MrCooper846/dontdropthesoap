import { retentionBatch } from "../../server/persistence/retention";
import { applyOperator } from "../../server/operators/service";
import { SERVICE_CONTROL_ID } from "../../server/operators/maintenance";
import {
  createExternalBot,
  mintCredential,
  acquireBot,
  heartbeatBot,
} from "../../server/bots/identity";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import { publishVisual } from "../../server/bots/visual-publication";
import { starter } from "../../shared/bots/presets";
import {
  createBatch,
  registerEntry,
  closeRegistration,
  tickLeague,
  resumeEntry,
} from "../../server/league/service";
import {
  batchDetails,
  fixtureReplay,
  listBatches,
} from "../../server/league/reads";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { advance, submit, recover } from "../../domain/match/engine";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test") || !config.FEATURE_LEAGUE)
  throw new Error("League tests require soap_test and enabled league");
beforeAll(migrate);
afterAll(() => pool.end());
it("freezes four owners, schedules six pairs, retries aborted hidden decisions and settles once from stored results", async () => {
  // Direct service/engine integration intentionally advances a synthetic clock.
  // Real worker/browser/process/restart evidence is a separate stage gate.
  const owners: IncomingMessage[] = [],
    bots: string[] = [];
  for (let i = 0; i < 4; i++) {
    const guest = await createGuest("League " + i);
    const req = {
      headers: { cookie: "dds_session=" + guest.secret },
    } as IncomingMessage;
    owners.push(req);
    const bot = await transaction((db) =>
      publishVisual(
        req,
        { name: "League bot " + i, workspace: starter("cooperate") },
        db,
        0,
      ),
    );
    bots.push(String(bot.id));
  }
  const batch = await transaction((db) =>
    createBatch(owners[0], { name: "Integration league" }, db),
  );
  for (let i = 0; i < 4; i++)
    await transaction((db) =>
      registerEntry(owners[i], batch.id, { botId: bots[i] }, db),
    );
  await expect(
    transaction((db) =>
      registerEntry(owners[0], batch.id, { botId: bots[0] }, db),
    ),
  ).rejects.toThrow("One entry per owner");
  const provisional = await batchDetails(batch.id, 0);
  expect(provisional.provisionalSchedule).toHaveLength(6);
  expect(provisional.entries).toHaveLength(4);
  expect(JSON.stringify(provisional)).not.toMatch(
    /program_json|workspace_json|rngState/,
  );
  await expect(
    transaction((db) => closeRegistration(owners[1], batch.id, {}, db)),
  ).rejects.toThrow("NOT_FOUND");
  await transaction((db) => closeRegistration(owners[0], batch.id, {}, db));
  await expect(
    transaction((db) =>
      registerEntry(owners[0], batch.id, { botId: bots[0] }, db),
    ),
  ).rejects.toThrow("REGISTRATION_CLOSED");
  expect((await listBatches()).batches.some((b) => b.id === batch.id)).toBe(
    true,
  );
  const frozen = provisional.entries[0];
  await expect(
    pool.query("UPDATE league_batches SET rules_json='{}' WHERE id=$1", [
      batch.id,
    ]),
  ).rejects.toThrow();
  await expect(
    pool.query("UPDATE league_entries SET name='Disguised' WHERE id=$1", [
      frozen.id,
    ]),
  ).rejects.toThrow("immutable");
  await expect(
    pool.query("DELETE FROM league_entries WHERE id=$1", [frozen.id]),
  ).rejects.toThrow("closed");
  const admission = (open: boolean) =>
    applyOperator("league-maintenance-fixture", {
      commandId: randomUUID(),
      action: open ? "matches.resume" : "matches.pause",
      targetId: SERVICE_CONTROL_ID,
      reason: "Synthetic league pause",
    });
  const attemptsBeforePause = Number(
    (await pool.query("SELECT count(*) FROM league_attempts")).rows[0].count,
  );
  await admission(false);
  try {
    await tickLeague();
    expect(
      (await batchDetails(batch.id, 0)).fixtures.every(
        (f) => f.state === "queued",
      ),
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM league_attempts a JOIN league_fixtures f ON f.id=a.fixture_id WHERE f.batch_id=$1",
          [batch.id],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      Number(
        (await pool.query("SELECT count(*) FROM league_attempts")).rows[0]
          .count,
      ),
    ).toBe(attemptsBeforePause);
  } finally {
    await admission(true);
  }
  await tickLeague();
  let details = await batchDetails(batch.id, 0);
  expect(details.fixtures.filter((f) => f.state === "active")).toHaveLength(2);
  const first = details.fixtures.find((f) => f.state === "active")!;
  await transaction(async (db) => {
    const m = await loadMatch(db, first.currentMatchId, true);
    advance(m, m.deadline!);
    submit(m, m.seats[0].id, 1, "D", m.deadline! - 1);
    await saveMatch(db, m);
    recover(m, m.deadline! + 1000);
    recover(m, m.deadline! + 1000);
    await saveMatch(db, m);
  });
  const aborted = await fixtureReplay(first.id, 1);
  expect(aborted.match?.phase).toBe("aborted");
  expect(aborted.results).toEqual([]);
  expect(JSON.stringify(aborted)).not.toMatch(
    /ownMove|revealedMoves|rngState|acceptedAt/,
  );
  for (let wave = 0; wave < 8; wave++) {
    await tickLeague();
    details = await batchDetails(batch.id, 0);
    if (details.batch.state === "finished") break;
    const active = details.fixtures.filter((f) => f.state === "active");
    expect(active.length).toBeGreaterThan(0);
    const used = new Set<string>();
    for (const f of active) {
      expect(used.has(f.a) || used.has(f.b)).toBe(false);
      used.add(f.a);
      used.add(f.b);
      await transaction(async (db) => {
        const m = await loadMatch(db, f.currentMatchId, true);
        advance(m, m.deadline!);
        while (m.phase !== "finished") {
          if (m.phase === "collecting") {
            for (const seat of m.seats)
              submit(m, seat.id, m.round, "C", m.deadline! - 1);
          } else advance(m, m.deadline!);
          await saveMatch(db, m);
        }
        await saveMatch(db, m); // repeated persistence cannot double credit
      });
    }
    if (
      (await batchDetails(batch.id, 0)).fixtures.every(
        (f) => f.state === "settled",
      )
    ) {
      await admission(false);
      try {
        await tickLeague();
        expect((await batchDetails(batch.id, 0)).batch.state).toBe("finished");
      } finally {
        await admission(true);
      }
      break;
    }
  }
  await tickLeague();
  details = await batchDetails(batch.id, 0);
  expect(details.batch.state).toBe("finished");
  expect(details.fixtures).toHaveLength(6);
  expect(details.fixtures.every((f) => f.state === "settled")).toBe(true);
  expect(
    details.standings.map((s) => [
      s.points,
      s.mutualCooperations,
      s.played,
      s.rank,
    ]),
  ).toEqual(Array(4).fill([60, 60, 3, 1]));
  const replay = await fixtureReplay(first.id);
  expect(replay.attempt).toBe(2);
  expect(replay.results).toHaveLength(20);
  expect(replay.seats).toHaveLength(2);
  expect(replay.storedResultsOnly).toBe(true);
  expect((await fixtureReplay(first.id, 1)).results).toEqual([]);
  await expect(
    pool.query("UPDATE league_fixtures SET entry_a_id=entry_b_id WHERE id=$1", [
      first.id,
    ]),
  ).rejects.toThrow("immutable");
  await expect(
    pool.query("UPDATE league_settlements SET a_points=0 WHERE fixture_id=$1", [
      first.id,
    ]),
  ).rejects.toThrow("immutable");
  await expect(
    pool.query("DELETE FROM league_attempts WHERE fixture_id=$1", [first.id]),
  ).rejects.toThrow("immutable");
  const page = await fixtureReplay(first.id, undefined, 2);
  expect(page.attempts.map((a) => a.attempt)).toEqual([1]);
  expect(page.attempt).toBe(2); // attempt history cursor does not change the selected replay
  const counts = await pool.query(
    "SELECT count(*) FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1",
    [batch.id],
  );
  expect(Number(counts.rows[0].count)).toBe(6);
  const ownerIds = await Promise.all(
    owners.map(async (r) => (await authenticate(r)).ownerId),
  );
  expect(
    (
      await pool.query(
        "SELECT 1 FROM balance_entries WHERE owner_id=ANY($1::uuid[])",
        [ownerIds],
      )
    ).rowCount,
  ).toBe(0);
  const settledBefore = (
    await pool.query(
      "SELECT s.* FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1 ORDER BY s.fixture_id",
      [batch.id],
    )
  ).rows;
  await pool.query(
    "UPDATE matches SET terminal_at=now()-interval '91 days' WHERE id IN (SELECT a.match_id FROM league_attempts a JOIN league_fixtures f ON f.id=a.fixture_id WHERE f.batch_id=$1)",
    [batch.id],
  );
  for (let i = 0; i < 100; i++) {
    await retentionBatch();
    if (
      !(
        await pool.query(
          "SELECT 1 FROM matches m JOIN league_attempts a ON a.match_id=m.id JOIN league_fixtures f ON f.id=a.fixture_id WHERE f.batch_id=$1 AND m.history_expired_at IS NULL",
          [batch.id],
        )
      ).rowCount
    )
      break;
  }
  const archived = await fixtureReplay(first.id);
  expect(archived.match!.historyExpired).toBe(true);
  expect(archived.results).toEqual([]);
  expect(archived.seats).toEqual(replay.seats);
  expect((await batchDetails(batch.id, 0)).standings).toEqual(
    details.standings,
  );
  expect(
    (
      await pool.query(
        "SELECT s.* FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1 ORDER BY s.fixture_id",
        [batch.id],
      )
    ).rows,
  ).toEqual(settledBefore);
});

it("three timeouts pause later admission until a genuinely new external controller reconnects", async () => {
  const owners: IncomingMessage[] = [],
    bots: string[] = [];
  for (let i = 0; i < 4; i++) {
    const g = await createGuest("Offline league " + i);
    const req = {
      headers: { cookie: "dds_session=" + g.secret },
    } as IncomingMessage;
    owners.push(req);
    const b =
      i === 0
        ? await createExternalBot(req, {
            name: "Reconnect bot",
            controllerEpoch: 0,
          })
        : await transaction((db) =>
            publishVisual(
              req,
              { name: "Healthy " + i, workspace: starter("cooperate") },
              db,
              0,
            ),
          );
    bots.push(String(b.id));
  }
  const credential = await mintCredential(owners[0], bots[0], {
    controllerEpoch: 0,
  });
  const ext = {
    headers: { authorization: "Bearer " + credential.secret },
  } as IncomingMessage;
  const lease = await acquireBot(ext);
  const batch = await transaction((db) =>
    createBatch(owners[0], { name: "Offline readiness" }, db),
  );
  for (let i = 0; i < 4; i++)
    await transaction((db) =>
      registerEntry(owners[i], batch.id, { botId: bots[i] }, db),
    );
  await transaction((db) => closeRegistration(owners[0], batch.id, {}, db));
  await tickLeague();
  let details = await batchDetails(batch.id, 0);
  const entry = details.entries.find((e) => e.botId === bots[0])!;
  const fixture = details.fixtures.find(
    (f) => f.state === "active" && (f.a === entry.id || f.b === entry.id),
  )!;
  expect(fixture).toBeDefined();
  await transaction(async (db) => {
    const m = await loadMatch(db, fixture.currentMatchId, true);
    advance(m, m.deadline!);
    for (let i = 0; i < 3; i++) {
      const visual = m.seats.find((s) => s.kind === "visual")!;
      submit(m, visual.id, m.round, "C", m.deadline! - 1);
      advance(m, m.deadline!);
      await saveMatch(db, m);
      advance(m, m.deadline!);
      await saveMatch(db, m);
    }
  });
  details = await batchDetails(batch.id, 0);
  expect(
    details.entries.find((e) => e.id === entry.id)!.offlineAt,
  ).not.toBeNull();
  await heartbeatBot(ext, { controllerEpoch: lease.controllerEpoch });
  await tickLeague();
  expect(
    (await batchDetails(batch.id, 0)).entries.find((e) => e.id === entry.id)!
      .offlineAt,
  ).not.toBeNull();
  await expect(
    transaction((db) => resumeEntry(owners[0], batch.id, {}, db)),
  ).rejects.toThrow("Reconnect");
  await acquireBot(ext);
  await tickLeague();
  expect(
    (await batchDetails(batch.id, 0)).entries.find((e) => e.id === entry.id)!
      .offlineAt,
  ).toBeNull();
  expect(
    (await batchDetails(batch.id, 0)).fixtures.filter(
      (f) => f.state === "active" && (f.a === entry.id || f.b === entry.id),
    ),
  ).toHaveLength(1);
  // Complete with direct engine moves so no active fixture pollutes subsequent integration runs.
  for (let wave = 0; wave < 8; wave++) {
    await tickLeague();
    details = await batchDetails(batch.id, 0);
    if (details.batch.state === "finished") break;
    for (const f of details.fixtures.filter((f) => f.state === "active"))
      await transaction(async (db) => {
        const m = await loadMatch(db, f.currentMatchId, true);
        if (m.phase === "countdown") advance(m, m.deadline!);
        while (m.phase !== "finished") {
          if (m.phase === "collecting")
            for (const seat of m.seats)
              submit(m, seat.id, m.round, "C", m.deadline! - 1);
          else advance(m, m.deadline!);
          await saveMatch(db, m);
        }
      });
  }
  await tickLeague();
  expect((await batchDetails(batch.id, 0)).batch.state).toBe("finished");
});
