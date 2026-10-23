import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { Store } from "./store";
import { settings } from "./config";
import { Player, labelledSelect } from "./player";
import { walk, pane } from "../../tests/browser/yard/helpers";

async function horizontalViewport(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
}

async function yardViewport(page: Page) {
  await horizontalViewport(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("yard-canvas")).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId("yard-canvas")).toHaveAttribute(
    "data-player-visible",
    "true",
  );
  const map = await page.getByTestId("yard-canvas").boundingBox();
  assert.ok(map && map.width > 200 && map.height > 130, "Usable yard map");
  const actions = page.getByRole("navigation", { name: "Yard actions" });
  await expect(actions).toBeInViewport({ ratio: 1 });
  for (const name of ["Chat", "Tables", "People"])
    await expect(
      actions.getByRole("button", { name, exact: true }),
    ).toBeInViewport({ ratio: 1 });
  const panel = page.getByRole("complementary", { name: "Yard controls" });
  if (await panel.isVisible()) await expect(panel).toBeInViewport({ ratio: 1 });
}

async function main() {
  const store = new Store(settings().database);
  const run = await store.run("stress-finding-regressions", {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
  });
  const browser = await chromium.launch({ headless: true });
  const players = ["History fix host", "History fix rival"].map(
    (name) => new Player(store, run, name, "regression"),
  );
  let passed = false;
  try {
    const fixture = await browser.newPage();
    await fixture.setContent(
      `<label>Enter as<select><option value="">Myself</option><option value="bot">Changing bot name</option></select></label><svg><g aria-label="Opponent last revealed move"><text>Blockly observation</text></g></svg><label>Opponent last revealed move<select><option value="none">None</option><option value="D">Betray</option></select></label>`,
    );
    await labelledSelect(fixture, "Enter as").selectOption("bot");
    await expect(labelledSelect(fixture, "Enter as")).toHaveValue("bot");
    await labelledSelect(fixture, "Opponent last revealed move").selectOption(
      "D",
    );
    await expect(
      labelledSelect(fixture, "Opponent last revealed move"),
    ).toHaveValue("D");
    await fixture.setContent(
      `<label>Duplicate<select><option value="a">A</option></select></label><label>Duplicate<select><option value="a">A</option></select></label>`,
    );
    await assert.rejects(
      labelledSelect(fixture, "Duplicate").selectOption("a"),
      /strict mode violation/,
    );
    await fixture.close();
    for (const p of players) await p.open(browser);
    const [a, b] = players;
    const bot = await a.publish("cooperate", "History cooperator");
    const buildTab = a.page.getByRole("tab", { name: "Build", exact: true });
    const testTab = a.page.getByRole("tab", { name: "Test", exact: true });
    const summaryTab = a.page.getByRole("tab", {
      name: "Summary",
      exact: true,
    });
    const buildPanel = a.page.locator("#workshop-panel-build");
    const testPanel = a.page.locator("#workshop-panel-test");
    const summaryPanel = a.page.locator("#workshop-panel-summary");
    await expect(buildTab).toHaveAttribute("aria-selected", "true");
    await expect(buildPanel).toBeVisible();
    await expect(testPanel).toBeHidden();
    await expect(summaryPanel).toBeHidden();
    await horizontalViewport(a.page);
    await testTab.click();
    await expect(buildPanel).toBeHidden();
    await expect(testPanel).toBeVisible();
    await expect(summaryPanel).toBeHidden();
    await horizontalViewport(a.page);
    const test = a.page.getByRole("button", {
      name: "Test decision",
      exact: true,
    });
    const preview = a.page.getByLabel("Practice result", { exact: true });
    const practice = async () => {
      await delay(600);
      await test.click();
    };
    await practice();
    await expect(preview).toContainText("Cooperate");
    await summaryTab.click();
    await expect(buildPanel).toBeHidden();
    await expect(testPanel).toBeHidden();
    await expect(summaryPanel).toBeVisible();
    await expect(
      a.page.getByRole("tabpanel", { name: "Summary", exact: true }),
    ).toContainText("Choose cooperate");
    await expect(a.page.getByLabel("Bot name", { exact: true })).toHaveValue(
      "History cooperator",
    );
    await horizontalViewport(a.page);
    await testTab.click();
    await expect(preview).toContainText("Cooperate");
    for (const invalid of ["0", "1.5", "51", ""]) {
      await a.page.getByLabel("Practice round", { exact: true }).fill(invalid);
      await expect(test).toBeDisabled();
      await expect(
        a.page.getByText(
          "Practice round must be a whole number from 1 to 50.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(preview).toHaveCount(0);
    }
    await a.page.getByLabel("Practice round", { exact: true }).fill("1");
    await practice();
    await expect(preview).toContainText("Cooperate");
    await labelledSelect(a.page, "Opponent last revealed move").selectOption(
      "D",
    );
    await expect(preview).toHaveCount(0);
    await practice();
    await expect(preview).toContainText("Cooperate");
    await buildTab.click();
    await expect(labelledSelect(a.page, "Starter strategy")).toHaveValue(
      "cooperate",
    );
    await labelledSelect(a.page, "Starter strategy").selectOption("betray");
    await a.page
      .getByRole("button", { name: "Load starter", exact: true })
      .click();
    await testTab.click();
    await expect(preview).toHaveCount(0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await a.page.route("**/api/v1/bots/preview", async (route) => {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    const requested = a.page.waitForRequest((r) =>
      r.url().endsWith("/bots/preview"),
    );
    await practice();
    await requested;
    await a.page.getByLabel("Practice round", { exact: true }).fill("2");
    const returned = a.page.waitForResponse((r) =>
      r.url().endsWith("/bots/preview"),
    );
    release();
    await returned;
    await expect(test).toBeEnabled();
    await expect(preview).toHaveCount(0);
    await a.page.unroute("**/api/v1/bots/preview");
    await practice();
    await expect(preview).toContainText("Betray");
    // Published revision stays Cooperate; the draft practice edits are separate.
    const rival = await b.publish("betray", "History betrayer");
    await Promise.all(players.map((p) => p.backToYard()));
    await Promise.all(players.map((p) => walk(p.page, 240, 450)));
    const desktop = a.page.viewportSize()!;
    await yardViewport(a.page);
    await a.page.setViewportSize({ width: 390, height: 844 });
    await yardViewport(a.page);
    await pane(a.page, "Tables");
    await a.page
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await labelledSelect(a.page, "Enter as").selectOption(bot.id);
    await a.page.locator(".yard-settings > summary").click();
    await a.page.getByLabel("Rounds", { exact: true }).fill("12");
    await a.page.getByLabel("Decision seconds", { exact: true }).fill("5");
    await a.page.getByLabel("Seats", { exact: true }).fill("2");
    await a.page.locator(".yard-settings > summary").click();
    await expect(
      a.page.getByRole("button", { name: "Create circle match", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await yardViewport(a.page);
    await a.page
      .getByRole("button", { name: "Create circle match", exact: true })
      .click();
    await expect(
      a.page.getByRole("button", { name: "Ready up", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await yardViewport(a.page);
    const mine = await a.get("/matches/mine");
    const matchId = mine.matches[0].id;
    await a.command(matchId, "match.configure", {
      rounds: 12,
      decisionMs: 5000,
      revealMs: 1000,
      maxSeats: 2,
    });
    await pane(b.page, "Tables");
    await b.page
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await labelledSelect(b.page, "Enter as").selectOption(rival.id);
    await b.page
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await Promise.all(
      players.map((p) =>
        p.page.getByRole("button", { name: "Ready up", exact: true }).click(),
      ),
    );
    await a.page
      .getByRole("button", { name: "Start game", exact: true })
      .click();
    const end = Date.now() + 90000;
    while (
      (await a.get(`/matches/${matchId}/observation`)).phase !== "finished"
    ) {
      assert.ok(Date.now() < end, "Match completes");
      await delay(200);
    }
    const feedback = a.page.getByLabel("Your bot decisions", { exact: true });
    await expect(
      feedback.getByText("Showing latest 5 of 12 recorded decisions.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(feedback.locator("details")).toHaveCount(5);
    await feedback
      .getByRole("button", { name: "Show older decisions", exact: true })
      .click();
    await expect(feedback.locator("details")).toHaveCount(12);
    await yardViewport(a.page);
    await feedback
      .getByText("Round 1 · decision locked", { exact: true })
      .click();
    await expect(feedback.locator("details[open]")).toContainText("Choose C");
    await feedback
      .getByRole("button", { name: "Show latest 5 decisions", exact: true })
      .click();
    await expect(feedback.locator("details")).toHaveCount(5);
    await a.observe();
    await a.page.setViewportSize(desktop);
    await yardViewport(a.page);
    await a.observe();
    await store.event(run, "stress-fixes.verified", "verifier", {
      matchId,
      history: true,
      practiceValidation: true,
      previewInvalidation: true,
      lateResponseFence: true,
      semanticSelectors: true,
      workshopTabs: true,
      phoneViewport: true,
      desktopNoHorizontalOverflow: true,
    });
    passed = true;
    console.log(
      JSON.stringify({ runId: run, matchId, stressFindingRegressions: "PASS" }),
    );
  } catch (error) {
    await store.issue(run, "Stress-finding regression failed", "needs-triage", {
      error: String(error),
    });
    throw error;
  } finally {
    await Promise.allSettled(players.map((p) => p.close()));
    await browser.close();
    await store.finish(run, passed ? "passed" : "failed");
    await store.db.end();
  }
}
main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
