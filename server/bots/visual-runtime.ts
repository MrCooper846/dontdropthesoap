import { randomBytes } from "node:crypto";
import type { Program } from "../../domain/bots/program";
import { INTERPRETER_VERSION } from "../../domain/bots/program";
import type {
  Outcome,
  RuntimeState,
  Observation,
} from "../../domain/bots/interpreter";
import { visualObservation } from "../../domain/bots/observation";
import { submit } from "../../domain/match/engine";
import { RuleError } from "../../domain/match/model";
import { loadMatch, saveMatch } from "../matches/repository";
import { transaction, dbTime, pool } from "../persistence/db";
import { VisualPool } from "./visual-pool";
import { config } from "../config";
export type PreparedVisual = {
  matchId: string;
  seatId: string;
  round: number;
  versionId: string;
  deadline: number;
  program: Program;
  observation: Observation;
  previous: RuntimeState;
  lastRound: number;
};
export async function prepareVisual(
  matchId: string,
  seatId: string,
): Promise<PreparedVisual | null> {
  if (!config.FEATURE_VISUAL_BOTS) return null;
  return transaction(async (db) => {
    const m = await loadMatch(db, matchId, true),
      now = await dbTime(db),
      seat = m.seats.find((s) => s.id === seatId);
    if (
      m.phase !== "collecting" ||
      !seat ||
      seat.kind !== "visual" ||
      seat.abandoned ||
      m.moves[seatId] ||
      !m.deadline ||
      now >= m.deadline
    )
      return null;
    if (
      (
        await db.query(
          "SELECT 1 FROM visual_decisions WHERE match_id=$1 AND round_number=$2 AND seat_id=$3",
          [m.id, m.round, seat.id],
        )
      ).rowCount
    )
      return null;
    const q = await db.query(
      "SELECT v.* FROM bot_versions v JOIN bots b ON b.id=v.bot_id JOIN owners o ON o.id=b.owner_id WHERE v.id=$1 AND b.id=$2 AND b.kind='visual' AND b.archived_at IS NULL AND o.disabled_at IS NULL",
      [seat.botVersionId, seat.botId],
    );
    if (!q.rowCount) return null;
    const version = q.rows[0];
    if (
      version.interpreter_version !== INTERPRETER_VERSION ||
      version.ruleset_version !== m.rulesetVersion
    )
      throw new RuleError("VERSION_UNSUPPORTED");
    const program = version.program_json as Program;
    await db.query(
      "INSERT INTO bot_runtime_states(match_id,seat_id,state_json,rng_state,program_version_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [
        m.id,
        seat.id,
        JSON.stringify(program.memory),
        randomBytes(4).readUInt32LE(0) || 1,
        version.id,
      ],
    );
    const state = (
      await db.query(
        "SELECT * FROM bot_runtime_states WHERE match_id=$1 AND seat_id=$2 FOR UPDATE",
        [m.id, seat.id],
      )
    ).rows[0];
    if (state.program_version_id !== version.id || state.last_round >= m.round)
      throw new RuleError("INVALID_STATE");
    return {
      matchId: m.id,
      seatId: seat.id,
      round: m.round,
      versionId: version.id,
      deadline: m.deadline,
      program,
      observation: visualObservation(m, seat.id),
      previous: { memory: state.state_json, rngState: Number(state.rng_state) },
      lastRound: state.last_round,
    };
  });
}
export async function acceptVisual(job: PreparedVisual, outcome: Outcome) {
  return transaction(async (db) => {
    const m = await loadMatch(db, job.matchId, true),
      seat = m.seats.find((s) => s.id === job.seatId),
      now = await dbTime(db);
    if (
      !seat ||
      seat.kind !== "visual" ||
      seat.botVersionId !== job.versionId ||
      seat.abandoned ||
      m.phase !== "collecting" ||
      m.round !== job.round ||
      m.moves[seat.id] ||
      m.deadline !== job.deadline ||
      m.deadline === null ||
      now >= m.deadline
    )
      return false;
    const state = (
      await db.query(
        "SELECT * FROM bot_runtime_states WHERE match_id=$1 AND seat_id=$2 FOR UPDATE",
        [m.id, seat.id],
      )
    ).rows[0];
    if (
      !state ||
      state.program_version_id !== job.versionId ||
      state.last_round !== job.lastRound ||
      Number(state.rng_state) !== job.previous.rngState ||
      JSON.stringify(state.state_json) !== JSON.stringify(job.previous.memory)
    )
      return false;
    if (
      (
        await db.query(
          "SELECT 1 FROM visual_decisions WHERE match_id=$1 AND round_number=$2 AND seat_id=$3",
          [m.id, m.round, seat.id],
        )
      ).rowCount
    )
      return false;
    const permitted = await db.query(
      "SELECT 1 FROM owners o JOIN bots b ON b.owner_id=o.id WHERE b.id=$1 AND o.disabled_at IS NULL AND b.archived_at IS NULL FOR SHARE OF o,b",
      [seat.botId],
    );
    if (!permitted.rowCount) return false;
    const acceptedAt = await dbTime(db);
    if (acceptedAt >= m.deadline!) return false;
    submit(m, seat.id, job.round, outcome.move, acceptedAt);
    await db.query(
      "UPDATE bot_runtime_states SET state_json=$3,rng_state=$4,last_round=$5 WHERE match_id=$1 AND seat_id=$2",
      [
        m.id,
        seat.id,
        JSON.stringify(outcome.memory),
        outcome.rngState,
        job.round,
      ],
    );
    await saveMatch(db, m);
    await db.query(
      "INSERT INTO visual_decisions(match_id,round_number,seat_id,bot_version_id,status,trace_json) VALUES($1,$2,$3,$4,'accepted',$5)",
      [m.id, job.round, seat.id, job.versionId, JSON.stringify(outcome.trace)],
    );
    return true;
  });
}
async function recordError(job: PreparedVisual, code: string) {
  await transaction(async (db) => {
    const m = await loadMatch(db, job.matchId, true),
      seat = m.seats.find((s) => s.id === job.seatId);
    if (
      m.phase !== "collecting" ||
      m.round !== job.round ||
      !seat ||
      seat.abandoned ||
      seat.botVersionId !== job.versionId ||
      m.deadline !== job.deadline ||
      m.moves[seat.id] ||
      (await dbTime(db)) >= m.deadline!
    )
      return;
    seat.botErrorRound = m.round;
    m.version++;
    await saveMatch(db, m);
    await db.query(
      "INSERT INTO visual_decisions(match_id,round_number,seat_id,bot_version_id,status,error_code) VALUES($1,$2,$3,$4,'error',$5) ON CONFLICT DO NOTHING",
      [m.id, job.round, seat.id, job.versionId, code.slice(0, 64)],
    );
  });
}
export function startVisualRuntime() {
  const workers = new VisualPool(),
    pending = new Set<string>(),
    active = new Set<Promise<void>>();
  let pollWork: Promise<void> | undefined;
  let polling = false,
    stopped = false;
  const timer = setInterval(() => {
    if (polling || stopped) return;
    polling = true;
    pollWork = pool
      .query(
        "SELECT s.match_id,s.id FROM match_seats s JOIN matches m ON m.id=s.match_id WHERE s.kind='visual' AND m.phase='collecting' AND m.deadline>clock_timestamp() AND NOT s.abandoned AND NOT EXISTS(SELECT 1 FROM visual_decisions d WHERE d.match_id=m.id AND d.seat_id=s.id AND d.round_number=(m.state_json->>'round')::integer) ORDER BY m.deadline,m.id,s.id LIMIT 32",
      )
      .then((q) => {
        if (stopped) return;
        for (const row of q.rows) {
          const key = row.match_id + ":" + row.id;
          if (pending.has(key)) continue;
          pending.add(key);
          const work = prepareVisual(row.match_id, row.id)
            .then(async (job) => {
              if (!job || stopped) return;
              try {
                const outcome = await workers.run({
                  program: job.program,
                  observation: job.observation,
                  previous: job.previous,
                  deadline: job.deadline,
                });
                if (!stopped) await acceptVisual(job, outcome);
              } catch (e) {
                if (!stopped)
                  await recordError(
                    job,
                    e && typeof e === "object" && "code" in e
                      ? String(e.code)
                      : "BOT_ERROR",
                  );
              }
            })
            .catch(() => {
              console.error(
                JSON.stringify({
                  event: "visual.prepare.failed",
                  code: "SERVICE_UNAVAILABLE",
                }),
              );
            })
            .finally(() => {
              pending.delete(key);
              active.delete(work);
            });
          active.add(work);
        }
      })
      .catch(() => {})
      .finally(() => {
        polling = false;
      });
  }, 100);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await workers.close();
    await pollWork;
    await Promise.allSettled([...active]);
  };
}
