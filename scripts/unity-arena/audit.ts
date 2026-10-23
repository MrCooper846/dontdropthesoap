import { UnityStore } from "./store";
export async function audit(store: UnityStore, shiftId?: string) {
  const results = await store.db.query(
    `SELECT s.id,s.state_json->'state'->>'phase' AS phase,
    (s.state_json->'state'->>'revenue')::integer AS revenue,
    (s.state_json->'state'->>'spent')::integer AS spent,
    COALESCE((SELECT sum(w.amount) FROM unity_restaurant_wallet w WHERE w.shift_id=s.id),0)::integer AS credits,
    (SELECT count(*) FROM unity_restaurant_wallet w WHERE w.shift_id=s.id)::integer AS credit_count,
    jsonb_array_length(s.state_json->'state'->'crew') AS crew_count
    FROM unity_restaurant_shifts s WHERE ($1::uuid IS NULL OR s.id=$1) ORDER BY s.id`,
    [shiftId ?? null],
  );
  const duplicate = await store.db.query(
    "SELECT count(*)::integer AS count FROM (SELECT player_id,shift_id FROM unity_restaurant_wallet GROUP BY player_id,shift_id HAVING count(*)>1) q",
  );
  if (shiftId && !results.rowCount)
    throw Error("Requested native shift was not found");
  if (
    results.rows.some(
      (s) => !["waiting", "active", "finished"].includes(s.phase),
    )
  )
    throw Error("Canonical native shift shape does not match the auditor");
  const mismatches = results.rows.filter(
    (s) =>
      s.phase === "finished" &&
      (s.credits !== s.revenue - s.spent || s.credit_count !== s.crew_count),
  );
  return {
    shifts: results.rows,
    duplicateCredits: duplicate.rows[0].count,
    mismatches,
    passed: duplicate.rows[0].count === 0 && mismatches.length === 0,
  };
}
