import { createHash } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
export const operatorLabel = z.string().trim().min(1).max(80);
const base = {
  commandId: z.string().uuid(),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
};
export const operatorRequest = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("owner.disable") }).strict(),
  z.object({ ...base, action: z.literal("owner.enable") }).strict(),
  z.object({ ...base, action: z.literal("session.revoke") }).strict(),
  z.object({ ...base, action: z.literal("credential.revoke") }).strict(),
  z.object({ ...base, action: z.literal("voice.remove") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("report.review"),
      status: z.enum(["reviewed", "dismissed", "actioned"]),
    })
    .strict(),
]);
export async function applyOperator(label: unknown, input: unknown) {
  const actor = operatorLabel.parse(label),
    c = operatorRequest.parse(input);
  const hash = createHash("sha256")
    .update(JSON.stringify({ actor, ...c }))
    .digest("hex");
  return transaction(async (db) => {
    // Operator actions only lock their target row, never a later match/bot row.
    // This avoids reversing the game-command match -> authority lock order.
    await db.query("SELECT pg_advisory_xact_lock(724110)");
    const prior = (
      await db.query(
        "SELECT payload_hash,response FROM operator_actions WHERE id=$1",
        [c.commandId],
      )
    ).rows[0];
    if (prior) {
      if (prior.payload_hash !== hash) throw new RuleError("COMMAND_ID_REUSED");
      return prior.response;
    }
    let before: Record<string, unknown>, after: Record<string, unknown>;
    if (
      c.action === "owner.disable" ||
      c.action === "owner.enable" ||
      c.action === "voice.remove"
    ) {
      before = (
        await db.query(
          'SELECT controller_epoch::text AS epoch,disabled_at AS "disabledAt" FROM owners WHERE id=$1 FOR UPDATE',
          [c.targetId],
        )
      ).rows[0];
      if (!before) throw new RuleError("NOT_FOUND");
      const value =
        c.action === "owner.disable"
          ? "coalesce(disabled_at,clock_timestamp())"
          : c.action === "owner.enable"
            ? "NULL"
            : "disabled_at";
      after = (
        await db.query(
          "UPDATE owners SET disabled_at=" +
            value +
            ',controller_epoch=controller_epoch+1 WHERE id=$1 RETURNING controller_epoch::text AS epoch,disabled_at AS "disabledAt"',
          [c.targetId],
        )
      ).rows[0];
    } else if (
      c.action === "session.revoke" ||
      c.action === "credential.revoke"
    ) {
      const table =
        c.action === "session.revoke" ? "sessions" : "bot_credentials";
      before = (
        await db.query(
          'SELECT revoked_at AS "revokedAt" FROM ' +
            table +
            " WHERE id=$1 FOR UPDATE",
          [c.targetId],
        )
      ).rows[0];
      if (!before) throw new RuleError("NOT_FOUND");
      after = (
        await db.query(
          "UPDATE " +
            table +
            ' SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=$1 RETURNING revoked_at AS "revokedAt"',
          [c.targetId],
        )
      ).rows[0];
    } else {
      before = (
        await db.query("SELECT status FROM reports WHERE id=$1 FOR UPDATE", [
          c.targetId,
        ])
      ).rows[0];
      if (!before) throw new RuleError("NOT_FOUND");
      after = (
        await db.query(
          "UPDATE reports SET status=$2 WHERE id=$1 RETURNING status",
          [c.targetId, c.status],
        )
      ).rows[0];
    }
    const response = JSON.parse(
      JSON.stringify({
        commandId: c.commandId,
        action: c.action,
        targetId: c.targetId,
        before,
        after,
      }),
    );
    await db.query(
      "INSERT INTO operator_actions(id,operator_label,action,target_id,reason,payload_hash,response) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [c.commandId, actor, c.action, c.targetId, c.reason, hash, response],
    );
    return response;
  });
}
const reportCursor = z
  .object({ at: z.iso.datetime(), id: z.string().uuid() })
  .strict();
export async function listReports(
  label: unknown,
  status: unknown = "open",
  cursor?: string,
) {
  operatorLabel.parse(label);
  const state = z
    .enum(["open", "reviewed", "dismissed", "actioned"])
    .parse(status);
  let after: z.infer<typeof reportCursor> | undefined;
  if (cursor) {
    try {
      after = reportCursor.parse(
        JSON.parse(
          Buffer.from(z.string().max(256).parse(cursor), "base64url").toString(
            "utf8",
          ),
        ),
      );
    } catch {
      throw new RuleError("INVALID_PAYLOAD", "Invalid report cursor");
    }
  }
  const rows = (
    await pool.query(
      `SELECT id,reporter_id AS "reporterId",subject_owner_id AS "subjectOwnerId",match_id AS "matchId",reason,status,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM reports WHERE status=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT 101`,
      [state, after?.at ?? null, after?.id ?? null],
    )
  ).rows;
  return {
    reports: rows.slice(0, 100),
    next:
      rows.length > 100
        ? Buffer.from(
            JSON.stringify({ at: rows[99].createdAt, id: rows[99].id }),
          ).toString("base64url")
        : null,
  };
}
export async function listAudit(label: unknown, after: unknown = "0") {
  operatorLabel.parse(label);
  const cursor = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,17})$/)
    .parse(after);
  const rows = (
    await pool.query(
      'SELECT id,sequence::text,operator_label AS operator,action,target_id AS "targetId",reason,response,created_at AS "createdAt" FROM operator_actions WHERE sequence>$1::bigint ORDER BY sequence LIMIT 101',
      [cursor],
    )
  ).rows;
  return {
    actions: rows.slice(0, 100),
    next: rows.length > 100 ? rows[99].sequence : null,
  };
}
