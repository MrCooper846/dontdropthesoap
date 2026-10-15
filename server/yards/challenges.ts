import { ExpiringMap } from "../lifecycle/expiring";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { z } from "zod";
import { randomUUID, randomBytes } from "node:crypto";
import { json, body, rateLimit } from "../http";
import { resource } from "../commands/resources";
import { authenticate, type Principal } from "../auth/sessions";
import { pool, dbTime } from "../persistence/db";
import { requireYard, requireNearby, requireNear, blocked } from "./world";
import { RuleError } from "../../domain/match/model";
import { settingsSchema } from "../../shared/protocol/commands";
import {
  createMatch,
  addSeat,
  makeSeat,
  defaults,
} from "../../domain/match/engine";
import { entrant, seatCaps } from "../bots/participation";
import { saveMatch } from "../matches/repository";
import { config } from "../config";
const inviteTimes = new ExpiringMap<number[]>(4096, 60000);
export const pruneInvitationBudgets = () => inviteTimes.prune();
export async function challengeHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  if (!config.FEATURE_YARD) return false;
  if (path === "/challenges" && method === "GET") {
    const p = await authenticate(req);
    requireYard(p.ownerId);
    const q = await pool.query(
      "SELECT c.*,a.display_name AS creator_name,b.display_name AS target_name FROM challenge_invites c JOIN owners a ON a.id=c.creator_id JOIN owners b ON b.id=c.target_id WHERE (c.creator_id=$1 OR c.target_id=$1) AND c.expires_at>now() ORDER BY c.created_at DESC LIMIT 50",
      [p.ownerId],
    );
    json(res, 200, {
      challenges: q.rows.filter((r) => !blocked(r.creator_id, r.target_id)),
    });
    return true;
  }
  if (path === "/challenges" && method === "POST") {
    const result = await resource(
      req,
      await body(req),
      "challenge.create",
      async (db, payload) => {
        const p = await authenticate(req, db);
        const now = performance.now(),
          recent = (inviteTimes.get(p.ownerId) ?? []).filter(
            (t) => now - t < 60000,
          );
        if (recent.length >= 5)
          throw new RuleError(
            "RATE_LIMITED",
            "At most five invitations per minute",
          );
        recent.push(now);
        inviteTimes.set(p.ownerId, recent);
        const data = z
          .object({
            ownerId: z.string().uuid(),
            circleId: z.string().max(64),
            settings: settingsSchema.optional(),
            botId: z.string().uuid().optional(),
          })
          .strict()
          .parse(payload);
        if (data.ownerId === p.ownerId || blocked(p.ownerId, data.ownerId))
          throw new RuleError("FORBIDDEN");
        requireNearby(p.ownerId, data.ownerId);
        requireNear(p.ownerId, data.circleId);
        const circle = await db.query(
          "SELECT id FROM circles WHERE id=$1 FOR UPDATE",
          [data.circleId],
        );
        if (!circle.rowCount) throw new RuleError("NOT_FOUND");
        if (
          (
            await db.query(
              "SELECT 1 FROM matches WHERE circle_id=$1 AND phase NOT IN ('finished','cancelled','aborted')",
              [data.circleId],
            )
          ).rowCount
        )
          throw new RuleError("CAPACITY_FULL");
        await seatCaps(db, p, data.botId);
        if (data.botId) await entrant(db, p, data.botId);
        const id = randomUUID(),
          settings = { ...(data.settings ?? defaults), maxSeats: 2 };
        await db.query(
          "INSERT INTO challenge_invites(id,creator_id,target_id,circle_id,settings_json,creator_bot_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '30 seconds')",
          [
            id,
            p.ownerId,
            data.ownerId,
            data.circleId,
            JSON.stringify(settings),
            data.botId ?? null,
          ],
        );
        return { id };
      },
    );
    json(res, 201, result);
    return true;
  }
  const response = path.match(/^\/challenges\/([^/]+)\/(accept|decline)$/);
  if (response && method === "POST") {
    const id = z.string().uuid().parse(response[1]);
    const result = await resource(
      req,
      await body(req),
      "challenge." + response[2] + ":" + id,
      async (db, payload) => {
        const accepted = z
          .object({ botId: z.string().uuid().optional() })
          .strict()
          .parse(payload);
        const p = await authenticate(req, db);
        const q = await db.query(
          "SELECT * FROM challenge_invites WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!q.rowCount || q.rows[0].target_id !== p.ownerId)
          throw new RuleError("NOT_FOUND");
        const invitation = q.rows[0];
        if (
          invitation.status !== "pending" ||
          new Date(invitation.expires_at).getTime() <= (await dbTime(db))
        )
          throw new RuleError("INVITE_EXPIRED");
        if (response[2] === "decline") {
          await db.query(
            "UPDATE challenge_invites SET status='declined' WHERE id=$1",
            [id],
          );
          return { declined: true };
        }
        if (blocked(invitation.creator_id, p.ownerId))
          throw new RuleError("FORBIDDEN");
        requireNear(p.ownerId, invitation.circle_id);
        requireNear(invitation.creator_id, invitation.circle_id);
        const creator = (
          await db.query(
            "SELECT id,display_name,controller_epoch FROM owners WHERE id=$1 AND disabled_at IS NULL FOR SHARE",
            [invitation.creator_id],
          )
        ).rows[0];
        if (!creator) throw new RuleError("NOT_FOUND");
        const creatorPrincipal: Principal = {
          ...p,
          id: creator.id,
          ownerId: creator.id,
          name: creator.display_name,
          epoch: Number(creator.controller_epoch),
        };
        await seatCaps(db, p, accepted.botId);
        await seatCaps(
          db,
          creatorPrincipal,
          invitation.creator_bot_id ?? undefined,
        );
        await db.query("SELECT id FROM circles WHERE id=$1 FOR UPDATE", [
          invitation.circle_id,
        ]);
        if (
          (
            await db.query(
              "SELECT id FROM matches WHERE circle_id=$1 AND phase NOT IN ('finished','cancelled','aborted')",
              [invitation.circle_id],
            )
          ).rowCount
        )
          throw new RuleError("CAPACITY_FULL");
        if (
          Number(
            (
              await db.query(
                "SELECT count(*) FROM matches WHERE circle_id IS NOT NULL AND phase NOT IN ('finished','cancelled','aborted')",
              )
            ).rows[0].count,
          ) >= config.MAX_ACTIVE_MATCHES
        )
          throw new RuleError(
            "CAPACITY_FULL",
            "All configured tables are busy",
          );
        const matchId = randomUUID(),
          m = createMatch(
            matchId,
            creator.id,
            "challenge",
            invitation.settings_json,
            await dbTime(db),
            randomBytes(4).readUInt32LE(),
            invitation.circle_id,
          );
        addSeat(
          m,
          await entrant(
            db,
            creatorPrincipal,
            invitation.creator_bot_id ?? undefined,
          ),
        );
        addSeat(m, await entrant(db, p, accepted.botId));
        await saveMatch(db, m);
        await db.query(
          "UPDATE challenge_invites SET status='accepted',match_id=$2 WHERE id=$1",
          [id, matchId],
        );
        return { matchId };
      },
    );
    json(res, 200, result);
    return true;
  }
  return false;
}
