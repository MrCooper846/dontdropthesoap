import { transaction } from "../persistence/db";
import {
  schedule,
  standings,
  type LeagueEntry,
} from "../../domain/league/league";
import { RuleError } from "../../domain/match/model";

export async function listBatches(before?: string) {
  return transaction(async (db) => {
    const rows = (
      await db.query(
        'SELECT id,sequence::text,name,state,rules_json AS rules,registration_deadline AS "registrationDeadline" FROM league_batches WHERE ($1::bigint IS NULL OR sequence<$1) ORDER BY sequence DESC LIMIT 51',
        [before ?? null],
      )
    ).rows;
    return {
      batches: rows.slice(0, 50),
      next: rows.length > 50 ? rows[49].sequence : null,
    };
  });
}
export async function batchDetails(id: string, after: number) {
  return transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const batch = (
      await db.query(
        'SELECT id,sequence::text,owner_id AS "ownerId",name,state,rules_json AS rules,registration_deadline AS "registrationDeadline" FROM league_batches WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!batch) throw new RuleError("NOT_FOUND");
    const entries = (
      await db.query(
        'SELECT e.id,e.owner_id AS "ownerId",e.bot_id AS "botId",e.bot_version_id AS "versionId",e.name,e.kind,e.offline_at AS "offlineAt",v.external_label AS "externalLabel",v.program_hash AS "programHash" FROM league_entries e JOIN bot_versions v ON v.id=e.bot_version_id WHERE e.batch_id=$1 ORDER BY e.id',
        [id],
      )
    ).rows;
    const settlements = (
      await db.query(
        'SELECT s.fixture_id AS "fixtureId",s.entry_a_id AS a,s.entry_b_id AS b,s.a_points AS "aPoints",s.b_points AS "bPoints",s.mutual_cooperations AS "mutualCooperations" FROM league_settlements s JOIN league_fixtures f ON f.id=s.fixture_id WHERE f.batch_id=$1',
        [id],
      )
    ).rows;
    const fixtures = (
      await db.query(
        'SELECT f.id,f.ordinal,f.entry_a_id AS a,f.entry_b_id AS b,f.state,f.attempt_number AS "attempts",f.current_match_id AS "currentMatchId",f.settled_match_id AS "settledMatchId",m.phase FROM league_fixtures f LEFT JOIN matches m ON m.id=f.current_match_id WHERE f.batch_id=$1 AND f.ordinal>$2 ORDER BY f.ordinal LIMIT 101',
        [id, after],
      )
    ).rows;
    return {
      batch,
      entries,
      standings: standings(entries as LeagueEntry[], settlements),
      provisional: batch.state === "registration",
      provisionalSchedule:
        batch.state === "registration" && entries.length >= 4
          ? schedule(entries as LeagueEntry[], Number(batch.sequence))
          : [],
      fixtures: fixtures.slice(0, 100),
      next: fixtures.length > 100 ? fixtures[99].ordinal : null,
    };
  });
}
export async function fixtureReplay(
  id: string,
  attempt?: number,
  beforeAttempt?: number,
) {
  return transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const attempts = (
      await db.query(
        'SELECT a.attempt_number AS attempt,a.match_id AS "matchId",m.phase FROM league_attempts a JOIN matches m ON m.id=a.match_id WHERE a.fixture_id=$1 AND ($2::integer IS NULL OR a.attempt_number<$2) ORDER BY a.attempt_number DESC LIMIT 101',
        [id, beforeAttempt ?? null],
      )
    ).rows;
    const attemptPage = attempts.slice(0, 100);
    const nextAttempts = attempts.length > 100 ? attempts[99].attempt : null;
    const fixture = (
      await db.query(
        'SELECT id,batch_id AS "batchId",ordinal,state,attempt_number AS attempts FROM league_fixtures WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!fixture) throw new RuleError("NOT_FOUND");
    const chosen = attempt === undefined ? fixture.attempts : attempt;
    const selected = (
      await db.query(
        `SELECT m.id,m.phase,(m.history_expired_at IS NOT NULL) AS "historyExpired",m.state_json->'rulesetVersion' AS "rulesetVersion",m.state_json->'settings' AS settings FROM league_attempts a JOIN matches m ON m.id=a.match_id WHERE a.fixture_id=$1 AND a.attempt_number=$2`,
        [id, chosen],
      )
    ).rows[0];
    if (!selected) {
      if (attempt !== undefined) throw new RuleError("NOT_FOUND");
      return {
        fixture,
        attempts: attemptPage,
        nextAttempts,
        match: null,
        seats: [],
        results: [],
      };
    }
    const seats = (
      await db.query(
        'SELECT id,kind,name,owner_id AS "ownerId",bot_version_id AS "versionId",score FROM match_seats WHERE match_id=$1 ORDER BY id',
        [selected.id],
      )
    ).rows;
    const results = (
      await db.query(
        "SELECT result_json FROM round_results WHERE match_id=$1 ORDER BY round_number,pair_id LIMIT 20",
        [selected.id],
      )
    ).rows.map((r) => r.result_json);
    return {
      fixture,
      attempts: attemptPage,
      nextAttempts,
      attempt: chosen,
      match: selected,
      seats,
      results,
      storedResultsOnly: true,
    };
  });
}
