import type { PoolClient } from "pg";
import type { Match } from "../../domain/match/model";
export async function reconcileLeagueMatch(db: PoolClient, m: Match) {
  if (m.mode !== "league") return;
  const q = await db.query(
    "SELECT f.* FROM league_fixtures f JOIN league_attempts a ON a.fixture_id=f.id WHERE a.match_id=$1 AND f.current_match_id=$1 FOR UPDATE OF f",
    [m.id],
  );
  if (!q.rowCount) return;
  const f = q.rows[0];
  if (f.state === "settled") return;
  if (m.phase === "cancelled" || m.phase === "aborted") {
    await db.query(
      "UPDATE league_fixtures SET state='queued',current_match_id=NULL WHERE id=$1",
      [f.id],
    );
    await db.query("DELETE FROM league_active_bots WHERE fixture_id=$1", [
      f.id,
    ]);
    return;
  }
  const entries = (
    await db.query(
      "SELECT e.*,b.controller_epoch FROM league_entries e JOIN bots b ON b.id=e.bot_id WHERE e.id=ANY($1::uuid[])",
      [[f.entry_a_id, f.entry_b_id]],
    )
  ).rows;
  for (const entry of entries) {
    const seat = m.seats.find(
      (s) =>
        s.botId === entry.bot_id && s.botVersionId === entry.bot_version_id,
    );
    if (!seat) throw new Error("League seat/version mismatch");
    const trailing = (
      await db.query(
        "SELECT source FROM moves WHERE match_id=$1 AND seat_id=$2 ORDER BY round_number DESC LIMIT 3",
        [m.id, seat.id],
      )
    ).rows;
    if (trailing.length === 3 && trailing.every((r) => r.source === "timeout"))
      await db.query(
        "UPDATE league_entries SET offline_at=coalesce(offline_at,now()),offline_epoch=coalesce(offline_epoch,$2) WHERE id=$1",
        [entry.id, entry.controller_epoch],
      );
  }
  if (m.phase !== "finished") return;
  const a = entries.find((e) => e.id === f.entry_a_id),
    b = entries.find((e) => e.id === f.entry_b_id);
  const sa = m.seats.find((s) => s.botId === a.bot_id)!,
    sb = m.seats.find((s) => s.botId === b.bot_id)!;
  if (m.seats.length !== 2 || m.results.length !== m.settings.rounds)
    throw new Error("Incomplete league settlement");
  const mutual = m.results.filter(
    (r) => r.aMove === "C" && r.bMove === "C",
  ).length;
  await db.query(
    "INSERT INTO league_settlements(fixture_id,match_id,entry_a_id,entry_b_id,a_points,b_points,mutual_cooperations) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(fixture_id) DO NOTHING",
    [f.id, m.id, a.id, b.id, sa.score, sb.score, mutual],
  );
  await db.query(
    "UPDATE league_fixtures SET state='settled',settled_match_id=$2 WHERE id=$1",
    [f.id, m.id],
  );
  await db.query("DELETE FROM league_active_bots WHERE fixture_id=$1", [f.id]);
}
