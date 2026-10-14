import { startMetrics } from "./server/observability/metrics";
import { startOperatorEffects } from "./server/operators/effects";
import { dropCredentialLease } from "./server/bots/identity";
import { serviceWork } from "./server/lifecycle/work";
import { maintainCoordinator } from "./server/matches/availability";
import {
  enforceCoordinatorLease,
  coordinatorAvailable,
} from "./server/persistence/coordinator-lease";
import { startLeague } from "./server/league/service";
import { startVisualRuntime } from "./server/bots/visual-runtime";
import { closeVisualPreview } from "./server/bots/visual-http";
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
import { api, rateLimit, json } from "./server/http";
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
  const app = next({
    dev: config.NODE_ENV !== "production",
    hostname: "0.0.0.0",
    port: config.PORT,
  });
  await app.prepare();
  await maintainCoordinator();
  enforceCoordinatorLease();
  await recoverMatches();
  const http = createServer((req, res) => {
    if (req.url === "/health/live") {
      if (serviceWork.draining) res.setHeader("Connection", "close");
      json(
        res,
        200,
        serviceWork.draining ? { live: true, draining: true } : { live: true },
      );
      return;
    }
    if (serviceWork.draining) {
      res.setHeader("Connection", "close");
      if (req.url === "/health/live")
        json(res, 200, { live: true, draining: true });
      else if (req.url === "/health/ready")
        json(res, 503, { ready: false, draining: true });
      else
        json(res, 503, {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service restarting. Please retry.",
            retryable: true,
          },
        });
      return;
    }
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
    void serviceWork
      .run(() =>
        api(
          req,
          res,
          () => ready && coordinatorAvailable(),
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
        ).then((handled) => {
          if (!handled) return app.getRequestHandler()(req, res);
        }),
      )
      .catch((error) => {
        if (!res.headersSent) {
          const retryable =
            error instanceof RuleError && error.code === "SERVICE_UNAVAILABLE";
          if (retryable) {
            res.setHeader("Connection", "close");
            res.setHeader("Retry-After", "1");
            json(res, 503, {
              error: {
                code: "SERVICE_UNAVAILABLE",
                message: error.message,
                retryable: true,
              },
            });
          } else {
            res.writeHead(500);
            res.end("Request failed");
          }
        }
      });
  });
  const io = new Server(http, {
    maxHttpBufferSize: 16384,
    allowRequest: (req, done) =>
      done(
        null,
        !stopping &&
          (req.headers.origin === config.PUBLIC_ORIGIN ||
            (!req.headers.origin && !!req.headers.authorization)),
      ),
    serveClient: false,
  });
  io.of("/").use((_socket, next) => next(new Error("Use /game-v1")));
  const game = io.of("/game-v1");
  game.use((socket, next) => {
    try {
      if (!ready || !coordinatorAvailable())
        throw new RuleError("SERVICE_UNAVAILABLE");
      if (socket.request.headers.authorization && !config.FEATURE_EXTERNAL_BOTS)
        throw new RuleError("NOT_FOUND");
      if (!socket.request.headers.authorization) assertOrigin(socket.request);
      void serviceWork
        .run(() =>
          actor(socket.request).then((p) => {
            if (serviceWork.draining)
              throw new RuleError("SERVICE_UNAVAILABLE");
            socket.data.principal = p;
            next();
          }),
        )
        .catch((error) =>
          next(
            new Error(
              error instanceof RuleError && error.code === "SERVICE_UNAVAILABLE"
                ? "SERVICE_UNAVAILABLE"
                : "AUTH_REQUIRED",
            ),
          ),
        );
    } catch (error) {
      next(new Error(error instanceof RuleError ? error.code : "FORBIDDEN"));
    }
  });
  const voice = config.FEATURE_VOICE ? await startVoice(game) : null;
  game.on("connection", (socket) => {
    attachYard(socket, game);
    voice?.attach(socket);
    socket.on("state.sync", (input: unknown, ack: (data: unknown) => void) => {
      void serviceWork
        .run(async () => {
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
        })
        .catch(() => {
          if (typeof ack === "function") ack({ ok: false });
        });
    });
    socket.on("command", (input: unknown, ack: (data: unknown) => void) => {
      void serviceWork
        .run(async () => {
          if (!ready || !coordinatorAvailable())
            throw new RuleError("SERVICE_UNAVAILABLE");
          rateLimit("socket:" + socket.data.principal.id);
          const result = await command(socket.request, input);
          if (typeof ack === "function") ack(result);
        })
        .catch((e) => {
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
                retryable:
                  e instanceof RuleError
                    ? e.code === "SERVICE_UNAVAILABLE"
                    : !(e instanceof z.ZodError),
              },
            });
        });
    });
  });
  const stopMetrics = startMetrics(() => ({
    pendingWork: serviceWork.pendingCount,
    connectedSockets: game.sockets.size,
    ready: ready && coordinatorAvailable(),
    draining: serviceWork.draining,
    dbWaiting: pool.waitingCount,
    dbConnections: pool.totalCount,
  }));
  const stopOperators = startOperatorEffects((effect) => {
    if (effect.action === "credential.revoke")
      dropCredentialLease(effect.targetId);
    if (
      (effect.action === "voice.remove" || effect.action === "owner.enable") &&
      effect.epoch !== undefined
    )
      voice?.removeBeforeEpoch(effect.targetId, effect.epoch);
    for (const socket of game.sockets.values()) {
      const p = socket.data.principal;
      if (
        (effect.action === "owner.disable" && p.ownerId === effect.targetId) ||
        (effect.action === "session.revoke" &&
          p.kind === "browser" &&
          p.sessionId === effect.targetId) ||
        (effect.action === "credential.revoke" &&
          p.kind === "bot" &&
          p.credentialId === effect.targetId)
      )
        socket.disconnect(true);
    }
  });
  const stopYard = startYard(game);
  const stopLeague = config.FEATURE_LEAGUE ? startLeague() : null;
  const stopVisual = config.FEATURE_VISUAL_BOTS ? startVisualRuntime() : null;
  let tickWork: Promise<void> | undefined;
  let ticking = false,
    lastCoordinatorCheck = performance.now();
  const timer = setInterval(() => {
    if (ticking || !ready) return;
    ticking = true;
    tickWork = (async () => {
      if (performance.now() - lastCoordinatorCheck >= 500) {
        const result = await maintainCoordinator();
        lastCoordinatorCheck = performance.now();
        if (result.aborted)
          console.error(
            JSON.stringify({
              event: "game.infrastructure-abort",
              count: result.aborted,
              gapMs: Math.round(result.gap),
            }),
          );
      }
      await tickMatches();
    })()
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
        tickWork = undefined;
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
    serviceWork.begin();
    const deadline = setTimeout(() => {
      console.error(
        JSON.stringify({
          event: "service.drain.timeout",
          pending: serviceWork.pendingCount,
        }),
      );
      // Exiting closes ownership and DB connections together; no early unlock.
      process.exit(1);
    }, config.SHUTDOWN_GRACE_MS);
    deadline.unref();
    console.log(
      JSON.stringify({
        event: "service.drain.started",
        pending: serviceWork.pendingCount,
      }),
    );
    game.emit("service.restarting");
    clearInterval(timer);
    await Promise.all([
      stopOperators(),
      stopYard(),
      voice?.stop(),
      stopLeague?.(),
      stopVisual?.(),
      tickWork,
    ]);
    await serviceWork.wait();
    stopMetrics();
    await closeVisualPreview();
    // Preserve queued ACKs on both polling and WebSocket transports.
    await Promise.all(
      [...new Set([...game.sockets.values()].map((socket) => socket.conn))].map(
        (connection) => {
          if (connection.readyState === "closed") return Promise.resolve();
          return new Promise<void>((resolve) => {
            connection.once("close", () => resolve());
            connection.close(false);
          });
        },
      ),
    );
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await pool.end();
    await app.close();
    // The independent writer connection is released after all other work closes.
    await releaseWriter();
    clearTimeout(deadline);
    console.log(JSON.stringify({ event: "service.drain.complete" }));
    process.exit(0);
  }
  function shutdownFailed() {
    console.error(
      JSON.stringify({
        event: "service.drain.failed",
        code: "SERVICE_UNAVAILABLE",
      }),
    );
    process.exit(1);
  }
  process.on("SIGINT", () => void shutdown().catch(shutdownFailed));
  process.on("SIGTERM", () => void shutdown().catch(shutdownFailed));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Startup failed");
  process.exit(1);
});
