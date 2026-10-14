import { config } from "../config";
import { requireNear } from "../yards/world";
import { assertScope } from "../bots/identity";
import { actor, lockActor } from "../auth/actors";
import { entrant, seatCaps, botsReady } from "../bots/participation";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import {
  parseCommand,
  moveSchema,
  readySchema,
  settingsSchema,
  type Ack,
} from "../../shared/protocol/commands";
import {
  addSeat,
  makeSeat,
  createMatch,
  defaults,
  submit,
  ready,
  leave,
  requestStart,
  configure,
  project,
  advance,
  recover,
} from "../../domain/match/engine";
import { RuleError, type Match } from "../../domain/match/model";
import {
  authenticate,
  assertController,
  type Principal,
} from "../auth/sessions";
import { transaction, dbTime, pool } from "../persistence/db";
import { loadMatch, saveMatch } from "../matches/repository";
const hash = (p: unknown) =>
  createHash("sha256").update(JSON.stringify(p)).digest("hex");
export async function controller(req: IncomingMessage) {
  return transaction(async (db) => {
    const p = await authenticate(req, db);
    const q = await db.query(
      "UPDATE owners SET controller_epoch=controller_epoch+1 WHERE id=$1 RETURNING controller_epoch",
      [p.ownerId],
    );
    return Number(q.rows[0].controller_epoch);
  });
}
export async function command(
  req: IncomingMessage,
  input: unknown,
): Promise<Ack> {
  const c = parseCommand(input);
  try {
    return await transaction(async (db) => {
      const p = await actor(req, db);
      if (c.controllerEpoch !== p.epoch)
        throw new RuleError("CONTROLLER_STALE");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        p.id + ":" + c.commandId,
      ]);
      const receipt = await db.query(
        "SELECT payload_hash,response FROM command_receipts WHERE principal_id=$1 AND command_id=$2",
        [p.id, c.commandId],
      );
      if (receipt.rowCount) {
        if (receipt.rows[0].payload_hash !== hash(c))
          throw new RuleError("COMMAND_ID_REUSED");
        return receipt.rows[0].response as Ack;
      }
      const m = await loadMatch(db, c.matchId, true);
      if (m.mode === "league" && p.kind === "browser")
        throw new RuleError(
          "FORBIDDEN",
          "League fixtures are managed by the scheduler",
        );
      await lockActor(db, p, c.controllerEpoch);
      const now = await dbTime(db);
      const seat = m.seats.find((s) => s.id === c.seatId);
      if (c.type.startsWith("seat.") || c.type === "move.submit") {
        if (
          !seat ||
          (p.kind === "bot"
            ? c.type !== "move.submit" ||
              seat.botId !== p.id ||
              seat.kind !== "external"
            : seat.ownerId !== p.ownerId ||
              (c.type === "move.submit" && seat.kind !== "human"))
        )
          throw new RuleError("FORBIDDEN");
      }
      if (c.type.startsWith("match.")) {
        if (p.kind === "bot" || m.hostOwnerId !== p.ownerId)
          throw new RuleError("FORBIDDEN");
        if (c.matchVersion !== m.version)
          throw new RuleError("VERSION_CONFLICT");
      }
      if (c.type === "move.submit") {
        const payload = moveSchema.parse(c.payload);
        if (c.round === undefined) throw new RuleError("INVALID_PAYLOAD");
        submit(m, c.seatId!, c.round, payload.move, now);
      } else if (c.type === "seat.ready") {
        if (
          (seat?.kind === "external" || seat?.kind === "visual") &&
          !botsReady(m)
        )
          throw new RuleError("BOT_OFFLINE");
        ready(m, c.seatId!, readySchema.parse(c.payload).ready);
      } else if (c.type === "seat.leave") {
        z.object({}).strict().parse(c.payload);
        leave(m, c.seatId!);
      } else if (c.type === "match.start") {
        z.object({}).strict().parse(c.payload);
        if (!botsReady(m)) throw new RuleError("BOT_OFFLINE");
        requestStart(m, now);
      } else if (c.type === "match.configure")
        configure(m, settingsSchema.parse(c.payload));
      await saveMatch(db, m);
      if (c.type === "move.submit")
        await db.query(
          "INSERT INTO match_events(match_id,sequence,type,visibility,recipient_seat_id,payload) SELECT $1,coalesce(max(sequence),0)+1,'move.accepted','private',$2,$3 FROM match_events WHERE match_id=$1",
          [
            m.id,
            c.seatId,
            JSON.stringify({
              round: c.round,
              seatId: c.seatId,
              move: moveSchema.parse(c.payload).move,
            }),
          ],
        );
      const response: Ack = {
        v: 1,
        commandId: c.commandId,
        ok: true,
        matchVersion: m.version,
      };
      await db.query(
        "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response) VALUES($1,$2,$3,$4)",
        [p.id, c.commandId, hash(c), JSON.stringify(response)],
      );
      return response;
    });
  } catch (e) {
    if (e instanceof RuleError)
      return {
        v: 1,
        commandId: c.commandId,
        ok: false,
        error: {
          code: e.code,
          message: e.message,
          retryable: e.code === "SERVICE_UNAVAILABLE",
        },
      };
    throw e;
  }
}
export async function newMatch(req: IncomingMessage, input: unknown) {
  const data = z
    .object({
      commandId: z.string().uuid(),
      key: z.string().uuid(),
      mode: z.enum(["human", "mixed", "challenge"]).default("human"),
      settings: settingsSchema.optional(),
      circleId: z.string().max(64).optional(),
      botId: z.string().uuid().optional(),
      controllerEpoch: z.number().int(),
    })
    .strict()
    .parse(input);
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(724102)");
    const p = await authenticate(req, db);
    if (data.controllerEpoch !== p.epoch)
      throw new RuleError("CONTROLLER_STALE");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    const receipt = await db.query(
      "SELECT payload_hash,response FROM command_receipts WHERE principal_id=$1 AND command_id=$2",
      [p.id, data.commandId],
    );
    if (receipt.rowCount) {
      if (receipt.rows[0].payload_hash !== hash(data))
        throw new RuleError("COMMAND_ID_REUSED");
      return receipt.rows[0].response;
    }
    const key = await db.query(
      "UPDATE creation_keys SET consumed_at=now() WHERE id=$1 AND principal_id=$2 AND expires_at>now() AND consumed_at IS NULL RETURNING id",
      [data.key, p.id],
    );
    if (!key.rowCount) throw new RuleError("KEY_EXPIRED");
    await assertController(db, p, data.controllerEpoch);
    if (config.FEATURE_YARD && !data.circleId)
      throw new RuleError("FORBIDDEN", "Create matches through a yard circle");
    if (data.circleId) {
      requireNear(p.ownerId, data.circleId);
      const c = await db.query(
        "SELECT id,mode FROM circles WHERE id=$1 FOR UPDATE",
        [data.circleId],
      );
      if (!c.rowCount) throw new RuleError("NOT_FOUND");
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) FROM matches WHERE circle_id IS NOT NULL AND phase NOT IN ('finished','cancelled','aborted')",
            )
          ).rows[0].count,
        ) >= config.MAX_ACTIVE_MATCHES
      )
        throw new RuleError("CAPACITY_FULL", "All configured tables are busy");
      if (data.mode !== c.rows[0].mode) throw new RuleError("INVALID_PAYLOAD");
      if (
        (
          await db.query(
            "SELECT id FROM matches WHERE circle_id=$1 AND phase NOT IN ('finished','cancelled','aborted')",
            [data.circleId],
          )
        ).rowCount
      )
        throw new RuleError("CAPACITY_FULL", "This circle already has a match");
    }
    await seatCaps(db, p, data.botId);
    const id = randomUUID(),
      m = createMatch(
        id,
        p.ownerId,
        data.mode,
        data.settings ?? defaults,
        await dbTime(db),
        randomBytes(4).readUInt32LE(),
        data.circleId ?? null,
      );
    addSeat(m, await entrant(db, p, data.botId));
    await saveMatch(db, m);
    const response = { id };
    await db.query(
      "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response) VALUES($1,$2,$3,$4)",
      [p.id, data.commandId, hash(data), JSON.stringify(response)],
    );
    return response;
  });
}
export async function joinMatch(
  req: IncomingMessage,
  id: string,
  input: unknown,
) {
  const data = z
    .object({
      controllerEpoch: z.number().int(),
      botId: z.string().uuid().optional(),
      commandId: z.string().uuid(),
      key: z.string().uuid(),
    })
    .strict()
    .parse(input);
  return transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(724102)");
    const p = await authenticate(req, db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    const m = await loadMatch(db, id, true);
    await assertController(db, p, data.controllerEpoch);
    const payloadHash = hash({ id, ...data });
    const receipt = await db.query(
      "SELECT payload_hash,response FROM command_receipts WHERE principal_id=$1 AND command_id=$2",
      [p.id, data.commandId],
    );
    if (receipt.rowCount) {
      if (receipt.rows[0].payload_hash !== payloadHash)
        throw new RuleError("COMMAND_ID_REUSED");
      return receipt.rows[0].response;
    }
    const key = await db.query(
      "UPDATE creation_keys SET consumed_at=now() WHERE id=$1 AND principal_id=$2 AND expires_at>now() AND consumed_at IS NULL RETURNING id",
      [data.key, p.id],
    );
    if (!key.rowCount) throw new RuleError("KEY_EXPIRED");
    if (config.FEATURE_YARD && !m.circleId) throw new RuleError("FORBIDDEN");
    if (m.circleId) requireNear(p.ownerId, m.circleId);
    if (
      m.seats.some(
        (s) => s.ownerId === p.ownerId && (s.botId ?? undefined) !== data.botId,
      )
    )
      throw new RuleError("ALREADY_SEATED");
    if (!m.seats.some((s) => s.ownerId === p.ownerId)) {
      await seatCaps(db, p, data.botId);
      addSeat(m, await entrant(db, p, data.botId));
      await saveMatch(db, m);
    }
    const response = project(m, p.ownerId);
    await db.query(
      "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response) VALUES($1,$2,$3,$4)",
      [p.id, data.commandId, payloadHash, JSON.stringify(response)],
    );
    return response;
  });
}
export async function observe(req: IncomingMessage, id: string) {
  const p = await actor(req);
  const db = await pool.connect();
  try {
    const m = await loadMatch(db, id);
    if (p.kind === "bot") assertScope(p, "observations:read");
    if (p.kind === "bot" && !m.seats.some((s) => s.botId === p.id))
      throw new RuleError("FORBIDDEN");
    return project(
      m,
      p.kind === "browser" ? p.ownerId : null,
      p.kind === "bot" ? p.id : null,
    );
  } finally {
    db.release();
  }
}
export async function tickMatches() {
  const ids = (
    await pool.query(
      "SELECT id FROM matches WHERE deadline<=clock_timestamp() AND phase IN ('countdown','collecting','revealing')",
    )
  ).rows;
  for (const row of ids)
    await transaction(async (db) => {
      const m = await loadMatch(db, row.id, true);
      if (m.phase === "countdown" && !botsReady(m)) {
        m.phase = "waiting";
        m.deadline = null;
        for (const s of m.seats) s.ready = false;
        m.version++;
        await saveMatch(db, m);
        return;
      }
      if (advance(m, await dbTime(db))) await saveMatch(db, m);
    });
}
export async function recoverMatches() {
  const ids = (
    await pool.query(
      "SELECT id FROM matches WHERE phase NOT IN ('finished','cancelled','aborted')",
    )
  ).rows;
  for (const row of ids)
    await transaction(async (db) => {
      const m = await loadMatch(db, row.id, true);
      if (recover(m, await dbTime(db)))
        await saveMatch(db, m, "match.interrupted");
    });
}
