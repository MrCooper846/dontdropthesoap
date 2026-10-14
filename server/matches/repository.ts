import type { PoolClient } from "pg";
import type { Match } from "../../domain/match/model";
import { RuleError } from "../../domain/match/model";
import { project } from "../../domain/match/engine";
import { randomUUID } from "node:crypto";
export async function loadMatch(
  db: PoolClient,
  id: string,
  lock = false,
): Promise<Match> {
  const q = await db.query(
    "SELECT state_json FROM matches WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
    [id],
  );
  if (!q.rowCount) throw new RuleError("NOT_FOUND");
  return q.rows[0].state_json;
}
export async function saveMatch(
  db: PoolClient,
  m: Match,
  eventType = "match.snapshot",
) {
  await db.query(
    "INSERT INTO matches(id,circle_id,host_owner_id,mode,phase,version,state_json,deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET host_owner_id=excluded.host_owner_id,phase=excluded.phase,version=excluded.version,state_json=excluded.state_json,deadline=excluded.deadline",
    [
      m.id,
      m.circleId,
      m.hostOwnerId,
      m.mode,
      m.phase,
      m.version,
      JSON.stringify(m),
      m.deadline ? new Date(m.deadline) : null,
    ],
  );
  for (const s of m.seats)
    await db.query(
      "INSERT INTO match_seats(id,match_id,owner_id,bot_version_id,kind,name,score,ready,abandoned) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=excluded.name,score=excluded.score,ready=excluded.ready,abandoned=excluded.abandoned",
      [
        s.id,
        m.id,
        s.ownerId,
        s.botVersionId,
        s.kind,
        s.name,
        s.score,
        s.ready,
        s.abandoned,
      ],
    );
  if (m.phase === "waiting" || m.phase === "cancelled")
    await db.query(
      "DELETE FROM match_seats WHERE match_id=$1 AND NOT(id=ANY($2::text[]))",
      [m.id, m.seats.map((s) => s.id)],
    );
  if (m.round) {
    await db.query(
      "INSERT INTO rounds(match_id,number,state,deadline) VALUES($1,$2,$3,$4) ON CONFLICT(match_id,number) DO UPDATE SET state=excluded.state,deadline=excluded.deadline",
      [m.id, m.round, m.phase, m.deadline ? new Date(m.deadline) : null],
    );
    for (const p of m.pairs)
      await db.query(
        "INSERT INTO pairings(id,match_id,round_number,a_seat_id,b_seat_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [p.id, m.id, m.round, p.a, p.b],
      );
    for (const [seatId, d] of Object.entries(m.moves))
      await db.query(
        "INSERT INTO moves(match_id,round_number,seat_id,move,source,accepted_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [m.id, m.round, seatId, d.move, d.source, new Date(d.acceptedAt)],
      );
  }
  for (const r of m.results)
    await db.query(
      "INSERT INTO round_results(pair_id,match_id,round_number,result_json) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [r.pairId, m.id, r.round, JSON.stringify(r)],
    );
  if (m.phase === "finished" && m.mode !== "league")
    for (const s of [...m.seats].sort((a, b) =>
      (a.ownerId ?? "").localeCompare(b.ownerId ?? ""),
    ))
      if (s.ownerId)
        await db.query(
          "INSERT INTO balance_entries(id,owner_id,match_id,delta) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,match_id) DO NOTHING",
          [randomUUID(), s.ownerId, m.id, s.score],
        );
  await db.query(
    "INSERT INTO match_events(match_id,sequence,type,visibility,payload) VALUES($1,$2,$3,'public',$4) ON CONFLICT DO NOTHING",
    [
      m.id,
      Number(
        (
          await db.query(
            "SELECT coalesce(max(sequence),0)+1 AS next FROM match_events WHERE match_id=$1",
            [m.id],
          )
        ).rows[0].next,
      ),
      eventType,
      JSON.stringify(project(m, null)),
    ],
  );
}
