import { voiceTlsOptions } from "../../runtime/voice-tls";
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { io } from "socket.io-client";
const database =
  "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser";
function operator(input: unknown) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/operator.ts", "apply"],
      {
        input: JSON.stringify(input),
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: database,
          SOAP_OPERATOR_ID: "browser-fixture-operator",
        },
        encoding: "utf8",
        timeout: 15000,
      },
    ),
  );
}
async function enter(page: Page, name: string) {
  await page.goto("/lab/media");
  await page.waitForFunction(() => !!window.mediaProbe);
  await page.evaluate((n) => window.mediaProbe.enter(n), name);
  await page.evaluate(() => window.mediaProbe.voice());
}
const packets = (p: Page) =>
  p.evaluate(async () => (await window.mediaProbe.stats()).packets);
async function frozen(p: Page) {
  await p.waitForTimeout(1000);
  const before = await packets(p);
  await p.waitForTimeout(800);
  expect(await packets(p)).toBe(before);
}
test("audited CLI removes hostile retained voice, permits fresh authority, and disables live owner access", async ({
  browser,
}) => {
  const senderContext = await browser.newContext(),
    listenerContext = await browser.newContext();
  const sender = await senderContext.newPage(),
    listener = await listenerContext.newPage();
  const db = new Pool({ connectionString: database });
  try {
    await enter(sender, "Operator sender");
    await enter(listener, "Operator listener");
    await sender.evaluate(() => window.mediaProbe.tone());
    await expect.poll(() => packets(listener)).toBeGreaterThan(10);
    const { ownerId } = await listener.evaluate(() =>
      window.mediaProbe.current(),
    );
    await listener.evaluate(() => window.mediaProbe.hostile());
    const request = {
      commandId: randomUUID(),
      action: "voice.remove",
      targetId: ownerId,
      reason: "Synthetic hostile receiver fixture",
    };
    const removed = operator(request);
    expect(operator(request)).toEqual(removed);
    await frozen(listener);
    expect(
      await listener.evaluate(() => window.mediaProbe.command({ op: "poll" })),
    ).toMatchObject({ ok: false, error: { code: "CONTROLLER_STALE" } });
    expect(
      await listener.evaluate(() => window.mediaProbe.current()),
    ).toMatchObject({ ownerId });
    await listener.evaluate(() => window.mediaProbe.reenter());
    await listener.evaluate(() => window.mediaProbe.reconnectVoice());
    await expect.poll(() => packets(listener)).toBeGreaterThan(10);
    await listener.evaluate(() => window.mediaProbe.hostile());
    operator({
      commandId: randomUUID(),
      action: "owner.disable",
      targetId: ownerId,
      reason: "Synthetic disable fixture",
    });
    await frozen(listener);
    expect((await listener.request.get("/api/v1/session")).status()).toBe(401);
    expect(
      await listener.evaluate(() => window.mediaProbe.socketReentry()),
    ).not.toBe("connected");
    const audit = await db.query(
      "SELECT count(*)::int AS n FROM operator_actions WHERE id=$1",
      [request.commandId],
    );
    expect(audit.rows[0].n).toBe(1);
    operator({
      commandId: randomUUID(),
      action: "owner.enable",
      targetId: ownerId,
      reason: "Restore synthetic fixture access",
    });
    expect((await listener.request.get("/api/v1/session")).status()).toBe(200);
  } finally {
    await db.end();
    await senderContext.close();
    await listenerContext.close();
  }
});
test("ordinary browser has no operator authority; real report review and session revocation use the CLI", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    page = await context.newPage();
  const db = new Pool({ connectionString: database });
  try {
    await enter(page, "Operator report fixture");
    const current = await page.evaluate(() => window.mediaProbe.current());
    const command = {
      commandId: randomUUID(),
      action: "owner.disable",
      targetId: current.ownerId,
      reason: "Untrusted browser request",
    };
    const unauthorized = await page.request.post("/api/v1/operator", {
      headers: {
        "x-csrf-token": current.csrfToken,
        Origin: "https://127.0.0.1:3107",
      },
      data: command,
    });
    expect(unauthorized.status()).toBe(404);
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM operator_actions WHERE id=$1",
          [command.commandId],
        )
      ).rows[0].n,
    ).toBe(0);
    const subject = randomUUID();
    await db.query(
      "INSERT INTO owners(id,display_name) VALUES($1,'Synthetic report subject')",
      [subject],
    );
    const reason = "<script>untrusted report content</script>";
    const report = await page.request.post("/api/v1/reports", {
      headers: {
        "x-csrf-token": current.csrfToken,
        Origin: "https://127.0.0.1:3107",
      },
      data: {
        ownerId: subject,
        controllerEpoch: current.controllerEpoch,
        reason,
      },
    });
    expect(report.ok()).toBe(true);
    const row = (
      await db.query(
        "SELECT id FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 1",
        [current.ownerId],
      )
    ).rows[0];
    operator({
      commandId: randomUUID(),
      action: "report.review",
      targetId: row.id,
      reason: "Review synthetic text as data",
      status: "reviewed",
    });
    expect(
      (
        await db.query("SELECT reason,status FROM reports WHERE id=$1", [
          row.id,
        ])
      ).rows[0],
    ).toEqual({ reason, status: "reviewed" });
    const session = (
      await db.query(
        "SELECT id FROM sessions WHERE owner_id=$1 AND revoked_at IS NULL",
        [current.ownerId],
      )
    ).rows[0];
    operator({
      commandId: randomUUID(),
      action: "session.revoke",
      targetId: session.id,
      reason: "Synthetic session revocation fixture",
    });
    await expect
      .poll(async () => (await page.request.get("/api/v1/session")).status())
      .toBe(401);
    expect(
      await page.evaluate(() => window.mediaProbe.socketReentry()),
    ).not.toBe("connected");
  } finally {
    await db.end();
    await context.close();
  }
});

