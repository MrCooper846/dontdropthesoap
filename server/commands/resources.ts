import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { z } from "zod";
import { authenticate, assertController } from "../auth/sessions";
import { transaction } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
export const resourceSchema = z
  .object({
    commandId: z.string().uuid(),
    key: z.string().uuid(),
    controllerEpoch: z.number().int().nonnegative(),
    payload: z.unknown(),
  })
  .strict();
export async function resource(
  req: IncomingMessage,
  input: unknown,
  target: string,
  work: (
    db: PoolClient,
    payload: unknown,
    epoch: number,
  ) => Promise<Record<string, unknown>>,
) {
  const c = resourceSchema.parse(input),
    hash = createHash("sha256")
      .update(JSON.stringify({ target, ...c }))
      .digest("hex");
  return transaction(async (db) => {
    if (target.startsWith("challenge."))
      await db.query("SELECT pg_advisory_xact_lock(724102)");
    const p = await authenticate(req, db);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      p.id,
    ]);
    await assertController(db, p, c.controllerEpoch);
    const receipt = await db.query(
      "SELECT payload_hash,response FROM command_receipts WHERE principal_id=$1 AND command_id=$2",
      [p.id, c.commandId],
    );
    if (receipt.rowCount) {
      if (receipt.rows[0].payload_hash !== hash)
        throw new RuleError("COMMAND_ID_REUSED");
      return receipt.rows[0].response;
    }
    const key = await db.query(
      "UPDATE creation_keys SET consumed_at=now() WHERE id=$1 AND principal_id=$2 AND expires_at>now() AND consumed_at IS NULL RETURNING id",
      [c.key, p.id],
    );
    if (!key.rowCount) throw new RuleError("KEY_EXPIRED");
    const result = await work(db, c.payload, c.controllerEpoch);
    const { secret, ...metadata } = result;
    await db.query(
      "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response) VALUES($1,$2,$3,$4)",
      [
        p.id,
        c.commandId,
        hash,
        JSON.stringify(
          secret ? { ...metadata, secretUnavailable: true } : result,
        ),
      ],
    );
    return result;
  });
}
