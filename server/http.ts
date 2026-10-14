import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import {
  authenticate,
  assertCsrf,
  assertOrigin,
  createGuest,
  csrf,
} from "./auth/sessions";
import { pool } from "./persistence/db";
import {
  command,
  controller,
  newMatch,
  joinMatch,
  observe,
} from "./commands/matches";
import { RuleError } from "../domain/match/model";
export function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
export async function body(req: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384)
      throw new RuleError("INVALID_PAYLOAD", "Request exceeds 16 KiB");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new RuleError("INVALID_PAYLOAD");
  }
}
const budgets = new Map<string, { count: number; start: number }>();
export function rateLimit(key: string, limit = 10) {
  const now = Date.now();
  let b = budgets.get(key);
  if (!b || now - b.start >= 1000) {
    b = { count: 0, start: now };
    budgets.set(key, b);
  }
  if (++b.count > limit) throw new RuleError("RATE_LIMITED");
  if (budgets.size > 10000)
    for (const [k, v] of budgets) if (now - v.start > 60000) budgets.delete(k);
}
export async function api(
  req: IncomingMessage,
  res: ServerResponse,
  isReady: () => boolean,
  onLogout: (id: string) => void,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", config.PUBLIC_ORIGIN),
    pathname = url.pathname;
  if (pathname === "/health/live") {
    json(res, 200, { live: true });
    return true;
  }
  if (pathname === "/health/ready") {
    try {
      await pool.query("SELECT 1");
      json(res, isReady() ? 200 : 503, { ready: isReady() });
    } catch {
      json(res, 503, { ready: false });
    }
    return true;
  }
  if (!pathname.startsWith("/api/v1/")) return false;
  try {
    rateLimit("ip:" + req.socket.remoteAddress, 100);
    if (!isReady()) throw new RuleError("SERVICE_UNAVAILABLE");
    const path = pathname.slice(7),
      method = req.method ?? "GET";
    if (path === "/session/guest" && method === "POST") {
      assertOrigin(req);
      rateLimit("guest:" + req.socket.remoteAddress, 3);
      const { name } = z
        .object({ name: z.string().trim().min(1).max(32) })
        .strict()
        .parse(await body(req));
      const guest = await createGuest(name);
      res.setHeader(
        "Set-Cookie",
        "dds_session=" +
          guest.secret +
          "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" +
          (config.NODE_ENV === "production" ? "; Secure" : ""),
      );
      json(res, 201, { ownerId: guest.ownerId });
      return true;
    }
    const principal = await authenticate(req);
    rateLimit(
      (method === "GET" ? "read:" : "write:") + principal.id,
      method === "GET" ? 30 : 10,
    );
    if (method !== "GET") assertCsrf(req, principal);
    if (path === "/session" && method === "GET") {
      json(res, 200, {
        ownerId: principal.ownerId,
        name: principal.name,
        controllerEpoch: principal.epoch,
        csrfToken: csrf(principal),
      });
      return true;
    }
    if (path === "/session/logout" && method === "POST") {
      await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [
        principal.sessionId,
      ]);
      onLogout(principal.sessionId);
      res.setHeader(
        "Set-Cookie",
        "dds_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      json(res, 200, { ok: true });
      return true;
    }
    if (path === "/controller/acquire" && method === "POST") {
      json(res, 200, { controllerEpoch: await controller(req) });
      return true;
    }
    if (path === "/command-keys" && method === "POST") {
      const key = randomUUID();
      await pool.query(
        "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [key, principal.id],
      );
      json(res, 201, { key });
      return true;
    }
    if (path === "/commands" && method === "POST") {
      json(res, 200, await command(req, await body(req)));
      return true;
    }
    if (path === "/matches" && method === "POST") {
      json(res, 201, await newMatch(req, await body(req)));
      return true;
    }
    if (path === "/matches" && method === "GET") {
      const q = await pool.query(
        "SELECT id,mode,phase,state_json->'settings' AS settings,state_json->'seats' AS seats FROM matches WHERE phase NOT IN ('finished','aborted','cancelled') ORDER BY created_at DESC LIMIT 100",
      );
      json(res, 200, {
        matches: q.rows.map((r) => ({
          id: r.id,
          mode: r.mode,
          phase: r.phase,
          settings: r.settings,
          seatCount: r.seats.length,
        })),
      });
      return true;
    }
    if (path === "/leaderboard" && method === "GET") {
      const q = await pool.query(
        "SELECT o.id,o.display_name AS name,coalesce(sum(b.delta),0)::integer AS score FROM owners o LEFT JOIN balance_entries b ON b.owner_id=o.id WHERE o.disabled_at IS NULL GROUP BY o.id ORDER BY score DESC,o.display_name LIMIT 10",
      );
      json(res, 200, { leaderboard: q.rows });
      return true;
    }
    const match = path.match(
      /^\/matches\/([^/]+)(?:\/(observation|join|moves|results))?$/,
    );
    if (match) {
      const id = z.string().uuid().parse(match[1]);
      if (method === "GET") {
        const snapshot = await observe(req, id);
        json(
          res,
          200,
          match[2] === "results" ? { results: snapshot.results } : snapshot,
        );
        return true;
      }
      if (method === "POST" && match[2] === "join") {
        json(res, 200, await joinMatch(req, id, await body(req)));
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
    json(res, 404, {
      error: { code: "NOT_FOUND", message: "Unknown route", retryable: false },
    });
  } catch (e) {
    const code =
      e instanceof RuleError
        ? e.code
        : e instanceof z.ZodError
          ? "INVALID_PAYLOAD"
          : "SERVICE_UNAVAILABLE";
    const status =
      code === "AUTH_REQUIRED"
        ? 401
        : code === "FORBIDDEN"
          ? 403
          : code === "NOT_FOUND"
            ? 404
            : code === "RATE_LIMITED"
              ? 429
              : code === "SERVICE_UNAVAILABLE"
                ? 503
                : 400;
    if (code === "SERVICE_UNAVAILABLE")
      console.error(JSON.stringify({ event: "api.error", code }));
    json(res, status, {
      error: {
        code,
        message: e instanceof RuleError ? e.message : code,
        retryable: code === "SERVICE_UNAVAILABLE",
      },
    });
  }
  return true;
}
