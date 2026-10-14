import { config } from "../config";
import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import type { Principal } from "../auth/sessions";
import { makeSeat, project } from "../../domain/match/engine";
import { RuleError, type Match } from "../../domain/match/model";
import { randomUUID } from "node:crypto";
import { pool } from "../persistence/db";
import { botPrincipal, assertScope, isBotOnline } from "./identity";
export async function entrant(db: PoolClient, p: Principal, botId?: string) {
  if (!botId) return makeSeat(randomUUID(), p.ownerId, p.name);
  if (!config.FEATURE_EXTERNAL_BOTS) throw new RuleError("NOT_FOUND");
  const q = await db.query(
    "SELECT b.id,b.name,b.kind,v.id AS version_id FROM bots b JOIN LATERAL (SELECT id FROM bot_versions WHERE bot_id=b.id ORDER BY revision DESC LIMIT 1) v ON true WHERE b.id=$1 AND b.owner_id=$2 AND b.archived_at IS NULL FOR SHARE OF b",
    [botId, p.ownerId],
  );
  if (!q.rowCount) throw new RuleError("NOT_FOUND");
  const b = q.rows[0];
  if (b.kind !== "external") throw new RuleError("FORBIDDEN");
  if (!isBotOnline(botId)) throw new RuleError("BOT_OFFLINE");
  const seat = makeSeat(
    randomUUID(),
    p.ownerId,
    b.name,
    "external",
    b.id,
    b.version_id,
  );
  seat.ownerName = p.name;
  return seat;
}
export async function seatCaps(db: PoolClient, p: Principal, botId?: string) {
  const q = await db.query(
    "SELECT s.kind,v.bot_id FROM match_seats s JOIN matches m ON m.id=s.match_id LEFT JOIN bot_versions v ON v.id=s.bot_version_id WHERE s.owner_id=$1 AND m.phase NOT IN ('finished','cancelled','aborted')",
    [p.ownerId],
  );
  if (
    q.rowCount! >= 2 ||
    (!botId && q.rows.some((s) => s.kind === "human")) ||
    (botId && q.rows.some((s) => s.bot_id === botId))
  )
    throw new RuleError(
      "ALREADY_SEATED",
      "Entrant or owner has reached its active-seat limit",
    );
}
export function botsReady(m: Match) {
  return m.seats.every(
    (s) => s.kind !== "external" || (!!s.botId && isBotOnline(s.botId)),
  );
}
export async function assignments(req: IncomingMessage) {
  const p = await botPrincipal(req);
  assertScope(p, "observations:read");
  const q = await pool.query(
    "SELECT m.state_json FROM matches m WHERE m.phase NOT IN ('finished','cancelled','aborted') AND EXISTS(SELECT 1 FROM match_seats s JOIN bot_versions v ON v.id=s.bot_version_id WHERE s.match_id=m.id AND v.bot_id=$1) ORDER BY m.created_at LIMIT 2",
    [p.id],
  );
  return {
    assignments: q.rows.map((row) => project(row.state_json, null, p.id)),
  };
}
