import { randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { z } from "zod";
import { authenticate, assertController, hashSecret } from "../auth/sessions";
import { pool, transaction } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
export type BotPrincipal = {
  id: string;
  ownerId: string;
  credentialId: string;
  epoch: number;
  name: string;
  scopes: string[];
};
type Lease = { credentialId: string; epoch: number; seenAt: number };
const leases = new Map<string, Lease>();
export async function botPrincipal(
  req: IncomingMessage,
  db: PoolClient | typeof pool = pool,
): Promise<BotPrincipal> {
  const secret = req.headers.authorization?.match(
    /^Bearer ([a-f0-9]{64})$/,
  )?.[1];
  if (!secret) throw new RuleError("AUTH_REQUIRED");
  const result = await db.query(
    "SELECT b.id,b.owner_id,b.name,b.controller_epoch,c.id AS credential_id,c.scopes FROM bot_credentials c JOIN bots b ON b.id=c.bot_id JOIN owners o ON o.id=b.owner_id WHERE c.secret_hash=$1 AND c.revoked_at IS NULL AND c.expires_at>now() AND b.archived_at IS NULL AND o.disabled_at IS NULL",
    [hashSecret(secret)],
  );
  if (!result.rowCount) throw new RuleError("AUTH_REQUIRED");
  const row = result.rows[0];
  return {
    id: row.id,
    ownerId: row.owner_id,
    credentialId: row.credential_id,
    epoch: Number(row.controller_epoch),
    name: row.name,
    scopes: row.scopes,
  };
}
export function assertScope(p: BotPrincipal, scope: string) {
  if (!p.scopes.includes(scope)) throw new RuleError("FORBIDDEN");
}
export function isBotOnline(botId: string, now = Date.now()) {
  const lease = leases.get(botId);
  return !!lease && now - lease.seenAt < 15000;
}
export function assertLease(p: BotPrincipal, epoch: number, now = Date.now()) {
  const lease = leases.get(p.id);
  if (
    p.epoch !== epoch ||
    lease?.epoch !== epoch ||
    lease.credentialId !== p.credentialId
  )
    throw new RuleError("CONTROLLER_STALE");
  if (now - lease.seenAt >= 15000) throw new RuleError("BOT_OFFLINE");
}
export async function lockBotController(
  db: PoolClient,
  p: BotPrincipal,
  epoch: number,
) {
  const q = await db.query(
    "SELECT b.controller_epoch FROM bots b JOIN bot_credentials c ON c.bot_id=b.id JOIN owners o ON o.id=b.owner_id WHERE b.id=$1 AND c.id=$2 AND c.revoked_at IS NULL AND c.expires_at>now() AND b.archived_at IS NULL AND o.disabled_at IS NULL FOR SHARE OF b,c,o",
    [p.id, p.credentialId],
  );
  if (!q.rowCount) throw new RuleError("AUTH_REQUIRED");
  if (Number(q.rows[0].controller_epoch) !== epoch)
    throw new RuleError("CONTROLLER_STALE");
  assertLease(p, epoch);
}
export async function acquireBot(req: IncomingMessage) {
  return transaction(async (db) => {
    const p = await botPrincipal(req, db);
    assertScope(p, "moves:write");
    const q = await db.query(
      "UPDATE bots SET controller_epoch=controller_epoch+1 WHERE id=$1 RETURNING controller_epoch",
      [p.id],
    );
    const epoch = Number(q.rows[0].controller_epoch);
    return { p, epoch };
  }).then(({ p, epoch }) => {
    leases.set(p.id, {
      credentialId: p.credentialId,
      epoch,
      seenAt: Date.now(),
    });
    return {
      botId: p.id,
      controllerEpoch: epoch,
      heartbeatMs: 5000,
      offlineAfterMs: 15000,
    };
  });
}
export async function heartbeatBot(req: IncomingMessage, input: unknown) {
  const { controllerEpoch } = z
    .object({ controllerEpoch: z.number().int().nonnegative() })
    .strict()
    .parse(input);
  const p = await botPrincipal(req);
  const lease = leases.get(p.id);
  if (
    p.epoch !== controllerEpoch ||
    lease?.epoch !== controllerEpoch ||
    lease.credentialId !== p.credentialId
  )
    throw new RuleError("CONTROLLER_STALE");
  lease.seenAt = Date.now();
  return { ok: true, controllerEpoch };
}
export async function createExternalBot(req: IncomingMessage, input: unknown) {
  const data = z
    .object({
      name: z.string().trim().min(1).max(32),
      controllerEpoch: z.number().int(),
      externalLabel: z.string().trim().min(1).max(100).default("initial"),
    })
    .strict()
    .parse(input);
  return transaction(async (db) => {
    const p = await authenticate(req, db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    await assertController(db, p, data.controllerEpoch);
    const count = await db.query(
      "SELECT count(*) FROM bots WHERE owner_id=$1 AND archived_at IS NULL",
      [p.ownerId],
    );
    if (Number(count.rows[0].count) >= 20)
      throw new RuleError(
        "CAPACITY_FULL",
        "Alpha owners may have at most 20 bots",
      );
    const id = randomUUID(),
      versionId = randomUUID();
    await db.query(
      "INSERT INTO bots(id,owner_id,name,kind) VALUES($1,$2,$3,'external')",
      [id, p.ownerId, data.name],
    );
    await db.query(
      "INSERT INTO bot_versions(id,bot_id,revision,external_label) VALUES($1,$2,1,$3)",
      [versionId, id, data.externalLabel],
    );
    return { id, name: data.name, kind: "external", versionId, revision: 1 };
  });
}
export async function listOwnedBots(req: IncomingMessage) {
  const p = await authenticate(req);
  const result = await pool.query(
    "SELECT b.id,b.name,b.kind,v.id AS version_id,v.revision,v.external_label FROM bots b JOIN LATERAL (SELECT id,revision,external_label FROM bot_versions WHERE bot_id=b.id ORDER BY revision DESC LIMIT 1) v ON true WHERE b.owner_id=$1 AND b.archived_at IS NULL ORDER BY b.name",
    [p.ownerId],
  );
  return result.rows.map((row) => ({ ...row, online: isBotOnline(row.id) }));
}
export async function mintCredential(
  req: IncomingMessage,
  botId: string,
  input: unknown,
) {
  z.string().uuid().parse(botId);
  const { controllerEpoch } = z
    .object({ controllerEpoch: z.number().int() })
    .strict()
    .parse(input);
  const secret = randomBytes(32).toString("hex"),
    id = randomUUID();
  await transaction(async (db) => {
    const p = await authenticate(req, db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    const bot = await db.query(
      "SELECT id FROM bots WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR UPDATE",
      [botId, p.ownerId],
    );
    if (!bot.rowCount) throw new RuleError("NOT_FOUND");
    await assertController(db, p, controllerEpoch);
    const count = await db.query(
      "SELECT count(*) FROM bot_credentials c JOIN bots b ON b.id=c.bot_id WHERE b.owner_id=$1 AND c.revoked_at IS NULL AND c.expires_at>now()",
      [p.ownerId],
    );
    if (Number(count.rows[0].count) >= 5)
      throw new RuleError(
        "CAPACITY_FULL",
        "At most five active bot credentials per owner",
      );
    await db.query(
      "INSERT INTO bot_credentials(id,bot_id,secret_hash,scopes,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')",
      [id, botId, hashSecret(secret), ["observations:read", "moves:write"]],
    );
  });
  return { credentialId: id, secret, expiresInDays: 30 };
}
export async function revokeCredential(
  req: IncomingMessage,
  botId: string,
  credentialId: string,
  input: unknown,
) {
  z.string().uuid().parse(botId);
  z.string().uuid().parse(credentialId);
  const { controllerEpoch } = z
    .object({ controllerEpoch: z.number().int() })
    .strict()
    .parse(input);
  await transaction(async (db) => {
    const p = await authenticate(req, db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    const bot = await db.query(
      "SELECT id FROM bots WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [botId, p.ownerId],
    );
    if (!bot.rowCount) throw new RuleError("NOT_FOUND");
    await assertController(db, p, controllerEpoch);
    const q = await db.query(
      "UPDATE bot_credentials SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND bot_id=$2 RETURNING id",
      [credentialId, botId],
    );
    if (!q.rowCount) throw new RuleError("NOT_FOUND");
  });
  if (leases.get(botId)?.credentialId === credentialId) leases.delete(botId);
  return { ok: true, credentialId };
}
export function clearBotLeases() {
  leases.clear();
}
