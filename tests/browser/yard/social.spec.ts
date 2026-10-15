import { Pool } from "pg";
import { test, expect } from "@playwright/test";
import { enter, walk, own, post, speedReveal } from "./helpers";
test("two browsers walk into a circle, play and return without duplicate canvases", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const host = await a.newPage(),
    guest = await b.newPage();
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  });
  const errors: string[] = [];
  host.on("pageerror", (e) => errors.push(e.message));
  guest.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(host, "Yard host");
    await enter(guest, "Yard guest");
    await expect(
      host.locator('[data-testid="yard-canvas"] canvas'),
    ).toHaveCount(1);
    await walk(host, 240, 450);
    await walk(guest, 240, 450);
    await host
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await host.getByLabel("Rounds", { exact: true }).fill("5");
    await host.getByLabel("Decision seconds").fill("5");
    await host.getByLabel("Seats", { exact: true }).fill("2");
    await host.getByRole("button", { name: "Create circle match" }).click();
    await expect(host.getByRole("button", { name: "Ready up" })).toBeVisible();
    await speedReveal(host);
    await expect(
      guest.locator(".circle-card").filter({ hasText: "Noodle Exchange" }),
    ).toContainText("waiting");
    await guest
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await expect(
      guest.getByRole("button", { name: "Join circle", exact: true }),
    ).toBeEnabled();
    await guest
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await expect(guest.getByRole("button", { name: "Ready up" })).toBeVisible();
    await expect(host.locator('[aria-label="Match panel"]')).toContainText(
      "Yard guest",
    );
    await host.getByRole("button", { name: "Ready up" }).click();
    await guest.getByRole("button", { name: "Ready up" }).click();
    await expect(
      host.getByRole("button", { name: "Start game" }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "Start game" }).click();
    for (let round = 1; round <= 5; round++) {
      await host
        .getByRole("button", { name: "Cooperate", exact: true })
        .click();
      await guest.getByRole("button", { name: "Betray", exact: true }).click();
    }
    await expect(
      host.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      (await own(host)).view.players.filter(
        (p: { name: string }) =>
          p.name === "Yard host" || p.name === "Yard guest",
      ),
    ).toHaveLength(2);
    await expect.poll(async () => (await own(host)).player.seated).toBe(false);
    const ownerId = (await own(host)).session.ownerId;
    const matchId = (
      await db.query(
        "SELECT m.id FROM matches m JOIN match_seats s ON s.match_id=m.id WHERE s.owner_id=$1 AND m.phase='finished' ORDER BY m.terminal_at DESC LIMIT 1",
        [ownerId],
      )
    ).rows[0].id;
    const before = await host.request
      .get("/api/v1/matches/" + matchId + "/observation")
      .then((r) => r.json());
    // Age only this completed synthetic match. The real singleton producer
    // and durable outbox perform expiry on their normal minute schedule.
    await db.query(
      "UPDATE matches SET terminal_at=now()-interval '91 days' WHERE id=$1",
      [matchId],
    );
    await expect(
      host
        .getByRole("status")
        .filter({ hasText: "Round details expired after 90 days" }),
    ).toBeVisible({ timeout: 75000 });
    await expect(
      guest
        .getByRole("status")
        .filter({ hasText: "Round details expired after 90 days" }),
    ).toBeVisible();
    const after = await host.request
      .get("/api/v1/matches/" + matchId + "/observation")
      .then((r) => r.json());
    expect(after.historyExpired).toBe(true);
    expect(after.results).toEqual([]);
    expect(after.seats.map((seat: { score: number }) => seat.score)).toEqual(
      before.seats.map((seat: { score: number }) => seat.score),
    );
    expect(
      (
        await db.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
          matchId,
        ])
      ).rowCount,
    ).toBe(2);
    await host.getByRole("button", { name: "Close match view" }).click();
    await host.getByRole("button", { name: "Close circle" }).click();
    await walk(host, 240, 550);
    await expect(
      host.locator('[data-testid="yard-canvas"] canvas'),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
    await host.screenshot({
      path: "test-results/yard-desktop.png",
      fullPage: true,
    });
  } finally {
    await a.close();
    await b.close();
    await db.end();
  }
});
test("nearby text escapes markup, excludes distant users, respects blocks and accepts reports", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, b, c] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await enter(a, "Talker");
    await enter(b, "Listener");
    await enter(c, "Far away");
    await walk(c, 810, 560);
    await a
      .getByLabel("Nearby message", { exact: true })
      .fill("<img src=x onerror=alert(1)>");
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await expect(b.getByLabel("Nearby messages")).toContainText(
      "<img src=x onerror=alert(1)>",
    );
    await expect(b.locator(".chat-list img")).toHaveCount(0);
    await expect(c.getByLabel("Nearby messages")).not.toContainText("<img");
    await b.getByRole("button", { name: "Block Talker", exact: true }).click();
    await a
      .getByLabel("Nearby message", { exact: true })
      .fill("Blocked direction one");
    await a.getByRole("button", { name: "Send", exact: true }).click();
    await b
      .getByLabel("Nearby message", { exact: true })
      .fill("Blocked direction two");
    await b.getByRole("button", { name: "Send", exact: true }).click();
    await expect(b.getByLabel("Nearby messages")).not.toContainText(
      "Blocked direction one",
    );
    await expect(a.getByLabel("Nearby messages")).not.toContainText(
      "Blocked direction two",
    );
    await b.getByRole("button", { name: "Report Talker", exact: true }).click();
    await b
      .getByLabel("Reason", { exact: true })
      .fill("Synthetic acceptance report");
    await b.getByRole("button", { name: "Submit report" }).click();
    await expect(b.getByLabel("Reason", { exact: true })).toHaveCount(0);
    const db = new Pool({
      connectionString:
        "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
    });
    try {
      const saved = await db.query(
        "SELECT reason FROM reports WHERE reason=$1",
        ["Synthetic acceptance report"],
      );
      expect(saved.rowCount).toBeGreaterThan(0);
    } finally {
      await db.end();
    }
    await walk(c, 480, 560);
    await expect(c.getByLabel("Nearby messages")).not.toContainText("<img");
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("mobile joystick moves on the authoritative server and survives resize/reload identity", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await enter(page, "Mobile visitor");
    const before = (await own(page)).player;
    const joystick = page.getByRole("application", {
      name: "Movement joystick",
    });
    await joystick.scrollIntoViewIfNeeded();
    const box = await joystick.boundingBox();
    const cdp = await context.newCDPSession(page);
    const x = box!.x + box!.width / 2,
      y = box!.y + box!.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 40, y }],
    });
    await expect
      .poll(async () => (await own(page)).player.x - before.x)
      .toBeGreaterThan(20);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const identity = (await own(page)).session.ownerId;
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(
      page.getByRole("img", { name: "Cartoon prison yard" }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Enter yard" }).click();
    await expect(
      page.getByRole("img", { name: "Cartoon prison yard" }),
    ).toBeVisible();
    expect((await own(page)).session.ownerId).toBe(identity);
    await expect(
      page.locator('[data-testid="yard-canvas"] canvas'),
    ).toHaveCount(1);
    await page.screenshot({
      path: "test-results/yard-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
