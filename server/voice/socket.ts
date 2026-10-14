import { serviceWork } from "../lifecycle/work";
import type { Namespace, Socket } from "socket.io";
import type { types } from "mediasoup";
import { z } from "zod";
import { VoiceQueue } from "./queue";
import { VoiceMedia, type VoiceIdentity } from "./media";
import { authenticate } from "../auth/sessions";
import { config } from "../config";
import { pool } from "../persistence/db";
import { rateLimit } from "../http";
import { yard, snapshot, blocked, refreshBlocks } from "../yards/world";
import { audience } from "../../domain/voice/audience";
import { RuleError, type Match } from "../../domain/match/model";

const id = z.string().uuid();
const object = z.record(z.string(), z.unknown());
const action = z.discriminatedUnion("op", [
  z.object({ op: z.literal("join") }).strict(),
  z.object({ op: z.literal("leave") }).strict(),
  z
    .object({ op: z.literal("transport"), direction: z.enum(["send", "recv"]) })
    .strict(),
  z
    .object({
      op: z.literal("connect"),
      transportId: id,
      dtlsParameters: object,
    })
    .strict(),
  z.object({ op: z.literal("produce"), rtpParameters: object }).strict(),
  z.object({ op: z.literal("speaking"), enabled: z.boolean() }).strict(),
  z.object({ op: z.literal("poll") }).strict(),
  z
    .object({
      op: z.literal("consume"),
      producerId: id,
      rtpCapabilities: object,
    })
    .strict(),
  z.object({ op: z.literal("resume"), consumerId: id }).strict(),
  z.object({ op: z.literal("settings"), muteSpectators: z.boolean() }).strict(),
]);
export async function startVoice(game: Namespace) {
  let stopped = false;
  let freshAt = 0,
    refreshing: Promise<void> | undefined;
  let matches: Match[] = [];
  const controllers = new Map<string, { sessionId: string; epoch: number }>();
  const settings = new Map<string, boolean>();
  const identities = new Map<string, VoiceIdentity>();
  const valid = (i: VoiceIdentity) => {
    const socket = game.sockets.get(i.connectionId),
      p = socket?.data.principal;
    const control = controllers.get(i.ownerId);
    return (
      !stopped &&
      Date.now() - freshAt < 600 &&
      !!socket?.connected &&
      p?.kind === "browser" &&
      control?.sessionId === p.sessionId &&
      control?.epoch === i.epoch &&
      yard.controls(i.ownerId, i.connectionId, i.epoch)
    );
  };
  const audible = (receiver: string, sender: string) =>
    audience(
      snapshot(),
      matches,
      receiver,
      blocked,
      settings.get(receiver),
    ).some((p) => p.ownerId === sender);
  const media = new VoiceMedia(
    { valid, audible },
    {
      ip: config.VOICE_LISTEN_IP,
      announcedAddress: config.VOICE_ANNOUNCED_ADDRESS,
      minPort: config.VOICE_MIN_PORT,
      maxPort: config.VOICE_MAX_PORT,
    },
    (identity, event) => {
      game.sockets.get(identity.connectionId)?.emit("voice.event", event);
      if (event.type === "voice.closed") {
        if (
          identities.get(identity.ownerId)?.connectionId ===
          identity.connectionId
        )
          identities.delete(identity.ownerId);
        settings.delete(identity.ownerId);
      }
    },
  );
  await media.start();
  async function refresh(force = false) {
    if (stopped) return;
    if (refreshing) {
      await refreshing;
      if (force) return refresh(true);
      return;
    }
    if (!force && Date.now() - freshAt < 100) return;
    refreshing = (async () => {
      const sockets = [...game.sockets.values()].filter(
        (s) => s.data.yard && s.data.principal.kind === "browser",
      );
      const [sessions, active] = await Promise.all([
        pool.query(
          "SELECT s.id,o.id AS owner_id,o.controller_epoch FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.id=ANY($1::uuid[]) AND s.revoked_at IS NULL AND s.expires_at>now() AND o.disabled_at IS NULL",
          [sockets.map((s) => s.data.principal.sessionId)],
        ),
        pool.query(
          "SELECT state_json FROM matches WHERE phase NOT IN ('finished','cancelled','aborted')",
        ),
        refreshBlocks(),
      ]);
      controllers.clear();
      for (const row of sessions.rows)
        controllers.set(row.owner_id, {
          sessionId: row.id,
          epoch: Number(row.controller_epoch),
        });
      matches = active.rows.map((r) => r.state_json);
      freshAt = Date.now();
      media.reconcile();
    })()
      .catch(() => {
        freshAt = 0;
        media.reconcile();
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  }
  const routing = setInterval(() => void refresh(true), 200);
  // Independently invalidate stale routing while a database request is stalled.
  const watchdog = setInterval(() => media.reconcile(), 50);
  function attach(socket: Socket) {
    const queue = new VoiceQueue();
    socket.on(
      "voice.command",
      (input: unknown, ack: (result: unknown) => void) => {
        void serviceWork
          .run(() =>
            queue
              .run(async () => {
                if (
                  !config.FEATURE_VOICE ||
                  !config.FEATURE_YARD ||
                  socket.data.principal.kind !== "browser"
                )
                  throw new RuleError("FORBIDDEN");
                rateLimit("voice:" + socket.data.principal.ownerId, 24);
                const { controllerEpoch, payload } = z
                  .object({
                    controllerEpoch: z.number().int().nonnegative(),
                    payload: action,
                  })
                  .strict()
                  .parse(input);
                const p = await authenticate(socket.request);
                if (
                  p.epoch !== controllerEpoch ||
                  !yard.controls(p.ownerId, socket.id, p.epoch)
                )
                  throw new RuleError("CONTROLLER_STALE");
                const identity = {
                  ownerId: p.ownerId,
                  connectionId: socket.id,
                  epoch: p.epoch,
                };
                if (payload.op === "leave") {
                  media.remove(p.ownerId, socket.id);
                  return { left: true };
                }
                await refresh(payload.op === "join");
                if (!valid(identity))
                  throw new RuleError("SERVICE_UNAVAILABLE");
                switch (payload.op) {
                  case "join": {
                    const result = media.join(identity);
                    identities.set(p.ownerId, identity);
                    settings.set(p.ownerId, false);
                    return result;
                  }
                  case "transport":
                    return media.transport(identity, payload.direction);
                  case "connect":
                    await media.connect(
                      identity,
                      payload.transportId,
                      payload.dtlsParameters as unknown as types.DtlsParameters,
                    );
                    return {};
                  case "produce":
                    return media.produce(
                      identity,
                      payload.rtpParameters as unknown as types.RtpParameters,
                    );
                  case "speaking":
                    await media.speaking(identity, payload.enabled);
                    return {};
                  case "consume":
                    return media.consume(
                      identity,
                      payload.producerId,
                      payload.rtpCapabilities as unknown as types.RtpCapabilities,
                    );
                  case "resume":
                    await media.resume(identity, payload.consumerId);
                    return {};
                  case "settings":
                    settings.set(p.ownerId, payload.muteSpectators);
                    media.reconcile();
                    return {};
                  case "poll":
                    return {
                      publishers: media.publishers(identity).map((p) => ({
                        ...p,
                        gain:
                          audience(
                            snapshot(),
                            matches,
                            identity.ownerId,
                            blocked,
                            settings.get(identity.ownerId),
                          ).find((a) => a.ownerId === p.ownerId)?.gain ?? 0,
                      })),
                    };
                }
              })
              .then((result) => {
                if (typeof ack === "function") ack({ ok: true, result });
              }),
          )
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
                  message:
                    e instanceof RuleError ? e.message : "Voice unavailable",
                },
              });
          });
      },
    );
    socket.on("disconnect", () =>
      media.remove(socket.data.principal.ownerId, socket.id),
    );
  }
  await refresh();
  return {
    attach,
    stop: async () => {
      stopped = true;
      freshAt = 0;
      clearInterval(routing);
      clearInterval(watchdog);
      media.close();
      await refreshing;
    },
  };
}
