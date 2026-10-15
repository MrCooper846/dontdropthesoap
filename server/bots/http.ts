import { credentialHistory } from "./credential-history";
import { config } from "../config";
import { syncObservation } from "../matches/observations";
import { authenticate } from "../auth/sessions";
import { pool } from "../persistence/db";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { json, body, rateLimit } from "../http";
import { actor } from "../auth/actors";
import { RuleError } from "../../domain/match/model";
import { resource } from "../commands/resources";
import { command, observe } from "../commands/matches";
import {
  createExternalBot,
  listOwnedBots,
  mintCredential,
  revokeCredential,
  acquireBot,
  heartbeatBot,
  botPrincipal,
  assertScope,
} from "./identity";
import { assignments } from "./participation";
export async function botHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
  onRevoke: (id: string) => void,
) {
  if (!req.headers.authorization) return false;
  const p = await botPrincipal(req);
  rateLimit(
    (method === "GET" ? "bot-read:" : "bot-write:") + p.id,
    method === "GET" ? 30 : 10,
  );
  if (path === "/bot-controller/acquire" && method === "POST") {
    z.object({})
      .strict()
      .parse(await body(req));
    json(res, 200, await acquireBot(req));
    return true;
  }
  if (path === "/bot-controller/heartbeat" && method === "POST") {
    json(res, 200, await heartbeatBot(req, await body(req)));
    return true;
  }
  if (path === "/bot/assignments" && method === "GET") {
    json(res, 200, await assignments(req));
    return true;
  }
  const match = path.match(
    /^\/matches\/([^/]+)(?:\/(observation|moves|results))?$/,
  );
  if (match) {
    const id = z.string().uuid().parse(match[1]);
    if (method === "GET") {
      assertScope(p, "observations:read");
      const sync = await syncObservation(
        req,
        id,
        new URL(req.url ?? "/", "http://local").searchParams.get("after") ??
          undefined,
      );
      const snapshot = sync.snapshot;
      json(
        res,
        200,
        match[2] === "results"
          ? { results: snapshot.results }
          : {
              ...snapshot,
              events: sync.events,
              cursor: sync.cursor,
              hasMore: sync.hasMore,
              reset: sync.reset,
            },
      );
      return true;
    }
    if (method === "POST" && match[2] === "moves") {
      const data = z.record(z.string(), z.unknown()).parse(await body(req));
      json(
        res,
        200,
        await command(req, { ...data, type: "move.submit", matchId: id }),
      );
      return true;
    }
  }
  if (path === "/commands" && method === "POST") {
    json(res, 200, await command(req, await body(req)));
    return true;
  }
  throw new RuleError(
    "FORBIDDEN",
    "Bot credentials only control their assigned moves and observations",
  );
}
export async function ownedBotHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
  onRevoke: (id: string) => void,
) {
  if (path === "/bots") {
    if (method === "GET") {
      json(res, 200, { bots: await listOwnedBots(req) });
      return true;
    }
    if (method === "POST") {
      if (!config.FEATURE_EXTERNAL_BOTS) throw new RuleError("NOT_FOUND");
      json(
        res,
        201,
        await resource(
          req,
          await body(req),
          "bots.create",
          async (db, payload, epoch) =>
            createExternalBot(
              req,
              {
                ...z.record(z.string(), z.unknown()).parse(payload),
                controllerEpoch: epoch,
              },
              db,
            ),
        ),
      );
      return true;
    }
  }
  const cred = path.match(/^\/bots\/([^/]+)\/credentials(?:\/([^/]+))?$/);
  if (cred && !config.FEATURE_EXTERNAL_BOTS) throw new RuleError("NOT_FOUND");
  if (cred && method === "GET" && !cred[2]) {
    json(
      res,
      200,
      await credentialHistory(
        req,
        cred[1],
        new URL(req.url!, config.PUBLIC_ORIGIN).searchParams.get("before"),
      ),
    );
    return true;
  }
  if (cred && method === "POST" && !cred[2]) {
    json(
      res,
      201,
      await resource(
        req,
        await body(req),
        "credential.create:" + cred[1],
        async (db, payload, epoch) => {
          z.object({}).strict().parse(payload);
          return mintCredential(req, cred[1], { controllerEpoch: epoch }, db);
        },
      ),
    );
    return true;
  }
  if (cred && method === "DELETE" && cred[2]) {
    const result = await revokeCredential(
      req,
      cred[1],
      cred[2],
      await body(req),
    );
    onRevoke(result.credentialId);
    json(res, 200, result);
    return true;
  }
  return false;
}
