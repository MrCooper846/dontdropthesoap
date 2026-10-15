import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { z } from "zod";
import { authenticate, assertController } from "../auth/sessions";
import { config } from "../config";
import { pool } from "../persistence/db";
import { resource } from "../commands/resources";
import { RuleError } from "../../domain/match/model";
import { body, json } from "../http";

export async function publishExternal(
  req: IncomingMessage,
  input: unknown,
  db: PoolClient,
  epoch: number,
  botId: string,
) {
  if (!config.FEATURE_EXTERNAL_BOTS) throw new RuleError("NOT_FOUND");
  const data = z
    .object({ externalLabel: z.string().trim().min(1).max(100) })
    .strict()
    .parse(input);
  const p = await authenticate(req, db);
  await assertController(db, p, epoch);
  const owned = await db.query(
    "SELECT id FROM bots WHERE id=$1 AND owner_id=$2 AND kind='external' AND archived_at IS NULL FOR UPDATE",
    [botId, p.ownerId],
  );
  if (!owned.rowCount) throw new RuleError("NOT_FOUND");
  const revision = Number(
    (
      await db.query(
        "SELECT coalesce(max(revision),0)+1 AS revision FROM bot_versions WHERE bot_id=$1",
        [botId],
      )
    ).rows[0].revision,
  );
  if (revision > 2147483647) throw new RuleError("CAPACITY_FULL");
  const versionId = randomUUID();
  await db.query(
    "INSERT INTO bot_versions(id,bot_id,revision,external_label) VALUES($1,$2,$3,$4)",
    [versionId, botId, revision, data.externalLabel],
  );
  return {
    id: botId,
    kind: "external",
    versionId,
    revision,
    externalLabel: data.externalLabel,
  };
}
export async function externalVersionsHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  const route = path.match(/^\/bots\/([^/]+)\/versions(?:\/([^/]+))?$/);
  if (!route) return false;
  const botId = z.string().uuid().parse(route[1]);
  const p = await authenticate(req);
  const owned = await pool.query(
    "SELECT kind FROM bots WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL",
    [botId, p.ownerId],
  );
  if (!owned.rowCount) throw new RuleError("NOT_FOUND");
  if (owned.rows[0].kind !== "external") return false;
  if (!config.FEATURE_EXTERNAL_BOTS) throw new RuleError("NOT_FOUND");
  if (method === "POST" && !route[2]) {
    json(
      res,
      201,
      await resource(
        req,
        await body(req),
        "external.publish:" + botId,
        (db, payload, epoch) => publishExternal(req, payload, db, epoch, botId),
      ),
    );
    return true;
  }
  if (method === "GET" && route[2]) {
    const version =
      route[2] === "latest" ? null : z.string().uuid().parse(route[2]);
    const result = await pool.query(
      "SELECT v.id AS version_id,v.bot_id,v.revision,v.external_label FROM bot_versions v JOIN bots b ON b.id=v.bot_id WHERE b.id=$1 AND b.owner_id=$2 AND b.kind='external' AND b.archived_at IS NULL AND ($3::uuid IS NULL OR v.id=$3) ORDER BY v.revision DESC LIMIT 1",
      [botId, p.ownerId, version],
    );
    if (!result.rowCount) throw new RuleError("NOT_FOUND");
    json(res, 200, result.rows[0]);
    return true;
  }
  throw new RuleError("NOT_FOUND");
}
