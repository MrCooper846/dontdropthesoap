import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { config } from "../config";
import { body, json } from "../http";
import { resource } from "../commands/resources";
import { RuleError } from "../../domain/match/model";
import { listBatches, batchDetails, fixtureReplay } from "./reads";
import {
  createBatch,
  registerEntry,
  withdrawEntry,
  closeRegistration,
  resumeEntry,
} from "./service";
export async function publicLeagueHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
  url: URL,
) {
  if (method !== "GET" || !path.startsWith("/leagues")) return false;
  if (!config.FEATURE_LEAGUE) throw new RuleError("NOT_FOUND");
  if (path === "/leagues") {
    const before = url.searchParams.get("before");
    if (before !== null)
      z.string()
        .regex(/^[1-9][0-9]{0,17}$/)
        .parse(before);
    json(res, 200, await listBatches(before ?? undefined));
    return true;
  }
  const batch = path.match(/^\/leagues\/([^/]+)$/);
  if (batch) {
    const after = z.coerce
      .number()
      .int()
      .min(0)
      .max(120)
      .parse(url.searchParams.get("after") ?? 0);
    json(
      res,
      200,
      await batchDetails(z.string().uuid().parse(batch[1]), after),
    );
    return true;
  }
  const replay = path.match(/^\/leagues\/fixtures\/([^/]+)\/replay$/);
  if (replay) {
    const raw = url.searchParams.get("attempt");
    const attempt =
      raw === null
        ? undefined
        : z.coerce.number().int().min(1).max(2147483647).parse(raw);
    const cursor = url.searchParams.get("beforeAttempt");
    const beforeAttempt =
      cursor === null
        ? undefined
        : z.coerce.number().int().min(1).max(2147483647).parse(cursor);
    json(
      res,
      200,
      await fixtureReplay(
        z.string().uuid().parse(replay[1]),
        attempt,
        beforeAttempt,
      ),
    );
    return true;
  }
  throw new RuleError("NOT_FOUND");
}
export async function leagueHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  if (!path.startsWith("/leagues") || method !== "POST") return false;
  if (!config.FEATURE_LEAGUE) throw new RuleError("NOT_FOUND");
  if (path === "/leagues") {
    json(
      res,
      201,
      await resource(req, await body(req), "league.create", (db, payload) =>
        createBatch(req, payload, db),
      ),
    );
    return true;
  }
  const action = path.match(
    /^\/leagues\/([^/]+)\/(register|withdraw|close|resume)$/,
  );
  if (!action) throw new RuleError("NOT_FOUND");
  const id = z.string().uuid().parse(action[1]);
  const work = {
    register: registerEntry,
    withdraw: withdrawEntry,
    close: closeRegistration,
    resume: resumeEntry,
  }[action[2] as "register" | "withdraw" | "close" | "resume"];
  json(
    res,
    200,
    await resource(
      req,
      await body(req),
      "league." + action[2] + ":" + id,
      (db, payload) => work(req, id, payload, db),
    ),
  );
  return true;
}
