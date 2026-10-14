import { RuleError } from "../match/model";
export const LEAGUE_RULES = {
  rounds: 20,
  decisionMs: 20000,
  revealMs: 1000,
  maxSeats: 2,
} as const;
export type LeagueEntry = {
  id: string;
  ownerId: string;
  botId: string;
  name: string;
};
export type ScheduledPair = { ordinal: number; a: string; b: string };
export function schedule(
  entries: LeagueEntry[],
  batchNumber: number,
): ScheduledPair[] {
  if (entries.length < 4 || entries.length > 16)
    throw new RuleError("INVALID_ROSTER", "League batches require 4–16 bots");
  if (
    new Set(entries.map((e) => e.id)).size !== entries.length ||
    new Set(entries.map((e) => e.ownerId)).size !== entries.length ||
    new Set(entries.map((e) => e.botId)).size !== entries.length
  )
    throw new RuleError("DUPLICATE_ENTRY", "One bot per owner per batch");
  const ordered = [...entries].sort((a, b) => a.botId.localeCompare(b.botId)),
    pairs: ScheduledPair[] = [];
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const [a, b] =
        batchNumber % 2
          ? [ordered[i].id, ordered[j].id]
          : [ordered[j].id, ordered[i].id];
      pairs.push({ ordinal: pairs.length + 1, a, b });
    }
  return pairs;
}
export type Settlement = {
  fixtureId: string;
  a: string;
  b: string;
  aPoints: number;
  bPoints: number;
  mutualCooperations: number;
};
export function standings(entries: LeagueEntry[], results: Settlement[]) {
  const rows = new Map(
    entries.map((e) => [
      e.id,
      { ...e, points: 0, mutualCooperations: 0, played: 0, rank: 0 },
    ]),
  );
  const seen = new Set<string>();
  for (const result of results) {
    if (seen.has(result.fixtureId)) throw new RuleError("DUPLICATE_SETTLEMENT");
    seen.add(result.fixtureId);
    if (
      result.a === result.b ||
      !rows.has(result.a) ||
      !rows.has(result.b) ||
      ![result.aPoints, result.bPoints, result.mutualCooperations].every(
        Number.isSafeInteger,
      ) ||
      result.mutualCooperations < 0
    )
      throw new RuleError("INVALID_SETTLEMENT");
    for (const [id, points] of [
      [result.a, result.aPoints],
      [result.b, result.bPoints],
    ] as const) {
      const row = rows.get(id)!;
      row.points += points;
      row.mutualCooperations += result.mutualCooperations;
      row.played++;
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.mutualCooperations - a.mutualCooperations ||
      a.id.localeCompare(b.id),
  );
  sorted.forEach((row, index) => {
    row.rank =
      index &&
      row.points === sorted[index - 1].points &&
      row.mutualCooperations === sorted[index - 1].mutualCooperations
        ? sorted[index - 1].rank
        : index + 1;
  });
  return sorted;
}
