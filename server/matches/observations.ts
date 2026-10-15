import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { actor } from "../auth/actors";
import { assertScope } from "../bots/identity";
import { transaction } from "../persistence/db";
import { loadMatch } from "./repository";
import { project } from "../../domain/match/engine";
import { RuleError } from "../../domain/match/model";
export async function syncObservation(
  req: IncomingMessage,
  id: string,
  input?: unknown,
) {
  const after =
    input === undefined
      ? 0
      : z.coerce.number().int().nonnegative().parse(input);
  return transaction(async (db) => {
    const p = await actor(req, db);
    await db.query("SELECT id FROM matches WHERE id=$1 FOR SHARE", [id]);
    const m = await loadMatch(db, id);
    if (p.kind === "bot") {
      assertScope(p, "observations:read");
      if (!m.seats.some((s) => s.botId === p.id))
        throw new RuleError("FORBIDDEN");
    }
    const bounds = (
      await db.query(
        "SELECT coalesce(max(sequence),0) AS last,coalesce(min(sequence),0) AS first FROM match_events WHERE match_id=$1",
        [id],
      )
    ).rows[0];
    const last = Number(bounds.last),
      first = Number(bounds.first),
      reset =
        !!m.historyExpired || after > last || (after > 0 && after < first - 1);
    const rows = reset
      ? []
      : (
          await db.query(
            "SELECT sequence,type,visibility,recipient_seat_id,payload FROM match_events WHERE match_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100",
            [id, after],
          )
        ).rows;
    const allowed = new Set(
      m.seats
        .filter((s) =>
          p.kind === "bot" ? s.botId === p.id : s.ownerId === p.ownerId,
        )
        .map((s) => s.id),
    );
    const events = rows
      .filter(
        (e) => e.visibility === "public" || allowed.has(e.recipient_seat_id),
      )
      .map((e) => ({
        v: 1,
        type: e.type,
        matchId: id,
        seq: Number(e.sequence),
        payload: e.payload,
      }));
    const cursor =
      reset || !rows.length ? last : Number(rows[rows.length - 1].sequence);
    return {
      snapshot: project(
        m,
        p.kind === "browser" ? p.ownerId : null,
        p.kind === "bot" ? p.id : null,
      ),
      events,
      cursor,
      hasMore: cursor < last,
      reset,
    };
  });
}
