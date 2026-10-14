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
});
