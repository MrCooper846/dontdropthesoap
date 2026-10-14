import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { compileWorkspace } from "../../domain/bots/workspace";
import {
  canonicalProgram,
  INTERPRETER_VERSION,
} from "../../domain/bots/program";
import { authenticate, assertController } from "../auth/sessions";
import { pool } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
import { config } from "../config";
export async function publishVisual(
  req: IncomingMessage,
  input: unknown,
  db: PoolClient,
  epoch: number,
  botId?: string,
) {
  if (!config.FEATURE_VISUAL_BOTS) throw new RuleError("NOT_FOUND");
  const data = z
    .object({ name: z.string().trim().min(1).max(32), workspace: z.unknown() })
    .strict()
    .parse(input);
  const program = compileWorkspace(data.workspace),
    programHash = createHash("sha256")
      .update(canonicalProgram(program))
      .digest("hex");
  const p = await authenticate(req, db);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    p.id,
  ]);
  await assertController(db, p, epoch);
  let id = botId;
  if (id) {
    const owned = await db.query(
      "SELECT id FROM bots WHERE id=$1 AND owner_id=$2 AND kind='visual' AND archived_at IS NULL FOR UPDATE",
      [id, p.ownerId],
    );
    if (!owned.rowCount) throw new RuleError("NOT_FOUND");
    await db.query("UPDATE bots SET name=$2 WHERE id=$1", [id, data.name]);
  } else {
    const count = await db.query(
      "SELECT count(*) FROM bots WHERE owner_id=$1 AND archived_at IS NULL",
      [p.ownerId],
    );
    if (Number(count.rows[0].count) >= 20)
      throw new RuleError(
        "CAPACITY_FULL",
        "Alpha owners may have at most 20 bots",
      );
    id = randomUUID();
    await db.query(
      "INSERT INTO bots(id,owner_id,name,kind) VALUES($1,$2,$3,'visual')",
      [id, p.ownerId, data.name],
    );
  }
  const revision = Number(
    (
      await db.query(
        "SELECT coalesce(max(revision),0)+1 AS revision FROM bot_versions WHERE bot_id=$1",
        [id],
      )
    ).rows[0].revision,
  );
  const versionId = randomUUID();
  await db.query(
    "INSERT INTO bot_versions(id,bot_id,revision,workspace_json,program_json,program_hash,interpreter_version,ruleset_version) VALUES($1,$2,$3,$4,$5,$6,$7,1)",
    [
      versionId,
      id,
      revision,
      JSON.stringify(data.workspace),
      JSON.stringify(program),
      programHash,
      INTERPRETER_VERSION,
    ],
  );
  return {
    id,
    name: data.name,
    kind: "visual",
    versionId,
    revision,
    programHash,
    interpreterVersion: INTERPRETER_VERSION,
  };
}
export async function visualVersion(
  req: IncomingMessage,
  botId: string,
  versionId?: string,
) {
  const p = await authenticate(req);
  const result = await pool.query(
    "SELECT b.id AS bot_id,b.name,v.id AS version_id,v.revision,v.workspace_json,v.program_json,v.program_hash,v.interpreter_version FROM bots b JOIN bot_versions v ON v.bot_id=b.id WHERE b.id=$1 AND b.owner_id=$2 AND b.kind='visual' AND b.archived_at IS NULL AND ($3::uuid IS NULL OR v.id=$3) ORDER BY v.revision DESC LIMIT 1",
    [botId, p.ownerId, versionId ?? null],
  );
  if (!result.rowCount) throw new RuleError("NOT_FOUND");
  return result.rows[0];
}
export async function visualFeedback(
  req: IncomingMessage,
  matchId: string,
  seatId: string,
) {
  const p = await authenticate(req);
  const owned = await pool.query(
    "SELECT 1 FROM match_seats WHERE match_id=$1 AND id=$2 AND owner_id=$3 AND kind='visual'",
    [matchId, seatId, p.ownerId],
  );
  if (!owned.rowCount) throw new RuleError("NOT_FOUND");
  return (
    await pool.query(
      "SELECT round_number,status,error_code,trace_json,bot_version_id FROM visual_decisions WHERE match_id=$1 AND seat_id=$2 ORDER BY round_number DESC LIMIT 50",
      [matchId, seatId],
    )
  ).rows;
}
