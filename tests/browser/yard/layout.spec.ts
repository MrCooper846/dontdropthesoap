import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { enter, walk, own, pane, settings, speedReveal } from "./helpers";
test.use({ actionTimeout: 10000 });
async function viewport(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByTestId("yard-canvas")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("yard-canvas")).toHaveAttribute(
    "data-player-visible",
    "true",
  );
  const map = await page.getByTestId("yard-canvas").boundingBox();
  expect(map!.height).toBeGreaterThan(130);
  expect(map!.width).toBeGreaterThan(200);
}
test("map-first phone layout keeps joining and choices in the viewport across orientation changes", async ({
  browser,
}) => {
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  });
  await db.query("TRUNCATE owners CASCADE");
  await db.end();
  const a = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const b = await browser.newContext({
    viewport: { width: 360, height: 780 },
    hasTouch: true,
    isMobile: true,
  });
  const host = await a.newPage(),
    guest = await b.newPage();
  const errors: string[] = [];
  host.on("pageerror", (error) => errors.push(error.message));
  guest.on("pageerror", (error) => errors.push(error.message));
  try {
    await enter(host, "Portrait host");
    await enter(guest, "Portrait guest");
    await viewport(host);
    await host.screenshot({
      path: "test-results/map-first-roaming-portrait.png",
    });
    await host.keyboard.down("ArrowRight");
    await pane(host, "Tables");
    const stopped = (await own(host)).player;
    await host.waitForTimeout(400);
    expect(Math.abs((await own(host)).player.x - stopped.x)).toBeLessThan(5);
    await host.keyboard.up("ArrowRight");
    await expect(
      host.getByRole("button", { name: "Close panel", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await host
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    await walk(host, 240, 450);
    await walk(guest, 240, 450);
    await pane(host, "Tables");
    await host
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await settings(host);
    await host.getByLabel("Rounds", { exact: true }).fill("5");
    await host.getByLabel("Decision seconds").fill("10");
    await host.getByLabel("Seats", { exact: true }).fill("2");
    await host.locator(".yard-settings > summary").click();
    await viewport(host);
    await expect(
      host.getByRole("button", { name: "Create circle match" }),
    ).toBeInViewport({ ratio: 1 });
    await host.getByRole("button", { name: "Create circle match" }).click();
    await expect(host.getByRole("button", { name: "Ready up" })).toBeInViewport(
      { ratio: 1 },
    );
    await speedReveal(host);
    await host.getByRole("button", { name: "Close match view" }).click();
    await host.getByRole("button", { name: /My table/ }).click();
    await expect(host.getByRole("button", { name: "Ready up" })).toBeVisible();
    await pane(guest, "Tables");
    await guest
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await expect(
      guest.getByRole("button", { name: "Join circle", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await guest
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await test.step("Ready the host", async () => {
      await host.getByRole("button", { name: "Ready up" }).click();
    });
    await test.step("Ready the phone guest", async () => {
      await guest.screenshot({
        path: "test-results/map-first-guest-waiting.png",
      });
      const response = guest.waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/commands") &&
          response.request().method() === "POST",
      );
      await guest.getByRole("button", { name: "Ready up" }).click();
      const ack = await (await response).json();
      expect(ack.ok, ack.error?.code).toBe(true);
      await expect(
        guest.getByRole("button", { name: "Not ready", exact: true }),
      ).toBeVisible();
      await guest.screenshot({
        path: "test-results/map-first-guest-ready.png",
      });
    });
    await test.step("Start the human match", async () => {
      await host.getByRole("button", { name: "Start game" }).click();
    });
    for (let round = 1; round <= 5; round++) {
      const cooperate = host.getByRole("button", {
        name: "Cooperate",
        exact: true,
      });
      const betray = guest.getByRole("button", { name: "Betray", exact: true });
      await expect(cooperate).toBeInViewport({ ratio: 1 });
      await expect(betray).toBeInViewport({ ratio: 1 });
      await viewport(host);
      if (round === 1) {
        await host.screenshot({
          path: "test-results/map-first-choices-portrait.png",
        });
        await host.setViewportSize({ width: 844, height: 390 });
        await viewport(host);
        await expect(cooperate).toBeInViewport({ ratio: 1 });
        await host.screenshot({
          path: "test-results/map-first-choices-landscape.png",
        });
      }
      await cooperate.click();
      if (round === 1) {
        await pane(host, "Chat");
        await expect(
          host.getByRole("button", { name: /My table/ }),
        ).toContainText("Locked");
        await host.getByRole("button", { name: /My table/ }).click();
      }
      await betray.click();
    }
    await expect(
      host.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    await host
      .getByRole("button", { name: "Close match view", exact: true })
      .click();
    await host.setViewportSize({ width: 390, height: 450 });
    await pane(host, "Chat");
    await host
      .getByLabel("Nearby message", { exact: true })
      .fill("Still here after the game");
    await host.getByRole("button", { name: "Send", exact: true }).click();
    await expect(host.getByLabel("Nearby messages")).toContainText(
      "Still here after the game",
    );
    await viewport(host);
    expect((await own(host)).player.seated).toBe(false);
    await expect(
      host.locator('[data-testid="yard-canvas"] canvas'),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await a.close();
    await b.close();
  }
});
