import { setImmediate as yieldTurn } from "node:timers/promises";
import type { Match } from "../../domain/match/model";
import { transaction } from "./db";
import { duration, increment } from "../observability/metrics";
type Counts = {
  receipts: number;
  keys: number;
  sessions: number;
  credentials: number;
  reports: number;
  invites: number;
  histories: number;
  notifications: number;
};
const empty = (): Counts => ({
  receipts: 0,
  keys: 0,
  sessions: 0,
  credentials: 0,
  reports: 0,
  invites: 0,
  histories: 0,
  notifications: 0,
});
// A transaction removes at most 100 rows per metadata table and one bounded
// terminal match. Row locks are skipped, never held across a network call.
export async function retentionBatch(): Promise<Counts> {
  const started = performance.now();
  try {
    const counts = await transaction(async (db) => {
      await db.query("SET LOCAL lock_timeout='100ms'");
      const counts = empty();
      counts.receipts =
        (
          await db.query(
            "DELETE FROM command_receipts WHERE (principal_id,command_id) IN (SELECT principal_id,command_id FROM command_receipts WHERE created_at<now()-interval '7 days' ORDER BY created_at,principal_id,command_id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.keys =
        (
          await db.query(
            "DELETE FROM creation_keys WHERE id IN (SELECT id FROM creation_keys WHERE expires_at<now()-interval '7 days' ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.sessions =
        (
          await db.query(
            "DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at<now()-interval '7 days' ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.credentials =
        (
          await db.query(
            "DELETE FROM bot_credentials WHERE id IN (SELECT id FROM bot_credentials WHERE expires_at<now()-interval '7 days' ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.reports =
        (
          await db.query(
            "DELETE FROM reports WHERE id IN (SELECT id FROM reports WHERE created_at<now()-interval '30 days' ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.invites =
        (
          await db.query(
            "DELETE FROM challenge_invites WHERE id IN (SELECT id FROM challenge_invites WHERE expires_at<now()-interval '7 days' ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      counts.notifications =
        (
          await db.query(
            "DELETE FROM match_events WHERE (match_id,sequence) IN (SELECT match_id,sequence FROM match_events WHERE type='match.history-expired' AND created_at<now()-interval '7 days' ORDER BY created_at,match_id,sequence LIMIT 100 FOR UPDATE SKIP LOCKED)",
          )
        ).rowCount ?? 0;
      const old = (
        await db.query(
          "SELECT id,state_json FROM matches WHERE phase IN ('finished','cancelled','aborted') AND terminal_at<now()-interval '90 days' AND history_expired_at IS NULL ORDER BY terminal_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
      ).rows[0];
      if (old) {
        const last = Number(
          (
            await db.query(
              "SELECT coalesce(max(sequence),0) AS last FROM match_events WHERE match_id=$1",
              [old.id],
            )
          ).rows[0].last,
        );
        const m: Match = old.state_json;
        // Keep durable identity/settings/seat-score summaries, not an internal
        // RNG, last hidden move or a second copy of every resolved choice.
        m.historyExpired = true;
        m.moves = {};
        m.pairs = [];
        m.results = [];
        m.rngState = 1;
        m.clankerMemory = "C";
        m.version++;
        await db.query("DELETE FROM visual_decisions WHERE match_id=$1", [
          old.id,
        ]);
        await db.query("DELETE FROM bot_runtime_states WHERE match_id=$1", [
          old.id,
        ]);
        await db.query("DELETE FROM round_results WHERE match_id=$1", [old.id]);
        await db.query("DELETE FROM moves WHERE match_id=$1", [old.id]);
        await db.query("DELETE FROM pairings WHERE match_id=$1", [old.id]);
        await db.query("DELETE FROM rounds WHERE match_id=$1", [old.id]);
        await db.query("DELETE FROM match_events WHERE match_id=$1", [old.id]);
        await db.query(
          "UPDATE matches SET state_json=$2,version=$3,history_expired_at=clock_timestamp() WHERE id=$1",
          [old.id, JSON.stringify(m), m.version],
        );
        // Deliver the new snapshot through the existing durable outbox without
        // storing another copy of the expired choices/private state.
        await db.query(
          "INSERT INTO match_events(match_id,sequence,type,visibility,payload) VALUES($1,$2,'match.history-expired','public','{}')",
          [old.id, last + 1],
        );
        counts.histories = 1;
      }
      return counts;
    });
    if (counts.histories) increment("retention.history");
    return counts;
  } finally {
    duration("retention.batch", performance.now() - started);
  }
}
export function startRetention() {
  let stopped = false,
    pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (stopped) return;
    pending = (async () => {
      const started = performance.now(),
        total = empty();
      let backlog = false;
      do {
        const counts = await retentionBatch();
        for (const key of Object.keys(total) as (keyof Counts)[])
          total[key] += counts[key];
        backlog =
          counts.histories > 0 ||
          Object.entries(counts).some(
            ([key, n]) => key !== "histories" && n === 100,
          );
        await yieldTurn();
      } while (!stopped && backlog && performance.now() - started < 250);
      if (Object.values(total).some(Boolean))
        console.log(
          JSON.stringify({ event: "retention.complete", counts: total }),
        );
      return backlog;
    })()
      .then((backlog) => schedule(backlog ? 1000 : 60000))
      .catch(() => {
        console.error(
          JSON.stringify({
            event: "retention.failed",
            code: "SERVICE_UNAVAILABLE",
          }),
        );
        schedule(1000);
      })
      .finally(() => {
        pending = undefined;
      });
  };
  function schedule(ms: number) {
    if (!stopped) {
      timer = setTimeout(run, ms);
      timer.unref();
    }
  }
  run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await pending;
  };
}
