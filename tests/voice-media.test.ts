import { it, expect } from "vitest";
import { VoiceMedia, type VoiceIdentity } from "../server/voice/media";
it("real native SFU enforces consumers, closes revoked audiences and fences replaced connections", async () => {
  const valid = new Set(["a", "b", "c"]);
  let permitted = true;
  const closed: string[] = [];
  const media = new VoiceMedia(
    {
      valid: (i) => valid.has(i.ownerId),
      audible: (a, b) => a === "b" && b === "a" && permitted,
    },
    { ip: "127.0.0.1", minPort: 19200, maxPort: 19230 },
    (_, e) => {
      if (e.type === "consumer.closed") closed.push(e.consumerId);
    },
  );
  const identity = (ownerId: string): VoiceIdentity => ({
    ownerId,
    connectionId: ownerId + "-socket",
    epoch: 1,
  });
  const a = identity("a"),
    b = identity("b"),
    c = identity("c");
  try {
    await media.start();
    const { rtpCapabilities } = media.join(a);
    media.join(b);
    media.join(c);
    await media.transport(a, "send");
    await media.transport(b, "recv");
    await media.transport(c, "recv");
    const { id: producerId } = await media.produce(a, {
      codecs: [
        {
          mimeType: "audio/opus",
          payloadType: 111,
          clockRate: 48000,
          channels: 2,
          parameters: {},
        },
      ],
      encodings: [{ ssrc: 123456 }],
      rtcp: { cname: "voice-test" },
    });
    expect(media.publishers(c)).toEqual([]);
    await expect(
      media.consume(c, producerId, rtpCapabilities),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const consumer = await media.consume(b, producerId, rtpCapabilities);
    await media.resume(b, consumer.id);
    permitted = false;
    media.reconcile();
    expect(closed).toContain(consumer.id);
    await expect(media.resume(b, consumer.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      media.consume(b, producerId, rtpCapabilities),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    permitted = true;
    const second = await media.consume(b, producerId, rtpCapabilities);
    valid.delete("a");
    media.reconcile();
    expect(closed).toContain(second.id);
    valid.add("a");
    media.join({ ...b, connectionId: "replacement", epoch: 2 });
    await expect(media.transport(b, "recv")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    media.remove("b", b.connectionId);
    expect(
      media.publishers({ ...b, connectionId: "replacement", epoch: 2 }),
    ).toEqual([]);
  } finally {
    media.close();
  }
});