test("operator credential revocation closes the real connected bot and denies reuse", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    page = await context.newPage();
  let socket: ReturnType<typeof io> | undefined;
  try {
    await enter(page, "Credential operator fixture");
    const bot = await page.evaluate(() =>
      window.mediaProbe.resource("/bots", { name: "Operator external bot" }),
    );
    await page.waitForTimeout(200);
    const credential = await page.evaluate(
      (id) => window.mediaProbe.resource("/bots/" + id + "/credentials", {}),
      bot.id,
    );
    socket = io("https://127.0.0.1:3107/game-v1", {
      transports: ["websocket"],
      ...voiceTlsOptions(),
      extraHeaders: { Authorization: "Bearer " + credential.secret },
    });
    await new Promise<void>((resolve, reject) => {
      socket!.once("connect", resolve);
      socket!.once("connect_error", reject);
    });
    const disconnected = new Promise<void>((resolve) =>
      socket!.once("disconnect", () => resolve()),
    );
    operator({
      commandId: randomUUID(),
      action: "credential.revoke",
      targetId: credential.credentialId,
      reason: "Synthetic connected credential fixture",
    });
    await disconnected;
    expect(socket.connected).toBe(false);
    expect(
      (
        await page.request.get("/api/v1/bot/assignments", {
          headers: { Authorization: "Bearer " + credential.secret },
        })
      ).status(),
    ).toBe(401);
    const retry = io("https://127.0.0.1:3107/game-v1", {
      transports: ["websocket"],
      ...voiceTlsOptions(),
      extraHeaders: { Authorization: "Bearer " + credential.secret },
      reconnection: false,
    });
    try {
      const result = await new Promise<string>((resolve) => {
        retry.once("connect", () => resolve("connected"));
        retry.once("connect_error", (error) => resolve(error.message));
      });
      expect(result).toBe("AUTH_REQUIRED");
    } finally {
      retry.disconnect();
    }
  } finally {
    socket?.disconnect();
    await context.close();
  }
});
