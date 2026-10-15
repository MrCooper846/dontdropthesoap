import { FreshnessLease } from "../lifecycle/freshness";
import { duration, increment } from "../observability/metrics";
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
  const freshness = new FreshnessLease(600);
  let refreshing: Promise<void> | undefined;
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
      freshness.fresh &&
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
    (identity, reason) => {
      const socket = game.sockets.get(identity.connectionId),
        p = socket?.data.principal,
        control = controllers.get(identity.ownerId);
      console.log(
        JSON.stringify({
          event: "voice.peer.closed",
          at: Date.now(),
          reason,
          policyAgeMs: freshness.ageMs,
          socketConnected: !!socket?.connected,
          controllerCurrent:
            control?.sessionId === p?.sessionId &&
            control?.epoch === identity.epoch,
          yardCurrent: yard.controls(
            identity.ownerId,
            identity.connectionId,
            identity.epoch,
          ),
        }),
      );
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
    if (!force && freshness.fresh && freshness.ageMs! < 100) return;
    const started = performance.now();
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
          "SELECT state_json FROM matches WHERE circle_id IS NOT NULL AND phase NOT IN ('finished','cancelled','aborted')",
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
      freshness.confirm(started);
      media.reconcile();
    })()
      .catch(() => {
        increment("voice.policy.failed");
        freshness.invalidate();
        media.reconcile();
      })
      .finally(() => {
        duration("voice.policy.refresh", performance.now() - started);
        refreshing = undefined;
      });
    return refreshing;
  }
  const routing = setInterval(() => void refresh(true), 200);
  // Independently invalidate stale routing while a database request is stalled.
  let policyWasFresh = false;
  const watchdog = setInterval(() => {
    const fresh = freshness.fresh;
    if (policyWasFresh && !fresh && !stopped) increment("voice.policy.stale");
    policyWasFresh = fresh;
    media.reconcile();
  }, 50);
  function attach(socket: Socket) {
    const queue = new VoiceQueue();
    socket.on(
      "voice.command",
      (input: unknown, ack: (result: unknown) => void) => {
        void serviceWork
          .run(
            () =>
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
            socket.data.principal.ownerId,
          )
          .catch((e) => {
            increment("socket.rejected");
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
    removeBeforeEpoch: (ownerId: string, epoch: number) => {
      const identity = identities.get(ownerId);
      if (identity && identity.epoch < epoch)
        media.remove(ownerId, identity.connectionId);
    },
    stop: async () => {
      stopped = true;
      freshness.invalidate();
      clearInterval(routing);
      clearInterval(watchdog);
      media.close();
      await refreshing;
    },
  };
}
