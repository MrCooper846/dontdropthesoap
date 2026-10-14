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
    window.mediaProbe = {
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
        voice = new VoiceClient(socket, epoch, () => {});
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
        voice = new VoiceClient(socket, epoch, () => {});
        await voice.start();
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
