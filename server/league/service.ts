import { matchesOpen } from "../operators/maintenance";
import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { LEAGUE_RULES, schedule } from "../../domain/league/league";
import { RuleError } from "../../domain/match/model";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
} from "../../domain/match/engine";
import { authenticate } from "../auth/sessions";
import { pool, transaction, dbTime } from "../persistence/db";
import { loadMatch, saveMatch } from "../matches/repository";
import { isBotOnline } from "../bots/identity";
import { botsReady, seatCaps } from "../bots/participation";
import { config } from "../config";
const requireEnabled = () => {
  if (!config.FEATURE_LEAGUE) throw new RuleError("NOT_FOUND");
};
export async function createBatch(
  req: IncomingMessage,
  payload: unknown,
  db: PoolClient,
) {
  requireEnabled();
  const data = z
      .object({
        name: z.string().trim().min(1).max(64),
        registrationMinutes: z.number().int().min(1).max(1440).default(5),
      })
      .strict()
      .parse(payload),
    p = await authenticate(req, db);
  const count = Number(
    (
      await db.query(
        "SELECT count(*) FROM league_batches WHERE state IN ('registration','running')",
      )
    ).rows[0].count,
  );
  if (count >= 4)
    throw new RuleError(
      "CAPACITY_FULL",
      "Four league batches are already open",
    );
  if (
    Number(
      (
        await db.query(
          "SELECT count(*) FROM league_batches WHERE owner_id=$1 AND state IN ('registration','running')",
          [p.ownerId],
        )
      ).rows[0].count,
    ) >= 2
  )
    throw new RuleError("CAPACITY_FULL", "At most two open batches per host");
  const id = randomUUID(),
    deadline = (await dbTime(db)) + data.registrationMinutes * 60000;
  await db.query(
    "INSERT INTO league_batches(id,owner_id,name,rules_json,registration_deadline) VALUES($1,$2,$3,$4,$5)",
    [
      id,
      p.ownerId,
      data.name,
      JSON.stringify(LEAGUE_RULES),
      new Date(deadline),
    ],
  );
  return { id };
}
export async function registerEntry(
  req: IncomingMessage,
  batchId: string,
  payload: unknown,
  db: PoolClient,
) {
  requireEnabled();
  const { botId } = z
      .object({ botId: z.string().uuid() })
      .strict()
      .parse(payload),
    p = await authenticate(req, db);
  const batch = (
    await db.query("SELECT * FROM league_batches WHERE id=$1 FOR UPDATE", [
      batchId,
    ])
  ).rows[0];
  if (!batch) throw new RuleError("NOT_FOUND");
  if (
    batch.state !== "registration" ||
    Date.parse(batch.registration_deadline) <= (await dbTime(db))
  )
    throw new RuleError("REGISTRATION_CLOSED");
  const existing = await db.query(
    "SELECT owner_id FROM league_entries WHERE batch_id=$1",
    [batchId],
  );
  if (existing.rows.some((r) => r.owner_id === p.ownerId))
    throw new RuleError("ALREADY_REGISTERED", "One entry per owner per batch");
  if (existing.rowCount! >= 16) throw new RuleError("CAPACITY_FULL");
  const bot = (
    await db.query(
      "SELECT b.*,v.id AS version_id FROM bots b JOIN LATERAL(SELECT id FROM bot_versions WHERE bot_id=b.id ORDER BY revision DESC LIMIT 1)v ON true WHERE b.id=$1 AND b.owner_id=$2 AND b.archived_at IS NULL FOR SHARE OF b",
      [botId, p.ownerId],
    )
  ).rows[0];
  if (!bot) throw new RuleError("NOT_FOUND");
  if (
    (bot.kind === "visual" && !config.FEATURE_VISUAL_BOTS) ||
    (bot.kind === "external" && !config.FEATURE_EXTERNAL_BOTS)
  )
    throw new RuleError("NOT_FOUND");
  const id = randomUUID();
  await db.query(
    "INSERT INTO league_entries(id,batch_id,owner_id,bot_id,bot_version_id,name,kind) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, batchId, p.ownerId, bot.id, bot.version_id, bot.name, bot.kind],
  );
  return { id, botId, versionId: bot.version_id };
}
export async function withdrawEntry(
  req: IncomingMessage,
  batchId: string,
  payload: unknown,
  db: PoolClient,
) {
  requireEnabled();
  z.object({}).strict().parse(payload);
  const p = await authenticate(req, db),
    batch = (
      await db.query("SELECT * FROM league_batches WHERE id=$1 FOR UPDATE", [
        batchId,
      ])
    ).rows[0];
  if (!batch) throw new RuleError("NOT_FOUND");
  if (
    batch.state !== "registration" ||
    Date.parse(batch.registration_deadline) <= (await dbTime(db))
  )
    throw new RuleError("REGISTRATION_CLOSED");
  await db.query(
    "DELETE FROM league_entries WHERE batch_id=$1 AND owner_id=$2",
    [batchId, p.ownerId],
  );
  return { withdrawn: true };
}
async function freezeBatch(db: PoolClient, batchId: string) {
  const batch = (
    await db.query("SELECT * FROM league_batches WHERE id=$1 FOR UPDATE", [
      batchId,
    ])
  ).rows[0];
  if (!batch || batch.state !== "registration") return;
  const entries = (
    await db.query(
      'SELECT id,owner_id AS "ownerId",bot_id AS "botId",name FROM league_entries WHERE batch_id=$1',
      [batchId],
    )
  ).rows;
  if (entries.length < 4) {
    await db.query("UPDATE league_batches SET state='cancelled' WHERE id=$1", [
      batchId,
    ]);
    return;
  }
  for (const pair of schedule(entries, Number(batch.sequence)))
    await db.query(
      "INSERT INTO league_fixtures(id,batch_id,ordinal,entry_a_id,entry_b_id) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), batchId, pair.ordinal, pair.a, pair.b],
    );
  await db.query("UPDATE league_batches SET state='running' WHERE id=$1", [
    batchId,
  ]);
}
export async function closeRegistration(
  req: IncomingMessage,
  batchId: string,
  payload: unknown,
  db: PoolClient,
) {
  requireEnabled();
  z.object({}).strict().parse(payload);
  const p = await authenticate(req, db),
    batch = (
      await db.query("SELECT * FROM league_batches WHERE id=$1 FOR UPDATE", [
        batchId,
      ])
    ).rows[0];
  if (!batch || batch.owner_id !== p.ownerId) throw new RuleError("NOT_FOUND");
  if (batch.state !== "registration")
    throw new RuleError("REGISTRATION_CLOSED");
  if (
    Number(
      (
        await db.query(
          "SELECT count(*) FROM league_entries WHERE batch_id=$1",
          [batchId],
        )
      ).rows[0].count,
    ) < 4
  )
    throw new RuleError("NOT_READY", "Register at least four owners");
  await freezeBatch(db, batchId);
  return { closed: true };
}
export async function resumeEntry(
  req: IncomingMessage,
  batchId: string,
  payload: unknown,
  db: PoolClient,
) {
  requireEnabled();
  z.object({}).strict().parse(payload);
  const p = await authenticate(req, db),
    entry = (
      await db.query(
        "SELECT e.*,b.controller_epoch FROM league_entries e JOIN bots b ON b.id=e.bot_id WHERE e.batch_id=$1 AND e.owner_id=$2 FOR UPDATE OF e",
        [batchId, p.ownerId],
      )
    ).rows[0];
  if (!entry) throw new RuleError("NOT_FOUND");
  if (
    entry.kind === "external" &&
    (!isBotOnline(entry.bot_id) ||
      Number(entry.controller_epoch) <= Number(entry.offline_epoch ?? -1))
  )
    throw new RuleError(
      "BOT_OFFLINE",
      "Reconnect the external controller before confirming readiness",
    );
  if (entry.kind === "visual" && !config.FEATURE_VISUAL_BOTS)
    throw new RuleError("NOT_FOUND");
  await db.query(
    "UPDATE league_entries SET offline_at=NULL,offline_epoch=NULL WHERE id=$1",
    [entry.id],
  );
  return { ready: true };
}
async function manageWaitingFixtures() {
  const ids = (
    await pool.query(
      "SELECT m.id FROM matches m JOIN league_attempts a ON a.match_id=m.id JOIN league_fixtures f ON f.current_match_id=m.id WHERE m.mode='league' AND m.phase='waiting' AND f.state='active' LIMIT 16",
    )
  ).rows;
  for (const row of ids)
    await transaction(async (db) => {
      const m = await loadMatch(db, row.id, true);
      if (m.phase !== "waiting") return;
      if (!(await matchesOpen(db, true))) return;
      if (!botsReady(m)) {
        m.phase = "cancelled";
        m.deadline = null;
        m.version++;
      } else {
        for (const s of m.seats) ready(m, s.id, true);
        requestStart(m, await dbTime(db));
      }
      await saveMatch(db, m);
    });
}
export async function tickLeague() {
  if (!config.FEATURE_LEAGUE) return;
  await manageWaitingFixtures();
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(724103)");
    await db.query("SELECT pg_advisory_xact_lock(724102)");
    const closing = (
      await db.query(
        "SELECT id FROM league_batches WHERE state='registration' AND registration_deadline<=clock_timestamp() ORDER BY sequence",
      )
    ).rows;
    for (const row of closing) await freezeBatch(db, row.id);
    const flagged = (
      await db.query(
        "SELECT e.id,e.bot_id,e.offline_epoch,b.controller_epoch FROM league_entries e JOIN bots b ON b.id=e.bot_id JOIN league_batches lb ON lb.id=e.batch_id WHERE lb.state='running' AND e.offline_at IS NOT NULL AND e.kind='external'",
      )
    ).rows;
    for (const entry of flagged)
      if (
        isBotOnline(entry.bot_id) &&
        Number(entry.controller_epoch) > Number(entry.offline_epoch)
      )
        await db.query(
          "UPDATE league_entries SET offline_at=NULL,offline_epoch=NULL WHERE id=$1",
          [entry.id],
        );
    const admitting = await matchesOpen(db, true);
    const batches = (
      await db.query(
        "SELECT id FROM league_batches WHERE state='running' ORDER BY sequence",
      )
    ).rows;
    let active = Number(
      (
        await db.query(
          "SELECT count(*) FROM league_fixtures WHERE state='active'",
        )
      ).rows[0].count,
    );
    for (const batch of batches) {
      const candidates = admitting
        ? (
            await db.query(
              "SELECT f.*,a.bot_id AS a_bot,b.bot_id AS b_bot FROM league_fixtures f JOIN league_entries a ON a.id=f.entry_a_id JOIN league_entries b ON b.id=f.entry_b_id WHERE f.batch_id=$1 AND f.state='queued' AND a.offline_at IS NULL AND b.offline_at IS NULL ORDER BY f.ordinal LIMIT 120 FOR UPDATE OF f",
              [batch.id],
            )
          ).rows
        : [];
      for (const fixture of candidates) {
        if (active >= config.MAX_ACTIVE_LEAGUE_FIXTURES) break;
        const entries = (
          await db.query(
            "SELECT e.*,b.archived_at,o.disabled_at,o.display_name FROM league_entries e JOIN bots b ON b.id=e.bot_id JOIN owners o ON o.id=e.owner_id WHERE e.id=ANY($1::uuid[]) ORDER BY e.id FOR SHARE OF b,o",
            [[fixture.entry_a_id, fixture.entry_b_id]],
          )
        ).rows;
        if (
          entries.length !== 2 ||
          entries.some(
            (e) =>
              e.disabled_at ||
              e.archived_at ||
              (e.kind === "external"
                ? !config.FEATURE_EXTERNAL_BOTS || !isBotOnline(e.bot_id)
                : !config.FEATURE_VISUAL_BOTS),
          )
        )
          continue;
        if (
          (
            await db.query(
              "SELECT 1 FROM league_active_bots WHERE bot_id=ANY($1::uuid[])",
              [entries.map((e) => e.bot_id)],
            )
          ).rowCount
        )
          continue;
        let capped = false;
        for (const entry of entries) {
          try {
            await seatCaps(db, { ownerId: entry.owner_id }, entry.bot_id);
          } catch (error) {
            if (error instanceof RuleError && error.code === "ALREADY_SEATED")
              capped = true;
            else throw error;
          }
        }
        if (capped) continue;
        const first = entries.find((e) => e.id === fixture.entry_a_id),
          second = entries.find((e) => e.id === fixture.entry_b_id),
          id = randomUUID(),
          now = await dbTime(db);
        const m = createMatch(
          id,
          first.owner_id,
          "league",
          { ...LEAGUE_RULES },
          now,
          randomBytes(4).readUInt32LE(),
        );
        for (const entry of [first, second]) {
          const seat = makeSeat(
            randomUUID(),
            entry.owner_id,
            entry.name,
            entry.kind,
            entry.bot_id,
            entry.bot_version_id,
          );
          seat.ownerName = entry.display_name;
          addSeat(m, seat);
        }
        for (const seat of m.seats) ready(m, seat.id, true);
        requestStart(m, now);
        await saveMatch(db, m);
        const attempt = fixture.attempt_number + 1;
        await db.query(
          "INSERT INTO league_attempts(fixture_id,attempt_number,match_id) VALUES($1,$2,$3)",
          [fixture.id, attempt, id],
        );
        for (const entry of entries)
          await db.query(
            "INSERT INTO league_active_bots(bot_id,fixture_id) VALUES($1,$2)",
            [entry.bot_id, fixture.id],
          );
        await db.query(
          "UPDATE league_fixtures SET state='active',attempt_number=$2,current_match_id=$3 WHERE id=$1",
          [fixture.id, attempt, id],
        );
        active++;
      }
      const remaining = Number(
        (
          await db.query(
            "SELECT count(*) FROM league_fixtures WHERE batch_id=$1 AND state<>'settled'",
            [batch.id],
          )
        ).rows[0].count,
      );
      if (remaining === 0)
        await db.query(
          "UPDATE league_batches SET state='finished' WHERE id=$1",
          [batch.id],
        );
    }
  });
}
export function startLeague() {
  let stopped = false,
    pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = tickLeague()
      .catch(() => {
        console.error(
          JSON.stringify({
            event: "league.tick.failed",
            code: "SERVICE_UNAVAILABLE",
          }),
        );
      })
      .finally(() => {
        pending = undefined;
      });
  }, 250);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
