import type { Namespace } from "socket.io";
import { pool } from "../persistence/db";
import { observe } from "../commands/matches";
import { increment } from "../observability/metrics";
// Delivery must not hold the deadline/coordinator producer behind subscriber
// reads. A single publisher still preserves durable per-event ordering.
export function startOutbox(
  game: Namespace,
  ready: () => boolean,
  afterBatch: () => Promise<void>,
) {
  let stopped = false,
    pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (stopped || pending || !ready()) return;
    pending = (async () => {
      const started = performance.now();
      const q = await pool.query(
        "SELECT match_id,sequence,type,visibility,recipient_seat_id FROM match_events WHERE published_at IS NULL ORDER BY created_at,sequence LIMIT 100",
      );
      for (const row of q.rows) {
        if (stopped) break;
        for (const socket of game.sockets.values())
          if (socket.rooms.has(row.match_id)) {
            try {
              const snapshot = await observe(socket.request, row.match_id);
              if (
                row.visibility !== "public" &&
                snapshot.ownSeatId !== row.recipient_seat_id
              )
                continue;
              socket.emit("match.snapshot", {
                v: 1,
                type: row.type,
                seq: Number(row.sequence),
                payload: snapshot,
              });
            } catch {
              socket.disconnect(true);
            }
          }
        const published = await pool.query(
          "UPDATE match_events SET published_at=now() WHERE match_id=$1 AND sequence=$2 AND published_at IS NULL",
          [row.match_id, row.sequence],
        );
        if (published.rowCount) increment("outbox.published");
        // Cooperative budget between events, not a hard SQL deadline.
        if (performance.now() - started >= 50) break;
      }
      if (!stopped) await afterBatch();
    })()
      .catch(() => {
        increment("outbox.failed");
        console.error(
          JSON.stringify({
            event: "outbox.publish.failed",
            code: "SERVICE_UNAVAILABLE",
          }),
        );
      })
      .finally(() => {
        pending = undefined;
      });
  }, 100);
  timer.unref();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
