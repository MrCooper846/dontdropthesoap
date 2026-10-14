import { serviceWork } from "../lifecycle/work";
import type { Namespace, Socket } from "socket.io";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "../auth/sessions";
import { config } from "../config";
import { RuleError } from "../../domain/match/model";
import {
  yard,
  snapshot,
  refreshWorld,
  refreshBlocks,
  requireYard,
  blocked,
  retainChat,
  chatHistory,
} from "./world";
import { rateLimit } from "../http";
function failure(e: unknown) {
  return {
    ok: false,
    error: {
      code:
        e instanceof RuleError
          ? e.code
          : e instanceof z.ZodError
            ? "INVALID_PAYLOAD"
            : "SERVICE_UNAVAILABLE",
      message: e instanceof RuleError ? e.message : "Request failed",
    },
  };
}
const chatBudgets = new Map<string, { tokens: number; at: number }>();
export function attachYard(socket: Socket, game: Namespace) {
  const ownerId = socket.data.principal.ownerId;
  function route(
    name: string,
    work: (input: unknown) => Promise<unknown> | unknown,
  ) {
    socket.on(name, (input: unknown, ack: (data: unknown) => void) => {
      void serviceWork
        .run(() =>
          Promise.resolve()
            .then(() => {
              if (
                !config.FEATURE_YARD ||
                socket.data.principal.kind !== "browser"
              )
                throw new RuleError("FORBIDDEN");
              return work(input);
            })
            .then((result) => {
              if (typeof ack === "function") ack({ ok: true, result });
            }),
        )
        .catch((e) => {
          if (typeof ack === "function") ack(failure(e));
        });
    });
  }
  route("yard.enter", async (input) => {
    rateLimit("yard-enter:" + ownerId, 3);
    const { controllerEpoch } = z
      .object({ controllerEpoch: z.number().int().nonnegative() })
      .strict()
      .parse(input);
    const p = await authenticate(socket.request);
    if (p.epoch !== controllerEpoch) throw new RuleError("CONTROLLER_STALE");
    yard.enter(p.ownerId, p.name, socket.id, p.epoch, Date.now());
    socket.data.yard = true;
    await socket.join("yard");
    await refreshWorld();
    return { snapshot: snapshot(), chat: chatHistory(ownerId) };
  });
  route("yard.leave", async (input) => {
    z.object({}).strict().parse(input);
    yard.leave(ownerId, socket.id);
    socket.data.yard = false;
    await socket.leave("yard");
    return { left: true };
  });
  route("yard.input", (input) => {
    rateLimit("yard-input:" + ownerId, 24);
    const { controllerEpoch, payload } = z
      .object({
        controllerEpoch: z.number().int().nonnegative(),
        payload: z.unknown(),
      })
      .strict()
      .parse(input);
    return {
      accepted: yard.input(
        ownerId,
        socket.id,
        controllerEpoch,
        payload,
        Date.now(),
      ),
    };
  });
  route("yard.sync", (input) => {
    z.object({}).strict().parse(input);
    requireYard(ownerId);
    return { snapshot: snapshot(), chat: chatHistory(ownerId) };
  });
  route("chat.send", async (input) => {
    const p = await authenticate(socket.request);
    const { text, controllerEpoch } = z
      .object({
        text: z.string().trim().min(1).max(280),
        controllerEpoch: z.number().int().nonnegative(),
      })
      .strict()
      .parse(input);
    if (p.epoch !== controllerEpoch) throw new RuleError("CONTROLLER_STALE");
    requireYard(ownerId);
    const now = Date.now(),
      budget = chatBudgets.get(ownerId) ?? { tokens: 3, at: now };
    budget.tokens = Math.min(3, budget.tokens + (now - budget.at) / 1000);
    budget.at = now;
    if (budget.tokens < 1) throw new RuleError("RATE_LIMITED");
    budget.tokens--;
    chatBudgets.set(ownerId, budget);
    const recipients = yard.recipients(ownerId, blocked),
      message = { id: randomUUID(), ownerId, name: p.name, text, sentAt: now };
    retainChat(message, recipients);
    for (const peer of game.sockets.values())
      if (peer.data.yard && recipients.includes(peer.data.principal.ownerId))
        peer.emit("chat.message", message);
    return { id: message.id };
  });
  socket.on("disconnect", () =>
    yard.disconnect(ownerId, socket.id, Date.now()),
  );
}
export function startYard(game: Namespace) {
  let refreshWork: Promise<void> | undefined;
  let refreshPending = false,
    lastBroadcast = 0;
  const movement = setInterval(() => {
    if (!config.FEATURE_YARD) return;
    yard.prune(Date.now());
    yard.step(Date.now());
    if (Date.now() - lastBroadcast >= 100) {
      lastBroadcast = Date.now();
      game.to("yard").emit("yard.positions", snapshot());
    }
  }, 50);
  const refresh = setInterval(() => {
    if (!config.FEATURE_YARD || refreshPending) return;
    refreshPending = true;
    refreshWork = refreshWorld()
      .then(async () => {
        const peers = [...game.sockets.values()].filter((s) => s.data.yard);
        if (!peers.length) return;
        const ids = peers.map((s) => s.data.principal.sessionId);
        const rows = (await import("../persistence/db")).pool;
        const valid = (
          await rows.query(
            "SELECT s.id,o.id AS owner_id,o.controller_epoch FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.id=ANY($1::uuid[]) AND s.revoked_at IS NULL AND s.expires_at>now() AND o.disabled_at IS NULL",
            [ids],
          )
        ).rows;
        for (const peer of peers) {
          const p = valid.find((p) => p.id === peer.data.principal.sessionId);
          if (!p) peer.disconnect(true);
          else yard.setController(p.owner_id, Number(p.controller_epoch));
        }
      })
      .catch(() => {})
      .finally(() => {
        refreshPending = false;
        refreshWork = undefined;
      });
  }, 250);
  const initialBlocks = refreshBlocks().catch(() => {});
  return async () => {
    clearInterval(movement);
    clearInterval(refresh);
    await Promise.allSettled([refreshWork, initialBlocks]);
  };
}
