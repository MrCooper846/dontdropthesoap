import { test, expect } from "@playwright/test";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { randomUUID } from "node:crypto";
const signal = "ws://127.0.0.1:17880",
  service = new RoomServiceClient("http://127.0.0.1:17880", "devkey", "secret");
test("measure whether server-only subscriptions work and whether a permitted client can override unsubscribe", async ({
  browser,
}) => {
  const name = "voice-spike-" + randomUUID();
  await service.createRoom({ name, emptyTimeout: 10 });
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [publisher, restricted, ordinary] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    async function token(
      identity: string,
      canPublish: boolean,
      canSubscribe: boolean,
    ) {
      const access = new AccessToken("devkey", "secret", {
        identity,
        ttl: 120,
      });
      access.addGrant({
        room: name,
        roomJoin: true,
        canPublish,
        canSubscribe,
        canPublishData: false,
        canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
      });
      return access.toJwt();
    }
    for (const [page, identity, pub, sub] of [
      [publisher, "publisher", true, false],
      [restricted, "restricted", false, false],
      [ordinary, "ordinary", false, true],
    ] as const) {
      await page.goto("/lab/voice");
      await expect(page.getByRole("status")).toHaveText("Probe ready");
      const signed = await token(identity, pub, sub);
      await page.evaluate(
        async ({ signal, signed }) =>
          window.voiceProbe!.connect(signal, signed),
        { signal, signed },
      );
    }
    const sid = await publisher.evaluate(() => window.voiceProbe!.publish());
    await expect
      .poll(
        async () =>
          (await service.listParticipants(name)).find(
            (p) => p.identity === "publisher",
          )?.tracks.length,
      )
      .toBe(1);
    await ordinary.evaluate(
      (sid) => window.voiceProbe!.subscribe(sid, true),
      sid,
    );
    await expect
      .poll(
        () =>
          ordinary.evaluate(
            async () => (await window.voiceProbe!.status()).packets,
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    await restricted.evaluate(
      (sid) => window.voiceProbe!.subscribe(sid, true),
      sid,
    );
    await service.updateSubscriptions(name, "restricted", [sid], true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const serverForced = await restricted.evaluate(() =>
      window.voiceProbe!.status(),
    );
    await service.updateSubscriptions(name, "ordinary", [sid], false);
    await expect
      .poll(() =>
        ordinary.evaluate(
          async () => (await window.voiceProbe!.status()).subscribed,
        ),
      )
      .toBe(0);
    await ordinary.evaluate(
      (sid) => window.voiceProbe!.subscribe(sid, true),
      sid,
    );
    await expect
      .poll(
        () =>
          ordinary.evaluate(
            async () => (await window.voiceProbe!.status()).packets,
          ),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    console.log(
      JSON.stringify({
        server: "LiveKit 1.13.10",
        normalMediaTransport: "PASS",
        restrictedClientReceived: serverForced,
        serverOnlyAdminSubscription:
          serverForced.packets > 0 ? "SUPPORTED" : "UNSUPPORTED",
        permittedClientCanOverrideServerUnsubscribe: true,
      }),
    );
    expect(serverForced.packets).toBe(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await service.deleteRoom(name);
  }
});
