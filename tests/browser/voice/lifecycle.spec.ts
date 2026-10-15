import { voiceTlsOptions } from "../../runtime/voice-tls";
import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { io } from "socket.io-client";
const database =
  "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser";
async function probe(page: Page, name: string) {
  await page.goto("/lab/media");
  await page.waitForFunction(() => !!window.mediaProbe);
  await page.evaluate((n) => window.mediaProbe.enter(n), name);
  await page.evaluate(() => window.mediaProbe.voice());
}
async function packets(page: Page) {
  return page.evaluate(async () => (await window.mediaProbe.stats()).packets);
}
async function frozen(page: Page) {
  await page.waitForTimeout(800);
  const before = await packets(page);
  await page.waitForTimeout(800);
  expect(await packets(page)).toBe(before);
}
test("republishing cannot broaden blocked/distant access; takeover fences old voice and fresh reentry works", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [sender, near, far] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    for (const [i, p] of [sender, near, far].entries())
      await probe(
        p,
        ["Lifecycle sender", "Lifecycle near", "Lifecycle far"][i],
      );
    await far.evaluate(() => window.mediaProbe.walk(820, 560));
    const original = await sender.evaluate(() => window.mediaProbe.tone());
    await expect.poll(() => packets(near)).toBeGreaterThan(10);
    const senderId = (await sender.evaluate(() => window.mediaProbe.current()))
      .ownerId;
    await near.evaluate((id) => window.mediaProbe.block(id), senderId);
    await expect
      .poll(() =>
        near.evaluate(async () => (await window.mediaProbe.stats()).consumers),
      )
      .toBe(0);
    await sender.evaluate(() => window.mediaProbe.reconnectVoice());
    const replacement = await sender.evaluate(() => window.mediaProbe.tone());
    expect(replacement).not.toBe(original);
    for (const p of [near, far]) {
      const capabilities = await p.evaluate(() =>
        window.mediaProbe.capabilities(),
      );
      expect(
        await p.evaluate(
          ({ producerId, capabilities }) =>
            window.mediaProbe.command({
              op: "consume",
              producerId,
              rtpCapabilities: capabilities,
            }),
          { producerId: replacement, capabilities },
        ),
      ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      await p.evaluate(() => window.mediaProbe.reconnectVoice());
      await p.waitForTimeout(300);
      expect(await p.evaluate(() => window.mediaProbe.poll())).toMatchObject({
        ok: true,
        result: { publishers: [] },
      });
    }
    // Far receiver returns within range before receiving authority takeover.
    await far.evaluate(() => window.mediaProbe.walk(480, 560));
    await expect.poll(() => packets(far)).toBeGreaterThan(10);
    await far.evaluate(() => window.mediaProbe.hostile());
    await far.evaluate(() => window.mediaProbe.control());
    await frozen(far);
    expect(
      await far.evaluate(() => window.mediaProbe.command({ op: "poll" })),
    ).toMatchObject({ ok: false, error: { code: "CONTROLLER_STALE" } });
    await far.evaluate(() => window.mediaProbe.reenter());
    await far.evaluate(() => window.mediaProbe.reconnectVoice());
    await expect.poll(() => packets(far)).toBeGreaterThan(10);
  } finally {
    for (const c of contexts) await c.close();
  }
});
for (const mode of ["expiry", "revocation", "disable"] as const)
  test(
    mode +
      " closes retained audio, prevents HTTP/socket reentry, and bots cannot allocate media",
    async ({ browser }) => {
      const contexts = await Promise.all([
        browser.newContext(),
        browser.newContext(),
      ]);
      const [sender, listener] = await Promise.all(
        contexts.map((c) => c.newPage()),
      );
      const db = new Pool({ connectionString: database });
      let botSocket: ReturnType<typeof io> | undefined;
      try {
        await probe(sender, "Expiry sender");
        await probe(listener, "Expiry listener");
        await sender.evaluate(() => window.mediaProbe.tone());
        await expect.poll(() => packets(listener)).toBeGreaterThan(10);
        const bot = await sender.evaluate(() =>
          window.mediaProbe.resource("/bots", { name: "Voice exclusion bot" }),
        );
        const credential = await sender.evaluate(
          (id) =>
            window.mediaProbe.resource("/bots/" + id + "/credentials", {}),
          bot.id,
        );
        botSocket = io("https://127.0.0.1:3107/game-v1", {
          transports: ["websocket"],
          ...voiceTlsOptions(),
          extraHeaders: { Authorization: "Bearer " + credential.secret },
        });
        await new Promise<void>((resolve, reject) => {
          botSocket!.once("connect", resolve);
          botSocket!.once("connect_error", reject);
        });
        const botAck = await new Promise<any>((resolve) =>
          botSocket!.emit(
            "voice.command",
            { controllerEpoch: 0, payload: { op: "join" } },
            resolve,
          ),
        );
        expect(botAck).toMatchObject({
          ok: false,
          error: { code: "FORBIDDEN" },
        });
        const owner = (
          await listener.evaluate(() => window.mediaProbe.current())
        ).ownerId;
        await listener.evaluate(() => window.mediaProbe.hostile());
        if (mode === "expiry")
          await db.query(
            "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE owner_id=$1",
            [owner],
          );
        else if (mode === "revocation")
          await db.query(
            "UPDATE sessions SET revoked_at=now() WHERE owner_id=$1",
            [owner],
          );
        else
          await db.query("UPDATE owners SET disabled_at=now() WHERE id=$1", [
            owner,
          ]);
        await frozen(listener);
        expect((await listener.request.get("/api/v1/session")).status()).toBe(
          401,
        );
        const replacement = await contexts[1].newPage();
        await replacement.goto("/lab/media");
        await replacement.waitForFunction(() => !!window.mediaProbe);
        expect(
          await replacement.evaluate(() => window.mediaProbe.socketReentry()),
        ).toBe("AUTH_REQUIRED");
      } finally {
        botSocket?.disconnect();
        await db.end();
        for (const c of contexts) await c.close();
      }
    },
  );
