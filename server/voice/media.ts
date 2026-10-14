import { createWorker, type types } from "mediasoup";
import { RuleError } from "../../domain/match/model";

export type VoiceIdentity = {
  ownerId: string;
  connectionId: string;
  epoch: number;
};
type Peer = {
  identity: VoiceIdentity;
  send?: types.WebRtcTransport;
  recv?: types.WebRtcTransport;
  producer?: types.Producer;
  consumers: Map<string, types.Consumer>;
};
export type VoicePolicy = {
  valid(identity: VoiceIdentity): boolean;
  audible(receiver: string, sender: string): boolean;
};
// Signaling must authenticate identities before calling this layer. All asynchronous
// allocations recheck policy after completion, closing resources if authority changed.
export class VoiceMedia {
  private peers = new Map<string, Peer>();
  private worker?: types.Worker;
  private router?: types.Router;
  private pending = new Set<string>();
  private closed = false;
  constructor(
    private policy: VoicePolicy,
    private network: {
      ip: string;
      announcedAddress?: string;
      minPort: number;
      maxPort: number;
    },
    private notify: (
      identity: VoiceIdentity,
      event:
        | { type: "consumer.closed"; consumerId: string }
        | { type: "voice.closed" },
    ) => void,
  ) {}
  async start() {
    const worker = await createWorker({
      rtcMinPort: this.network.minPort,
      rtcMaxPort: this.network.maxPort,
      logLevel: "error",
    });
    this.worker = worker;
    worker.on("died", () => this.close());
    try {
      this.router = await worker.createRouter({
        mediaCodecs: [
          {
            kind: "audio",
            mimeType: "audio/opus",
            clockRate: 48000,
            channels: 2,
          },
        ],
      });
    } catch (e) {
      this.close();
      throw e;
    }
  }
  join(identity: VoiceIdentity) {
    if (!this.router || this.closed) throw new RuleError("SERVICE_UNAVAILABLE");
    if (!this.policy.valid(identity)) throw new RuleError("FORBIDDEN");
    this.remove(identity.ownerId);
    this.peers.set(identity.ownerId, {
      identity: { ...identity },
      consumers: new Map(),
    });
    return { rtpCapabilities: this.router.rtpCapabilities };
  }
  private peer(identity: VoiceIdentity) {
    const p = this.peers.get(identity.ownerId);
    if (
      !p ||
      p.identity.connectionId !== identity.connectionId ||
      p.identity.epoch !== identity.epoch ||
      !this.policy.valid(identity)
    )
      throw new RuleError("FORBIDDEN");
    return p;
  }
  private async exclusive<T>(key: string, work: () => Promise<T>) {
    if (this.pending.has(key)) throw new RuleError("RATE_LIMITED");
    this.pending.add(key);
    try {
      return await work();
    } finally {
      this.pending.delete(key);
    }
  }
  async transport(identity: VoiceIdentity, direction: "send" | "recv") {
    const p = this.peer(identity);
    return this.exclusive(identity.ownerId + ":" + direction, async () => {
      if (p[direction]) throw new RuleError("CONFLICT");
      const t = await this.router!.createWebRtcTransport({
        listenInfos: [
          {
            protocol: "udp",
            ip: this.network.ip,
            announcedAddress: this.network.announcedAddress,
          },
          {
            protocol: "tcp",
            ip: this.network.ip,
            announcedAddress: this.network.announcedAddress,
          },
        ],
        enableSctp: false,
        initialAvailableOutgoingBitrate: 128000,
      });
      try {
        if (this.peer(identity) !== p) throw new RuleError("FORBIDDEN");
      } catch (e) {
        t.close();
        throw e;
      }
      p[direction] = t;
      t.on("dtlsstatechange", (state) => {
        if (state === "closed" || state === "failed")
          this.remove(identity.ownerId, identity.connectionId);
      });
      return {
        id: t.id,
        iceParameters: t.iceParameters,
        iceCandidates: t.iceCandidates,
        dtlsParameters: t.dtlsParameters,
      };
    });
  }
  async connect(
    identity: VoiceIdentity,
    transportId: string,
    dtlsParameters: types.DtlsParameters,
  ) {
    const p = this.peer(identity),
      t = [p.send, p.recv].find((t) => t?.id === transportId);
    if (!t) throw new RuleError("FORBIDDEN");
    await t.connect({ dtlsParameters });
    try {
      if (this.peer(identity) !== p) throw new RuleError("FORBIDDEN");
    } catch (e) {
      t.close();
      throw e;
    }
  }
  async produce(identity: VoiceIdentity, rtpParameters: types.RtpParameters) {
    const p = this.peer(identity);
    return this.exclusive(identity.ownerId + ":produce", async () => {
      if (!p.send || p.producer) throw new RuleError("CONFLICT");
      if (
        rtpParameters.codecs.some(
          (c) => c.mimeType.toLowerCase() !== "audio/opus",
        )
      )
        throw new RuleError("FORBIDDEN");
      const producer = await p.send.produce({
        kind: "audio",
        rtpParameters,
        paused: true,
      });
      try {
        if (this.peer(identity) !== p) throw new RuleError("FORBIDDEN");
      } catch (e) {
        producer.close();
        throw e;
      }
      p.producer = producer;
      return { id: producer.id };
    });
  }
  async speaking(identity: VoiceIdentity, enabled: boolean) {
    const p = this.peer(identity);
    if (!p.producer) throw new RuleError("NOT_FOUND");
    if (enabled) await p.producer.resume();
    else await p.producer.pause();
    try {
      if (this.peer(identity) !== p) throw new RuleError("FORBIDDEN");
    } catch (e) {
      p.producer.close();
      throw e;
    }
  }
  publishers(identity: VoiceIdentity) {
    this.peer(identity);
    return [...this.peers.values()]
      .filter(
        (p) =>
          p.producer &&
          this.policy.valid(p.identity) &&
          this.policy.audible(identity.ownerId, p.identity.ownerId),
      )
      .map((p) => ({
        ownerId: p.identity.ownerId,
        producerId: p.producer!.id,
        transmitting: !p.producer!.paused,
      }));
  }
  private allowed(p: Peer, sender: Peer) {
    return (
      this.policy.valid(p.identity) &&
      this.policy.valid(sender.identity) &&
      p !== sender &&
      this.policy.audible(p.identity.ownerId, sender.identity.ownerId)
    );
  }
  async consume(
    identity: VoiceIdentity,
    producerId: string,
    rtpCapabilities: types.RtpCapabilities,
  ) {
    const p = this.peer(identity),
      sender = [...this.peers.values()].find(
        (s) => s.producer?.id === producerId,
      );
    if (!sender || !this.allowed(p, sender) || !p.recv)
      throw new RuleError("FORBIDDEN");
    return this.exclusive(identity.ownerId + ":consume", async () => {
      if ([...p.consumers.values()].some((c) => c.producerId === producerId))
        throw new RuleError("CONFLICT");
      if (!this.router!.canConsume({ producerId, rtpCapabilities }))
        throw new RuleError("INVALID_PAYLOAD");
      const c = await p.recv!.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });
      try {
        if (this.peer(identity) !== p || !this.allowed(p, sender))
          throw new RuleError("FORBIDDEN");
      } catch (e) {
        c.close();
        throw e;
      }
      p.consumers.set(c.id, c);
      c.on("producerclose", () => this.closeConsumer(p, c));
      return {
        id: c.id,
        producerId,
        kind: c.kind,
        rtpParameters: c.rtpParameters,
        ownerId: sender.identity.ownerId,
      };
    });
  }
  async resume(identity: VoiceIdentity, consumerId: string) {
    const p = this.peer(identity),
      c = p.consumers.get(consumerId),
      sender = [...this.peers.values()].find(
        (s) => s.producer?.id === c?.producerId,
      );
    if (!c || !sender || !this.allowed(p, sender))
      throw new RuleError("FORBIDDEN");
    await c.resume();
    try {
      if (this.peer(identity) !== p || !this.allowed(p, sender))
        throw new RuleError("FORBIDDEN");
    } catch (e) {
      this.closeConsumer(p, c);
      throw e;
    }
  }
  private closeConsumer(p: Peer, c: types.Consumer) {
    if (!p.consumers.delete(c.id)) return;
    c.close();
    this.notify(p.identity, { type: "consumer.closed", consumerId: c.id });
  }
  reconcile() {
    for (const p of [...this.peers.values()]) {
      if (!this.policy.valid(p.identity)) {
        this.remove(p.identity.ownerId, p.identity.connectionId);
        continue;
      }
      for (const c of [...p.consumers.values()]) {
        const sender = [...this.peers.values()].find(
          (s) => s.producer?.id === c.producerId,
        );
        if (!sender || !this.allowed(p, sender)) this.closeConsumer(p, c);
      }
    }
  }
  remove(ownerId: string, connectionId?: string) {
    const p = this.peers.get(ownerId);
    if (!p || (connectionId && p.identity.connectionId !== connectionId))
      return;
    this.peers.delete(ownerId);
    this.notify(p.identity, { type: "voice.closed" });
    p.send?.close();
    p.recv?.close();
    for (const other of this.peers.values())
      for (const c of [...other.consumers.values()])
        if (c.producerId === p.producer?.id) this.closeConsumer(other, c);
  }
  close() {
    this.closed = true;
    for (const id of [...this.peers.keys()]) this.remove(id);
    this.router?.close();
    this.worker?.close();
  }
}
