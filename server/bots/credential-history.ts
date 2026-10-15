import { z } from "zod";
import type { IncomingMessage } from "node:http";
import { authenticate } from "../auth/sessions";
import { pool } from "../persistence/db";
import { RuleError } from "../../domain/match/model";
const cursor = z
  .object({ at: z.iso.datetime(), id: z.string().uuid() })
  .strict();
export async function credentialHistory(
  req: IncomingMessage,
  botId: string,
  before?: string | null,
) {
  z.string().uuid().parse(botId);
  const p = await authenticate(req);
  if (
    !(
      await pool.query(
        "SELECT 1 FROM bots WHERE id=$1 AND owner_id=$2 AND kind='external'",
        [botId, p.ownerId],
      )
    ).rowCount
  )
    throw new RuleError("NOT_FOUND");
  let after: z.infer<typeof cursor> | undefined;
  if (before !== undefined && before !== null) {
    try {
      after = cursor.parse(
        JSON.parse(
          Buffer.from(z.string().max(256).parse(before), "base64url").toString(
            "utf8",
          ),
        ),
      );
    } catch {
      throw new RuleError("INVALID_PAYLOAD", "Invalid credential cursor");
    }
  }
  const rows = (
    await pool.query(
      "SELECT id,expires_at,revoked_at,to_char(expires_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS cursor_at FROM bot_credentials WHERE bot_id=$1 AND ($2::timestamptz IS NULL OR (expires_at,id)<($2::timestamptz,$3::uuid)) ORDER BY expires_at DESC,id DESC LIMIT 101",
      [botId, after?.at ?? null, after?.id ?? null],
    )
  ).rows;
  return {
    credentials: rows.slice(0, 100).map(({ id, expires_at, revoked_at }) => ({
      id,
      expires_at,
      revoked_at,
    })),
    next:
      rows.length > 100
        ? Buffer.from(
            JSON.stringify({ at: rows[99].cursor_at, id: rows[99].id }),
          ).toString("base64url")
        : null,
  };
}
