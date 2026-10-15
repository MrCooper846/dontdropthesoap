import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { RuleError } from "../../domain/match/model";
import { observe } from "../commands/matches";

export async function resultsPage(
  req: IncomingMessage,
  matchId: string,
  input?: string,
) {
  const after =
    input === undefined
      ? 0
      : z
          .string()
          .regex(/^(0|[1-9][0-9]{0,9})$/)
          .transform(Number)
          .parse(input);
  const snapshot = await observe(req, matchId);
  if (snapshot.historyExpired)
    return {
      results: [],
      historyExpired: true,
      cursor: 0,
      nextAfterResult: null,
      hasMore: false,
      reset: true,
    };
  if (after > snapshot.results.length)
    throw new RuleError(
      "INVALID_PAYLOAD",
      "Result cursor exceeds revealed history",
    );
  // Revealed results append in stable round/pair order; private observations
  // and the bounded full match snapshot retain their separate contracts.
  const results = snapshot.results.slice(after, after + 100);
  const cursor = after + results.length;
  const hasMore = cursor < snapshot.results.length;
  return {
    results,
    historyExpired: false,
    cursor,
    nextAfterResult: hasMore ? cursor : null,
    hasMore,
    reset: false,
  };
}
