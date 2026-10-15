import { pool } from "../persistence/db";
import { increment } from "./metrics";
// One indexed oldest-outbox lookup and one active-match aggregate; no event
// payloads or historical member identities are retained by monitoring.
export class DurableMetrics {
  private sampledAt = -Infinity;
  private available = false;
  private oldestAge = 0;
  private hasOutbox = false;
  private matches = -1;
  private seats = -1;
  async refresh() {
    const started = performance.now();
    try {
      const row = (
        await pool.query(
          "SELECT extract(epoch FROM clock_timestamp())*1000 AS now_ms,(SELECT extract(epoch FROM created_at)*1000 FROM match_events WHERE published_at IS NULL ORDER BY created_at LIMIT 1) AS oldest_ms,count(*)::int AS matches,coalesce(sum(jsonb_array_length(state_json->'seats')),0)::int AS seats FROM matches WHERE phase IN ('waiting','countdown','collecting','revealing')",
        )
      ).rows[0];
      this.matches = Number(row.matches);
      this.seats = Number(row.seats);
      this.hasOutbox = row.oldest_ms !== null;
      this.oldestAge = this.hasOutbox
        ? Math.max(0, Number(row.now_ms) - Number(row.oldest_ms))
        : 0;
      this.sampledAt = started;
      this.available = true;
    } catch {
      this.available = false;
      increment("metrics.refresh.failed");
    }
  }
  snapshot() {
    const known = Number.isFinite(this.sampledAt);
    const age = known ? Math.max(0, performance.now() - this.sampledAt) : -1;
    return {
      durableMetricsAvailable: this.available && age >= 0 && age <= 15000,
      durableSampleAgeMs: Math.round(age),
      activeMatches: this.matches,
      activeSeats: this.seats,
      outboxOldestAgeMs: !known
        ? -1
        : this.hasOutbox
          ? Math.round(this.oldestAge + age)
          : 0,
    };
  }
}
