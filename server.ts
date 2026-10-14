import { startVoice } from "./server/voice/socket";
import { attachYard, startYard } from "./server/yards/socket";
import { RuleError } from "./domain/match/model";
import { syncObservation } from "./server/matches/observations";
import { actor } from "./server/auth/actors";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { z } from "zod";
import { config } from "./server/config";
import { api, rateLimit } from "./server/http";
import { pool, migrate, acquireWriter } from "./server/persistence/db";
import { authenticate, assertOrigin } from "./server/auth/sessions";
import {
  command,
  observe,
  tickMatches,
  recoverMatches,
} from "./server/commands/matches";
async function main() {
  await migrate();
  let ready = false,
    stopping = false;
  const releaseWriter = await acquireWriter(() => {
    ready = false;
    process.exit(1);
  });
  await pool.query("UPDATE owners SET controller_epoch=controller_epoch+1");
  await pool.query("UPDATE bots SET controller_epoch=controller_epoch+1");
  await recoverMatches();
  const app = next({
    dev: config.NODE_ENV !== "production",
    hostname: "0.0.0.0",
    port: config.PORT,
  });
  await app.prepare();
  const http = createServer((req, res) => {
    if (/^\/(create|join|nickname|lobby)(\/|$)/.test(req.url ?? "")) {
      res.writeHead(302, { Location: config.FEATURE_YARD ? "/yard" : "/play" });
      res.end();
      return;
    }
    if (config.FEATURE_YARD && /^\/play(?:\?|$)/.test(req.url ?? "")) {
      const query = new URL(req.url!, config.PUBLIC_ORIGIN).search;
      res.writeHead(302, { Location: "/yard" + query });
      res.end();
      return;
    }
    void api(
      req,
      res,
      () => ready,
      (sessionId) => {
        for (const socket of game.sockets.values())
          if (socket.data.principal.sessionId === sessionId)
            socket.disconnect(true);
      },
      (credentialId) => {
        for (const socket of game.sockets.values())
          if (socket.data.principal.credentialId === credentialId)
            socket.disconnect(true);
      },
    )
      .then((handled) => {
        if (!handled) return app.getRequestHandler()(req, res);
      })
      .catch(() => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Request failed");
        }
      });
  });
  const io = new Server(http, {
    maxHttpBufferSize: 16384,
    allowRequest: (req, done) =>
      done(
        null,
        req.headers.origin === config.PUBLIC_ORIGIN ||
          (!req.headers.origin && !!req.headers.authorization),
      ),
    serveClient: false,
  });
  io.of("/").use((_socket, next) => next(new Error("Use /game-v1")));
  const game = io.of("/game-v1");
  game.use((socket, next) => {
    try {
      if (socket.request.headers.authorization && !config.FEATURE_EXTERNAL_BOTS)
        throw new RuleError("NOT_FOUND");
      if (!socket.request.headers.authorization) assertOrigin(socket.request);
      void actor(socket.request)
        .then((p) => {
          socket.data.principal = p;
          next();
        })
        .catch(() => next(new Error("AUTH_REQUIRED")));
    } catch {
      next(new Error("FORBIDDEN"));
    }
  });
  const voice = config.FEATURE_VOICE ? await startVoice(game) : null;
  game.on("connection", (socket) => {
    attachYard(socket, game);
    voice?.attach(socket);
    socket.on("state.sync", (input: unknown, ack: (data: unknown) => void) => {
      void (async () => {
        rateLimit("socket:" + socket.data.principal.id);
        const { matchId, after } = z
          .object({
            matchId: z.string().uuid(),
            after: z.number().int().nonnegative().optional(),
          })
          .strict()
          .parse(input);
        const sync = await syncObservation(socket.request, matchId, after);
        const snapshot = sync.snapshot;
        for (const room of socket.rooms)
          if (room !== socket.id && room !== "yard") await socket.leave(room);
        await socket.join(matchId);
        if (typeof ack === "function")
          ack({
            ok: true,
            snapshot,
            events: sync.events,
            cursor: sync.cursor,
            hasMore: sync.hasMore,
            reset: sync.reset,
          });
      })().catch(() => {
        if (typeof ack === "function") ack({ ok: false });
      });
    });
    socket.on("command", (input: unknown, ack: (data: unknown) => void) => {
      void (async () => {
        rateLimit("socket:" + socket.data.principal.id);
        const result = await command(socket.request, input);
        if (typeof ack === "function") ack(result);
      })().catch((e) => {
        if (typeof ack === "function")
          ack({
            ok: false,
            error: {
              code:
                e instanceof RuleError
                  ? e.code
                  : e instanceof z.ZodError
                    ? "INVALID_PAYLOAD"
                    : "SERVICE_UNAVAILABLE",
              retryable: !(e instanceof RuleError || e instanceof z.ZodError),
            },
          });
      });
    });
  });
  const stopYard = startYard(game);
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking || !ready) return;
    ticking = true;
    void tickMatches()
      .then(async () => {
        const q = await pool.query(
          "SELECT match_id,sequence,type,payload,visibility,recipient_seat_id FROM match_events WHERE published_at IS NULL ORDER BY created_at,sequence LIMIT 100",
        );
        for (const row of q.rows) {
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
          await pool.query(
            "UPDATE match_events SET published_at=now() WHERE match_id=$1 AND sequence=$2",
            [row.match_id, row.sequence],
          );
        }
      })
      .catch(() => {
        console.error(
          JSON.stringify({
            event: "game.tick.error",
            code: "SERVICE_UNAVAILABLE",
          }),
        );
      })
      .finally(() => {
        ticking = false;
      });
  }, 100);
  ready = true;
  http.listen(config.PORT, "0.0.0.0", () =>
    console.log("Ready on " + config.PUBLIC_ORIGIN),
  );
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    ready = false;
    clearInterval(timer);
    stopYard();
    voice?.stop();
    io.emit("service.restarting");
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await releaseWriter();
    await pool.end();
    await app.close();
    process.exit(0);
  }
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Startup failed");
  process.exit(1);
});
