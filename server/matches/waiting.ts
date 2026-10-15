import type { Match } from "../../domain/match/model";
import { pool, transaction, dbTime } from "../persistence/db";
import { saveMatch } from "./repository";
import { increment } from "../observability/metrics";
export const EMPTY_WAITING_MS = 15 * 60 * 1000;
export type RoomPresent = (match: Match) => boolean;
// Presence is authoritative ephemeral state; the absence start is durable.
// Only one writer invokes this bounded scan from its ordered deadline tick.
export async function inspectWaitingRoom(id: string, present: RoomPresent) {
  return transaction(async (db) => {
    const result = await db.query(
      "SELECT state_json,extract(epoch FROM waiting_empty_since)*1000 AS empty_since FROM matches WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!result.rowCount) return false;
    const row = result.rows[0],
      m: Match = row.state_json;
    if (m.phase !== "waiting" || m.mode === "league") return false;
    if (present(m)) {
      if (row.empty_since !== null)
        await db.query(
          "UPDATE matches SET waiting_empty_since=NULL WHERE id=$1",
          [id],
        );
      return false;
    }
    if (row.empty_since === null) {
      await db.query(
        "UPDATE matches SET waiting_empty_since=clock_timestamp() WHERE id=$1",
        [id],
      );
      return false;
    }
    if ((await dbTime(db)) - Number(row.empty_since) < EMPTY_WAITING_MS)
      return false;
    m.phase = "cancelled";
    m.cancelReason = "empty";
    m.deadline = null;
    for (const seat of m.seats) seat.ready = false;
    m.version++;
    await saveMatch(db, m, "match.waiting-expired");
    return true;
  });
}
let cursor: string | null = null;
export async function sweepWaitingRooms(present: RoomPresent) {
  const rows = (
    await pool.query(
      "SELECT id FROM matches WHERE phase='waiting' AND mode<>'league' AND ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT 100",
      [cursor],
    )
  ).rows;
  let expired = 0;
  for (const row of rows)
    if (await inspectWaitingRoom(row.id, present)) {
      expired++;
      increment("waiting.expired");
    }
  // Advance only after successful processing; a transient failure retries this page.
  cursor = rows.length === 100 ? rows.at(-1)!.id : null;
  return expired;
}
