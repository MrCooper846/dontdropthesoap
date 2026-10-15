// Read-only diagnostic, never a game-capacity or clock-stability acceptance pass.
import { Pool } from "pg";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
async function main() {
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_load",
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 3000,
  });
  const samples: {
    monotonicMs: number;
    nodeWallMs: number;
    databaseWallMs: number;
    roundTripMs: number;
  }[] = [];
  const started = performance.now();
  try {
    do {
      const before = performance.now(),
        wallBefore = Date.now();
      const {
        rows: [row],
      } = await db.query(
        "SELECT extract(epoch FROM clock_timestamp())*1000 AS now",
      );
      const after = performance.now(),
        wallAfter = Date.now();
      samples.push({
        monotonicMs: (before + after) / 2,
        nodeWallMs: (wallBefore + wallAfter) / 2,
        databaseWallMs: Number(row.now),
        roundTripMs: after - before,
      });
      if (samples.length >= 800)
        throw Error("Clock diagnostic sample bound reached");
      await delay(100);
    } while (performance.now() - started < 61000);
    const deltas = samples.slice(1).map((current, i) => {
      const previous = samples[i];
      const elapsed = current.monotonicMs - previous.monotonicMs;
      return {
        monotonicMs: current.monotonicMs,
        nodeDriftMs: current.nodeWallMs - previous.nodeWallMs - elapsed,
        databaseDriftMs:
          current.databaseWallMs - previous.databaseWallMs - elapsed,
        nodeMinusDatabaseMs: current.nodeWallMs - current.databaseWallMs,
        roundTripMs: current.roundTripMs,
      };
    });
    const maxAbs = (key: keyof (typeof deltas)[number]) =>
      Math.max(...deltas.map((value) => Math.abs(value[key])));
    const summary = {
      diagnosticOnly: true,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      durationMs: performance.now() - started,
      samples: samples.length,
      maxNodeStepMs: maxAbs("nodeDriftMs"),
      maxDatabaseStepMs: maxAbs("databaseDriftMs"),
      maxNodeDatabaseOffsetMs: maxAbs("nodeMinusDatabaseMs"),
      maxRoundTripMs: maxAbs("roundTripMs"),
    };
    mkdirSync("data/clock-runs", { recursive: true, mode: 0o700 });
    const report = "data/clock-runs/" + randomUUID() + ".json";
    writeFileSync(report, JSON.stringify({ summary, samples }, null, 2), {
      mode: 0o600,
    });
    console.log(JSON.stringify({ ...summary, report }));
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Clock diagnostic failed; verify the local soap_load database and sample budget.",
  );
  process.exitCode = 1;
});
