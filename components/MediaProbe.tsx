"use client";
import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { VoiceClient } from "../client/voice/VoiceClient";
declare global {
  interface Window {
    mediaProbe: any;
  }
}
export default function MediaProbe() {
  useEffect(() => {
    let socket: Socket,
      voice: VoiceClient,
      epoch: number,
      ownerId: string,
      context: AudioContext,
      seq = 0;
    async function post(path: string, data: unknown, csrf?: string) {
      const r = await fetch("/api/v1" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify(data),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(body));
      return body;
    }
    async function rpc(event: string, payload: unknown) {
      return new Promise<any>((resolve, reject) =>
        socket
          .timeout(5000)
          .emit(event, payload, (e: Error, r: any) =>
            e ? reject(e) : resolve(r),
          ),
      );
    }
    const history: unknown[] = [];
    const status = (s: unknown) => {
      history.push({ at: Date.now(), status: s });
      if (history.length > 100) history.shift();
    };
    window.mediaProbe = {
      diagnostic: () => ({
        history: history.slice(-6),
        closed: (voice as any)?.closed,
        producerClosed: (voice as any)?.producer?.closed,
      }),
      async walk(x: number, y: number) {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const view = (await rpc("yard.sync", {})).result.snapshot;
          const p = view.players.find((p: any) => p.ownerId === ownerId);
          const dx = x - p.x,
            dy = y - p.y;
          if (Math.hypot(dx, dy) < 10) {
            await rpc("yard.input", {
              controllerEpoch: epoch,
              payload: { seq: seq++, axisX: 0, axisY: 0 },
            });
            return;
          }
          await rpc("yard.input", {
            controllerEpoch: epoch,
            payload: {
              seq: seq++,
              axisX: Math.abs(dx) < 6 ? 0 : Math.sign(dx),
              axisY: Math.abs(dy) < 6 ? 0 : Math.sign(dy),
            },
          });
          await new Promise((r) => setTimeout(r, 100));
        }
        throw new Error("Authoritative walk did not reach target");
      },
      async enter(name: string) {
        await post("/session/guest", { name });
        const s = await (await fetch("/api/v1/session")).json();
        ownerId = s.ownerId;
        epoch = (await post("/controller/acquire", {}, s.csrfToken))
          .controllerEpoch;
        socket = io("/game-v1", { transports: ["websocket"] });
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        });
        const entered = await rpc("yard.enter", { controllerEpoch: epoch });
        if (!entered.ok) throw new Error(JSON.stringify(entered));
        return ownerId;
      },
      async voice() {
        voice = new VoiceClient(socket, epoch, status);
        await voice.start();
      },
      async tone() {
        context = new AudioContext();
        await context.resume();
        const oscillator = context.createOscillator(),
          destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 440;
        oscillator.connect(destination);
        oscillator.start();
        await voice.microphone(destination.stream.getAudioTracks()[0]);
        await voice.speaking(true);
        return (voice as any).producer.id;
      },
      stats: () => voice.stats(),
      command: (payload: unknown) =>
        rpc("voice.command", { controllerEpoch: epoch, payload }),
      async hostile() {
        clearInterval((voice as any).timer);
        socket.removeAllListeners("voice.event");
        socket.removeAllListeners("disconnect");
      },
      async capabilities() {
        return (voice as any).device.rtpCapabilities;
      },
      async move(axisX: number, axisY: number, ms: number) {
        const end = Date.now() + ms;
        while (Date.now() < end) {
          await rpc("yard.input", {
            controllerEpoch: epoch,
            payload: { seq: seq++, axisX, axisY },
          });
          await new Promise((r) => setTimeout(r, 75));
        }
        await rpc("yard.input", {
          controllerEpoch: epoch,
          payload: { seq: seq++, axisX: 0, axisY: 0 },
        });
        return rpc("yard.sync", {});
      },
      async block(subject: string) {
        const s = await (await fetch("/api/v1/session")).json();
        return post(
          "/blocks",
          { ownerId: subject, controllerEpoch: epoch },
          s.csrfToken,
        );
      },
      async reconnectVoice() {
        voice?.close();
        voice = new VoiceClient(socket, epoch, status);
        await voice.start();
      },
      async reenter() {
        const s = await (await fetch("/api/v1/session")).json();
        epoch = (await post("/controller/acquire", {}, s.csrfToken))
          .controllerEpoch;
        seq = 0;
        return rpc("yard.enter", { controllerEpoch: epoch });
      },
      async socketReentry() {
        const other = io("/game-v1", { transports: ["websocket"] });
        try {
          return await new Promise<string>((resolve) => {
            other.once("connect", () => resolve("connected"));
            other.once("connect_error", (e) => resolve(e.message));
          });
        } finally {
          other.disconnect();
        }
      },
      async leaveMatch(matchId: string) {
        const s = await (await fetch("/api/v1/session")).json();
        const m = await (
          await fetch("/api/v1/matches/" + matchId + "/observation")
        ).json();
        if (!m.ownSeatId) return;
        return post(
          "/commands",
          {
            v: 1,
            commandId: crypto.randomUUID(),
            controllerEpoch: epoch,
            type: "seat.leave",
            matchId,
            round: m.round,
            seatId: m.ownSeatId,
            matchVersion: m.version,
            payload: {},
          },
          s.csrfToken,
        );
      },
      async current() {
        return (await fetch("/api/v1/session")).json();
      },
      async control() {
        const s = await (await fetch("/api/v1/session")).json();
        return post("/controller/acquire", {}, s.csrfToken);
      },
      async resource(path: string, payload: unknown) {
        const s = await (await fetch("/api/v1/session")).json();
        const { key } = await post("/command-keys", {}, s.csrfToken);
        return post(
          path,
          {
            commandId: crypto.randomUUID(),
            key,
            controllerEpoch: epoch,
            payload,
          },
          s.csrfToken,
        );
      },
      async match(circleId: string, matchId?: string) {
        const s = await (await fetch("/api/v1/session")).json();
        const { key } = await post("/command-keys", {}, s.csrfToken);
        const common = {
          commandId: crypto.randomUUID(),
          key,
          controllerEpoch: epoch,
        };
        return post(
          matchId ? "/matches/" + matchId + "/join" : "/matches",
          matchId
            ? common
            : {
                ...common,
                circleId,
                mode: "mixed",
                settings: {
                  rounds: 5,
                  decisionMs: 5000,
                  revealMs: 1000,
                  maxSeats: 2,
                },
              },
          s.csrfToken,
        );
      },
      async position() {
        return rpc("yard.sync", {});
      },
      async normal() {
        (voice as any).running = true;
        (voice as any).timer = setInterval(
          () => void (voice as any).poll(),
          200,
        );
      },
      async poll() {
        return rpc("voice.command", {
          controllerEpoch: epoch,
          payload: { op: "poll" },
        });
      },
      leave: () => rpc("yard.leave", {}),
      close() {
        voice?.close();
        socket?.disconnect();
        void context?.close();
      },
    };
    return () => {
      window.mediaProbe?.close();
      delete window.mediaProbe;
    };
  }, []);
  return (
    <main>
      <h1>Authenticated media probe</h1>
      <p>Development-only synthetic audio; no microphone.</p>
    </main>
  );
}
