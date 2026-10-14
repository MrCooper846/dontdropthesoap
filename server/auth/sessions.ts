import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { config } from "../config";
import { pool, transaction } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
export type Principal = {
  id: string;
  ownerId: string;
  sessionId: string;
  epoch: number;
  name: string;
  sessionHash: string;
};
export function hashSecret(secret: string) {
  return createHmac("sha256", config.SESSION_SECRET_PEPPER)
    .update(secret)
    .digest("hex");
}
export function cookieSecret(req: IncomingMessage) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("dds_session="))
      ?.slice(12) ?? ""
  );
}
export function csrf(p: Principal) {
  return createHmac("sha256", config.COMMAND_KEY_SIGNING_SECRET)
    .update("csrf:" + p.sessionHash)
    .digest("hex");
}
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function authenticate(
  req: IncomingMessage,
  db: PoolClient | typeof pool = pool,
): Promise<Principal> {
  const secret = cookieSecret(req);
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new RuleError("AUTH_REQUIRED");
  const hash = hashSecret(secret);
  const q = await db.query(
    "SELECT s.id AS session_id,o.id,o.display_name,o.controller_epoch FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.secret_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND o.disabled_at IS NULL",
    [hash],
  );
  if (!q.rowCount) throw new RuleError("AUTH_REQUIRED");
  const row = q.rows[0];
  return {
    id: row.id,
    ownerId: row.id,
    sessionId: row.session_id,
    epoch: Number(row.controller_epoch),
    name: row.display_name,
    sessionHash: hash,
  };
}
export async function createGuest(name: string) {
  const secret = randomBytes(32).toString("hex"),
    ownerId = randomUUID(),
    sessionId = randomUUID();
  await transaction(async (db) => {
    await db.query("INSERT INTO owners(id,display_name) VALUES($1,$2)", [
      ownerId,
      name,
    ]);
    await db.query(
      "INSERT INTO sessions(id,owner_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",
      [sessionId, ownerId, hashSecret(secret)],
    );
  });
  return { secret, ownerId };
}
export function assertOrigin(req: IncomingMessage) {
  if (req.headers.origin !== config.PUBLIC_ORIGIN)
    throw new RuleError("FORBIDDEN", "Request origin is not allowed");
}
export function assertCsrf(req: IncomingMessage, p: Principal) {
  assertOrigin(req);
  if (!safeEqual(String(req.headers["x-csrf-token"] ?? ""), csrf(p)))
    throw new RuleError("FORBIDDEN", "CSRF token required");
}

export async function assertController(
  db: PoolClient,
  p: Principal,
  epoch: number,
) {
  const q = await db.query(
    "SELECT o.controller_epoch FROM owners o JOIN sessions s ON s.owner_id=o.id WHERE o.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND o.disabled_at IS NULL FOR SHARE OF o,s",
    [p.ownerId, p.sessionId],
  );
  if (!q.rowCount) throw new RuleError("AUTH_REQUIRED");
  if (Number(q.rows[0].controller_epoch) !== epoch)
    throw new RuleError("CONTROLLER_STALE");
}
