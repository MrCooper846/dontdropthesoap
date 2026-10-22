import { pool } from "../persistence/db";
import type { Match } from "../../domain/match/model";

// Read only this authenticated owner's seats. Do not return hidden moves or
// another owner's private feedback in the navigation/history listing.
export async function ownedMatches(ownerId: string) {
  const { rows } = await pool.query(
    `SELECT m.id,m.circle_id,m.phase,m.created_at,m.state_json->>'round' AS round,
      s.id AS seat_id,s.name,s.kind,s.score,s.abandoned
     FROM matches m JOIN match_seats s ON s.match_id=m.id
     WHERE s.owner_id=$1
     ORDER BY CASE WHEN m.phase IN ('waiting','countdown','collecting','revealing') THEN 0 ELSE 1 END,
       m.created_at DESC,m.id DESC LIMIT 20`,
    [ownerId],
  );
  return {
    matches: rows.map((r) => ({
      id: r.id,
      circleId: r.circle_id,
      phase: r.phase as Match["phase"],
      round: Number(r.round),
      seatId: r.seat_id,
      name: r.name,
      kind: r.kind as Match["seats"][number]["kind"],
      score: r.score,
      abandoned: r.abandoned,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
