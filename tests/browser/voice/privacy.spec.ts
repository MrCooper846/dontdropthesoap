import { test, expect } from "@playwright/test";
test("real audio is denied to distant, blocked and departed modified listeners", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [sender, listener, distant] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    for (const [index, page] of [sender, listener, distant].entries()) {
      await page.goto("/lab/media");
      await page.waitForFunction(() => !!window.mediaProbe);
      await page.evaluate(
        (name) => window.mediaProbe.enter(name),
        ["Voice sender", "Voice listener", "Distant listener"][index],
      );
    }
    const senderId = await sender.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).ownerId,
    );
    await distant.evaluate(() => window.mediaProbe.walk(820, 560));
    for (const page of [sender, listener, distant])
      await page.evaluate(() => window.mediaProbe.voice());
    const producerId = await sender.evaluate(() => window.mediaProbe.tone());
    await expect
      .poll(() => listener.evaluate(() => window.mediaProbe.stats()))
      .toMatchObject({ consumers: 1 });
    try {
      await expect
        .poll(() =>
          listener.evaluate(
            async () => (await window.mediaProbe.stats()).packets,
          ),
        )
        .toBeGreaterThan(10);
    } catch (e) {
      console.log(
        JSON.stringify({
          sender: await sender.evaluate(() => window.mediaProbe.diagnostic()),
          listener: await listener.evaluate(() =>
            window.mediaProbe.diagnostic(),
          ),
        }),
      );
      throw e;
    }
    const capabilities = await distant.evaluate(() =>
      window.mediaProbe.capabilities(),
    );
    expect(
      await distant.evaluate(
        ({ producerId, capabilities }) =>
          window.mediaProbe.command({
            op: "consume",
            producerId,
            rtpCapabilities: capabilities,
          }),
        { producerId, capabilities },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    // Preserve the old WebRTC consumer and ignore all server closure notifications:
    // packet counters, not cooperative UI state, establish hard media enforcement.
    await listener.evaluate(() => window.mediaProbe.hostile());
    await listener.evaluate(() => window.mediaProbe.walk(820, 560));
    await listener.waitForTimeout(800);
    const before = await listener.evaluate(
      async () => (await window.mediaProbe.stats()).packets,
    );
    await listener.waitForTimeout(800);
    expect(
      await listener.evaluate(
        async () => (await window.mediaProbe.stats()).packets,
      ),
    ).toBe(before);
    expect(
      await listener.evaluate(
        ({ producerId, capabilities }) =>
          window.mediaProbe.command({
            op: "consume",
            producerId,
            rtpCapabilities: capabilities,
          }),
        { producerId, capabilities },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    await listener.evaluate(() => window.mediaProbe.walk(480, 560));
    await listener.evaluate(() => window.mediaProbe.reconnectVoice());
    try {
      await expect
        .poll(
          () =>
            listener.evaluate(
              async () => (await window.mediaProbe.stats()).packets,
            ),
          { timeout: 15000 },
        )
        .toBeGreaterThan(10);
    } catch (e) {
      console.log(
        JSON.stringify({
          phase: "reentry",
          sender: await sender.evaluate(() => window.mediaProbe.diagnostic()),
          listener: await listener.evaluate(() =>
            window.mediaProbe.diagnostic(),
          ),
        }),
      );
      throw e;
    }
    await listener.evaluate(() => window.mediaProbe.hostile());
    await listener.evaluate((id) => window.mediaProbe.block(id), senderId);
    await listener.waitForTimeout(800);
    const blocked = await listener.evaluate(
      async () => (await window.mediaProbe.stats()).packets,
    );
    await listener.waitForTimeout(800);
    expect(
      await listener.evaluate(
        async () => (await window.mediaProbe.stats()).packets,
      ),
    ).toBe(blocked);
    expect(
      await listener.evaluate(
        ({ producerId, capabilities }) =>
          window.mediaProbe.command({
            op: "consume",
            producerId,
            rtpCapabilities: capabilities,
          }),
        { producerId, capabilities },
      ),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    await listener.evaluate(() => window.mediaProbe.leave());
    expect(
      await listener.evaluate(() => window.mediaProbe.command({ op: "join" })),
    ).toMatchObject({ ok: false, error: { code: "CONTROLLER_STALE" } });
    console.log(
      JSON.stringify({
        normalRtp: "PASS",
        distantModifiedListener: "DENIED",
        retainedConsumerAfterMovement: "NO_NEW_PACKETS",
        blockedRetainedConsumer: "NO_NEW_PACKETS",
        yardExit: "DENIED",
      }),
    );
  } finally {
    for (const c of contexts) await c.close();
  }
});