test("table spectator suppression is one-way and same-table humans retain full-volume media", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, b, spectator] = await Promise.all(contexts.map((c) => c.newPage()));
  let matchId: string | undefined;
  try {
    for (const [i, p] of [a, b, spectator].entries()) {
      await probe(p, ["Seated A", "Seated B", "Table spectator"][i]);
      await p.evaluate(() => window.mediaProbe.walk(240, 450));
    }
    const created = await a.evaluate(() =>
      window.mediaProbe.match("yard-circle-3"),
    );
    matchId = created.id;
    await b.evaluate(
      (id) => window.mediaProbe.match("yard-circle-3", id),
      matchId,
    );
    await Promise.all(
      [a, b, spectator].map((p) => p.evaluate(() => window.mediaProbe.tone())),
    );
    await expect
      .poll(() =>
        a.evaluate(async () => (await window.mediaProbe.stats()).consumers),
      )
      .toBe(2);
    await expect
      .poll(() =>
        spectator.evaluate(
          async () => (await window.mediaProbe.stats()).consumers,
        ),
      )
      .toBe(2);
    const bId = (await b.evaluate(() => window.mediaProbe.current())).ownerId;
    await a.evaluate(() =>
      window.mediaProbe.command({ op: "settings", muteSpectators: true }),
    );
    await expect
      .poll(() =>
        a.evaluate(async () => (await window.mediaProbe.stats()).consumers),
      )
      .toBe(1);
    const audibility = await a.evaluate(() => window.mediaProbe.poll());
    expect(audibility.result.publishers).toEqual([
      expect.objectContaining({ ownerId: bId, gain: 1 }),
    ]);
    await expect.poll(() => packets(spectator)).toBeGreaterThan(10);
    expect(
      await spectator.evaluate(
        async () => (await window.mediaProbe.stats()).consumers,
      ),
    ).toBe(2);
  } finally {
    if (matchId)
      for (const p of [a, b])
        await p
          .evaluate((id) => window.mediaProbe.leaveMatch(id), matchId)
          .catch(() => {});
    for (const c of contexts) await c.close();
  }
});
