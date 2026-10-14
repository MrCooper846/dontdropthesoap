import { Device, type types } from "mediasoup-client";
import type { Socket } from "socket.io-client";
export type VoiceStatus = {
  connected: boolean;
  talking: boolean;
  peers: { ownerId: string; transmitting: boolean }[];
  error: string;
};
type Remote = {
  consumer: types.Consumer;
  audio: HTMLAudioElement;
  ownerId: string;
};
export class VoiceClient {
  private device = new Device();
  private recv?: types.Transport;
  private send?: types.Transport;
  private producer?: types.Producer;
  private remotes = new Map<string, Remote>();
  private running = false;
  private polling = false;
  private timer?: ReturnType<typeof setInterval>;
  private track?: MediaStreamTrack;
  private talking = false;
  private desiredSpeaking = false;
  private autoplayBlocked = false;
  private closed = false;
  private speechQueue: Promise<void> = Promise.resolve();
  private event = (e: { type: string; consumerId?: string }) => {
    if (e.type === "consumer.closed" && e.consumerId) this.remove(e.consumerId);
    if (e.type === "voice.closed") {
      this.close(false);
      this.status({
        connected: false,
        talking: false,
        peers: [],
        error: "Voice disconnected. Join again to reconnect.",
      });
    }
  };
  private disconnected = () => {
    this.close(false);
    this.status({
      connected: false,
      talking: false,
      peers: [],
      error: "Voice connection lost. Join again when the yard reconnects.",
    });
  };
  constructor(
    private socket: Socket,
    private epoch: number,
    private status: (s: VoiceStatus) => void,
  ) {}
  private rpc(payload: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.closed || !this.socket.connected) {
        reject(new Error("Voice disconnected"));
        return;
      }
      this.socket
        .timeout(5000)
        .emit(
          "voice.command",
          { controllerEpoch: this.epoch, payload },
          (error: Error | null, response: any) => {
            if (this.closed) {
              reject(new Error("Voice disconnected"));
              return;
            }
            if (error || !response?.ok) {
              reject(
                new Error(response?.error?.code ?? "Voice request timed out"),
              );
              return;
            }
            resolve(response.result);
          },
        );
    });
  }
  async start() {
    try {
      const result = await this.rpc({ op: "join" });
      this.socket.on("voice.event", this.event);
      this.socket.on("disconnect", this.disconnected);
      await this.device.load({ routerRtpCapabilities: result.rtpCapabilities });
      const params = await this.rpc({ op: "transport", direction: "recv" });
      if (this.closed) throw new Error("Voice disconnected");
      this.recv = this.device.createRecvTransport(params);
      this.connectEvents(this.recv);
      this.running = true;
      this.status({ connected: true, talking: false, peers: [], error: "" });
      this.timer = setInterval(() => void this.poll(), 200);
      await this.poll();
    } catch (e) {
      this.close();
      throw e;
    }
  }
  private connectEvents(transport: types.Transport) {
    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      void this.rpc({
        op: "connect",
        transportId: transport.id,
        dtlsParameters,
      })
        .then(() => callback())
        .catch(errback);
    });
    transport.on("connectionstatechange", (state) => {
      if (state === "failed" || state === "closed") {
        if (!this.closed) {
          this.close();
          this.status({
            connected: false,
            talking: false,
            peers: [],
            error: "Audio transport failed. Join voice again.",
          });
        }
      }
    });
  }
  async microphone(track?: MediaStreamTrack) {
    if (this.producer) return;
    const stream = track
      ? new MediaStream([track])
      : await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
    const microphone = stream.getAudioTracks()[0];
    if (!microphone) throw new Error("No microphone is available");
    this.track = microphone;
    microphone.enabled = false;
    try {
      const params = await this.rpc({ op: "transport", direction: "send" });
      if (this.closed) throw new Error("Voice disconnected");
      this.send = this.device.createSendTransport(params);
      this.connectEvents(this.send);
      this.send.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        if (kind !== "audio") {
          errback(new Error("Only microphone audio is permitted"));
          return;
        }
        void this.rpc({ op: "produce", rtpParameters })
          .then(({ id }) => callback({ id }))
          .catch(errback);
      });
      this.producer = await this.send.produce({
        track: microphone,
        codec: this.device.rtpCapabilities.codecs?.find(
          (c) => c.mimeType.toLowerCase() === "audio/opus",
        ),
        stopTracks: true,
        zeroRtpOnPause: true,
      });
      if (this.closed) {
        this.producer.close();
        throw new Error("Voice disconnected");
      }
      this.producer.pause();
      microphone.addEventListener(
        "ended",
        () => {
          if (!this.closed) {
            this.close();
            this.status({
              connected: false,
              talking: false,
              peers: [],
              error: "Microphone disconnected. Join again to choose a device.",
            });
          }
        },
        { once: true },
      );
    } catch (e) {
      microphone.stop();
      this.close();
      throw e;
    }
  }
  speaking(enabled: boolean) {
    this.desiredSpeaking = enabled;
    // Release stops local capture immediately, even if a prior signaling ACK is pending.
    if (!enabled) {
      this.track && (this.track.enabled = false);
      this.producer?.pause();
    }
    this.speechQueue = this.speechQueue
      .catch(() => {})
      .then(async () => {
        if (!this.producer || this.closed) return;
        await this.rpc({ op: "speaking", enabled });
        if (this.closed) return;
        if (enabled && this.desiredSpeaking) {
          this.producer.resume();
          if (this.track) this.track.enabled = true;
        }
        this.talking = enabled && this.desiredSpeaking;
      })
      .catch(() => {
        this.track && (this.track.enabled = false);
        this.producer?.pause();
        this.talking = false;
      });
    return this.speechQueue;
  }
  async settings(muteSpectators: boolean) {
    await this.rpc({ op: "settings", muteSpectators });
    await this.poll();
  }
  private async poll() {
    if (!this.running || this.polling || this.closed) return;
    this.polling = true;
    try {
      const { publishers } = (await this.rpc({ op: "poll" })) as {
        publishers: {
          ownerId: string;
          producerId: string;
          gain: number;
          transmitting: boolean;
        }[];
      };
      for (const [id, r] of this.remotes)
        if (!publishers.some((p) => p.producerId === r.consumer.producerId))
          this.remove(id);
      for (const p of publishers) {
        let remote = [...this.remotes.values()].find(
          (r) => r.consumer.producerId === p.producerId,
        );
        if (!remote) {
          let allocatedId: string | undefined;
          try {
            const parameters = await this.rpc({
              op: "consume",
              producerId: p.producerId,
              rtpCapabilities: this.device.rtpCapabilities,
            });
            allocatedId = parameters.id;
            const consumer = await this.recv!.consume(parameters);
            if (this.closed) {
              consumer.close();
              return;
            }
            const audio = document.createElement("audio");
            audio.autoplay = true;
            audio.setAttribute("playsinline", "");
            audio.srcObject = new MediaStream([consumer.track]);
            remote = { consumer, audio, ownerId: p.ownerId };
            this.remotes.set(consumer.id, remote);
            await this.rpc({ op: "resume", consumerId: consumer.id });
            void audio.play().catch(() => {
              this.autoplayBlocked = true;
              this.status({
                connected: true,
                talking: this.talking,
                peers: publishers,
                error: "Tap Enable audio to hear nearby players.",
              });
            });
          } catch (e) {
            if (allocatedId) this.remove(allocatedId);
            if (this.closed) return;
            if (
              e instanceof Error &&
              ["FORBIDDEN", "CONFLICT"].includes(e.message)
            )
              continue;
            throw e;
          }
        }
        remote.audio.volume = Math.max(0, Math.min(1, p.gain));
      }
      this.status({
        connected: true,
        talking: this.talking,
        peers: publishers,
        error: this.autoplayBlocked
          ? "Tap Enable audio to hear nearby players."
          : "",
      });
    } catch (e) {
      if (!this.closed) {
        this.close();
        this.status({
          connected: false,
          talking: false,
          peers: [],
          error: e instanceof Error ? e.message : "Voice unavailable",
        });
      }
    } finally {
      this.polling = false;
    }
  }
  async enableAudio() {
    await Promise.all([...this.remotes.values()].map((r) => r.audio.play()));
    this.autoplayBlocked = false;
  }
  async stats() {
    let packets = 0;
    for (const r of this.remotes.values()) {
      const report = await r.consumer.getStats();
      report.forEach((s) => {
        if (s.type === "inbound-rtp") packets += s.packetsReceived ?? 0;
      });
    }
    return { consumers: this.remotes.size, packets };
  }
  private remove(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    r.consumer.close();
    r.audio.pause();
    r.audio.srcObject = null;
  }
  close(notify = true) {
    if (this.closed) return;
    this.closed = true;
    this.running = false;
    clearInterval(this.timer);
    this.socket.off("voice.event", this.event);
    this.socket.off("disconnect", this.disconnected);
    this.track?.stop();
    this.producer?.close();
    this.send?.close();
    this.recv?.close();
    for (const id of [...this.remotes.keys()]) this.remove(id);
    if (notify && this.socket.connected)
      this.socket.emit(
        "voice.command",
        { controllerEpoch: this.epoch, payload: { op: "leave" } },
        () => {},
      );
  }
}
