import { startOutbox } from "./matches/outbox";
import { DurableMetrics } from "./observability/durable";
import { securityHeaders } from "./security/headers";
import { startRetention } from "./persistence/retention";
import { boundOutbound } from "./lifecycle/outbound";
import { pruneBotLeases } from "./bots/identity";
import { pruneHttpBudgets } from "./http";
import { pruneChatBudgets } from "./yards/socket";
import { pruneInvitationBudgets } from "./yards/challenges";
import { pruneChat, blockRoutingSize, yard } from "./yards/world";
import { sweepWaitingRooms } from "./matches/waiting";
import { isBotOnline } from "./bots/identity";
import { OwnerConnections } from "./lifecycle/owner-connections";
import { limitConnections } from "./lifecycle/connections";
import { startMetrics, increment } from "./observability/metrics";
import { startOperatorEffects } from "./operators/effects";
import { dropCredentialLease } from "./bots/identity";
import { serviceWork } from "./lifecycle/work";
import { maintainCoordinator } from "./matches/availability";
import {
  enforceCoordinatorLease,
  coordinatorAvailable,
} from "./persistence/coordinator-lease";
import { startLeague } from "./league/service";
import { startVisualRuntime } from "./bots/visual-runtime";
import { closeVisualPreview } from "./bots/visual-http";
import { startVoice } from "./voice/socket";
import { attachYard, startYard } from "./yards/socket";
import { RuleError } from "../domain/match/model";
import { syncObservation } from "./matches/observations";
import { actor } from "./auth/actors";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { z } from "zod";
import { config } from "./config";
import { api, rateLimit, json } from "./http";
import { pool, migrate, acquireWriter } from "./persistence/db";
import { authenticate, assertOrigin } from "./auth/sessions";
import {
  command,
  observe,
  tickMatches,
  recoverMatches,
} from "./commands/matches";
function connectionFailure(error: unknown, fallback = "AUTH_REQUIRED") {
  const code = error instanceof RuleError ? error.code : fallback;
  const failure = new Error(code) as Error & { data: unknown };
  failure.data = {
    code,
    retryable: code === "SERVICE_UNAVAILABLE",
    message:
      error instanceof RuleError && error.message !== error.code
        ? error.message
        : code === "SERVICE_UNAVAILABLE"
          ? "Game service is unavailable. Please retry."
          : "Connection unavailable. Check your session and retry.",
  };
  return failure;
}
export async function main() {
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
  const http = createServer(
    {
      requestTimeout: config.HTTP_REQUEST_TIMEOUT_MS,
      headersTimeout: Math.min(10000, config.HTTP_REQUEST_TIMEOUT_MS),
      connectionsCheckingInterval: 1000,
    },
    (req, res) => {
      securityHeaders(
        req,
        res,
        config.PUBLIC_ORIGIN,
        config.NODE_ENV === "production",
      );
      if (req.url === "/health/live") {
        if (serviceWork.draining) res.setHeader("Connection", "close");
        json(
          res,
          200,
          serviceWork.draining
            ? { live: true, draining: true }
            : { live: true },
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
        res.writeHead(302, {
          Location: config.FEATURE_YARD ? "/yard" : "/play",
        });
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
              error instanceof RuleError &&
              error.code === "SERVICE_UNAVAILABLE";
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
    },
  );
  const connections = limitConnections(
    http,
    config.MAX_TCP_CONNECTIONS,
    config.MAX_TCP_PER_IP,
    Math.min(10000, config.HTTP_REQUEST_TIMEOUT_MS),
  );
  const io = new Server(http, {
    maxHttpBufferSize: 16384,
    allowRequest: (req, done) => {
      const allowed =
        !stopping &&
        (req.headers.origin === config.PUBLIC_ORIGIN ||
          (!req.headers.origin && !!req.headers.authorization));
      if (!allowed) increment("socket.transport.rejected");
      done(null, allowed);
    },
    serveClient: false,
  });
  io.of("/").use((_socket, next) => next(new Error("Use /game-v1")));
  const stopOutbound = boundOutbound(io);
  const ephemeralTimer = setInterval(() => {
    pruneBotLeases();
    pruneHttpBudgets();
    pruneChatBudgets();
    pruneInvitationBudgets();
    pruneChat();
  }, 1000);
  ephemeralTimer.unref();
  const game = io.of("/game-v1");
  const ownerConnections = new OwnerConnections(config.MAX_SOCKETS_PER_OWNER);
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
            if (socket.conn.readyState !== "open")
              throw new RuleError("SERVICE_UNAVAILABLE");
            const release = ownerConnections.acquire(p.ownerId);
            const forget = () => {
              socket.off("disconnect", forget);
              socket.conn.off("close", forget);
              release();
            };
            socket.once("disconnect", forget);
            socket.conn.once("close", forget);
            try {
              socket.data.principal = p;
              next();
            } catch (error) {
              forget();
              throw error;
            }
          }),
        )
        .catch((error) => {
          increment("socket.auth.rejected");
          next(connectionFailure(error));
        });
    } catch (error) {
      increment("socket.auth.rejected");
      next(connectionFailure(error, "FORBIDDEN"));
    }
  });
  const voice = config.FEATURE_VOICE ? await startVoice(game) : null;
  game.on("connection", (socket) => {
    increment("socket.connected");
    socket.once("disconnect", () => increment("socket.disconnected"));
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
        }, socket.data.principal.ownerId)
        .catch(() => {
          increment("socket.rejected");
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
          if (!result.ok) increment("socket.rejected");
          if (typeof ack === "function") ack(result);
        }, socket.data.principal.ownerId)
        .catch((e) => {
          increment("socket.rejected");
          if (typeof ack === "function")
            ack({
              ok: false,
              error: {
                message:
                  e instanceof RuleError
                    ? e.message
                    : e instanceof z.ZodError
                      ? "Invalid command"
                      : "Game service is unavailable. Please retry.",
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
  const durableMetrics = new DurableMetrics();
  const stopMetrics = startMetrics(() => ({
    ...durableMetrics.snapshot(),
    yardPlayers: yard.snapshot().players.length,
    pendingWork: serviceWork.pendingCount,
    connectedSockets: game.sockets.size,
    tcpConnections: connections.current,
    connectionSources: connections.addressCount,
    blockRoutingEdges: blockRoutingSize(),
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
  const stopRetention = startRetention();
  const stopYard = startYard(game);
  const stopLeague = config.FEATURE_LEAGUE ? startLeague() : null;
  const stopVisual = config.FEATURE_VISUAL_BOTS ? startVisualRuntime() : null;
  let tickWork: Promise<void> | undefined;
  let ticking = false,
    lastCoordinatorCheck = performance.now(),
    lastWaitingCheck = -Infinity,
    lastMetricsCheck = -Infinity;
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
      if (performance.now() - lastWaitingCheck >= 5000) {
        await sweepWaitingRooms((match) =>
          match.seats.some(
            (seat) =>
              (!!seat.ownerId &&
                [...game.sockets.values()].some(
                  (socket) =>
                    socket.connected &&
                    socket.data.principal.kind === "browser" &&
                    socket.data.principal.ownerId === seat.ownerId,
                )) ||
              (seat.kind === "external" &&
                !!seat.botId &&
                isBotOnline(seat.botId)),
          ),
        );
        lastWaitingCheck = performance.now();
      }
    })()
      .catch(() => {
        increment("game.tick.failed");
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
  const stopOutbox = startOutbox(
    game,
    () => ready && coordinatorAvailable(),
    async () => {
      if (performance.now() - lastMetricsCheck >= 5000) {
        lastMetricsCheck = performance.now();
        await durableMetrics.refresh();
      }
    },
  );
  ready = true;
  http.listen(config.PORT, "0.0.0.0", () =>
    console.log(JSON.stringify({ event: "service.ready" })),
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
    clearInterval(ephemeralTimer);
    await Promise.all([
      stopOutbox(),
      stopOperators(),
      stopRetention(),
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
    stopOutbound();
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
