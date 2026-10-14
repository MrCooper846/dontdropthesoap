import { test, expect } from "@playwright/test";
import { Pool } from "pg";
test("stalled routing authorization fails closed while a modified receiver retains its transport", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [sender, listener] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  });
  const lock = await db.connect();
  try {
    for (const [i, page] of [sender, listener].entries()) {
      await page.goto("/lab/media");
      await page.waitForFunction(() => !!window.mediaProbe);
      await page.evaluate(
        (name) => window.mediaProbe.enter(name),
        ["Stall sender", "Stall receiver"][i],
      );
      await page.evaluate(() => window.mediaProbe.voice());
    }
    await sender.evaluate(() => window.mediaProbe.tone());
    await expect
      .poll(() =>
        listener.evaluate(
          async () => (await window.mediaProbe.stats()).packets,
        ),
      )
      .toBeGreaterThan(10);
    await listener.evaluate(() => window.mediaProbe.hostile());
    await lock.query("BEGIN");
    await lock.query("LOCK TABLE owner_blocks IN ACCESS EXCLUSIVE MODE");
    await listener.waitForTimeout(1200);
    const before = await listener.evaluate(
      async () => (await window.mediaProbe.stats()).packets,
    );
    await listener.waitForTimeout(800);
    expect(
      await listener.evaluate(
        async () => (await window.mediaProbe.stats()).packets,
      ),
    ).toBe(before);
    await lock.query("ROLLBACK");
    console.log(
      JSON.stringify({
        stalledPolicy: "FAILS_CLOSED",
        retainedConsumer: "NO_NEW_PACKETS",
      }),
    );
  } finally {
    await lock.query("ROLLBACK").catch(() => {});
    lock.release();
    await db.end();
    for (const c of contexts) await c.close();
  }
});
