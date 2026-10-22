import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "./store";
import { settings as arenaSettings } from "./config";
import { Player } from "./player";
import { walk, pane, settings } from "../../tests/browser/yard/helpers";

async function until(check: () => Promise<boolean>, label: string, ms = 70000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (await check()) return;
    await delay(150);
  }
  throw Error("Timed out: " + label);
}
async function main() {
  const store = new Store(arenaSettings().database);
  const run = await store.run("six-finding-regressions", {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: true,
  });
  const browser = await chromium.launch({ headless: true });
  const players = ["Fix host", "Fix human", "Fix rival"].map(
    (name) => new Player(store, run, name, "regression"),
  );
  let passed = false;
  try {
    for (const p of players) await p.open(browser);
    const [a, b, c] = players;
    const bots = await Promise.all([
      a.publish("cooperate", "Fix cooperator"),
      c.publish("betray", "Fix betrayer"),
    ]);
    await Promise.all([a.backToYard(), c.backToYard()]);
    await Promise.all(players.map((p) => walk(p.page, 240, 450)));
    await pane(a.page, "Tables");
    await a.page
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await a.page.getByLabel("Enter as").selectOption(bots[0].id);
    await settings(a.page);
    await a.page.getByLabel("Rounds", { exact: true }).fill("3");
    await expect(
      a.page.getByRole("button", { name: "Create circle match", exact: true }),
    ).toBeDisabled();
    await expect(
      a.page.getByText("Rounds must be a whole number from 5 to 50.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(a.page.getByLabel("Rounds", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await a.page.getByLabel("Rounds", { exact: true }).fill("5");
    await a.page.getByLabel("Decision seconds").fill("5");
    await a.page.getByLabel("Seats", { exact: true }).fill("3");
    await a.page.locator(".yard-settings > summary").click();
    await a.page
      .getByRole("button", { name: "Create circle match", exact: true })
      .click();
    await expect(
      a.page.getByRole("button", { name: "My table", exact: true }),
    ).toBeVisible();
    let matchId = "";
    await until(async () => {
      const mine = await a.get("/matches/mine");
      matchId = mine.matches[0]?.id;
      return !!matchId;
    }, "own match history");
    assert.equal(
      (await b.get("/matches/mine")).matches.some((m: any) => m.id === matchId),
      false,
      "Another owner's history is private",
    );
    await a.command(matchId, "match.configure", {
      rounds: 5,
      decisionMs: 5000,
      revealMs: 1000,
      maxSeats: 3,
    });
    // The original reproduction requires only inspection, without a rejected join/create.
    await pane(a.page, "Tables");
    await a.page
      .locator(".circle-card")
      .filter({ hasText: "Snake Pit" })
      .click();
    await expect(
      a.page.getByRole("button", { name: "My table", exact: true }),
    ).toBeVisible();
    await a.page.getByRole("button", { name: "My table", exact: true }).click();
    await expect(
      a.page.getByRole("button", { name: "Ready up", exact: true }),
    ).toBeVisible();
    for (const [p, botId] of [
      [b, ""],
      [c, bots[1].id],
    ] as const) {
      await pane(p.page, "Tables");
      await p.page
        .locator(".circle-card")
        .filter({ hasText: "Noodle Exchange" })
        .click();
      await p.page.getByLabel("Enter as").selectOption(botId);
      await p.page
        .getByRole("button", { name: "Join circle", exact: true })
        .click();
    }
    await Promise.all(
      players.map((p) =>
        p.page.getByRole("button", { name: "Ready up", exact: true }).click(),
      ),
    );
    await a.page
      .getByRole("button", { name: "Start game", exact: true })
      .click();
    await until(
      async () =>
        (await a.get(`/matches/${matchId}/observation`)).phase === "collecting",
      "mixed game starts",
    );
    const roster = a.page.locator(".match-roster");
    if ((await roster.getAttribute("open")) === null)
      await roster.locator("summary").click();
    const clanker = roster.locator("li").filter({ hasText: "The Clanker" });
    await expect(clanker).toContainText("system player · playing");
    await expect(clanker).not.toContainText("not ready");
    await pane(b.page, "People");
    await b.page
      .getByRole("button", { name: "Challenge Fix rival", exact: true })
      .click();
    await expect(
      b.page.getByText(
        "This circle already has a game. Wait for it to finish or choose an empty circle before sending a challenge.",
        { exact: true },
      ),
    ).toBeVisible();
    await b.page.getByRole("button", { name: "My table", exact: true }).click();
    await a.page
      .getByRole("link", { name: "Edit for the next game", exact: true })
      .click();
    await expect(
      a.page.getByRole("link", { name: "Back to yard", exact: true }),
    ).toHaveAttribute("href", "/yard?match=" + matchId);
    await a.page
      .getByRole("link", { name: "Back to yard", exact: true })
      .click();
    await a.page
      .getByRole("button", { name: "Enter yard", exact: true })
      .click();
    await expect(
      a.page.getByRole("button", { name: "My table", exact: true }),
    ).toBeVisible();
    await expect(a.page.getByLabel("Your bot decisions")).toBeVisible();
    await until(async () => {
      const m = await b.get(`/matches/${matchId}/observation`);
      return m.results.some(
        (r: any) => r.aSource === "timeout" || r.bSource === "timeout",
      );
    }, "timeout result exposed after reveal");
    await expect(
      b.page.getByText(/You missed \d+ decision deadline/),
    ).toBeVisible();
    // No choices are submitted by this human: all five defaults are deliberate.
    await until(
      async () =>
        (await b.get(`/matches/${matchId}/observation`)).phase === "finished",
      "mixed match completes",
    );
    await expect(
      b.page.locator(".lockCard").filter({ hasText: "Fix human" }),
    ).toContainText("automatic Cooperate — timed out");
    await a.page.goto("/yard");
    await a.page
      .getByRole("button", { name: "Enter yard", exact: true })
      .click();
    await expect(
      a.page.getByRole("heading", { name: "Final results", exact: true }),
    ).toBeVisible();
    await a.page.reload();
    await a.page
      .getByRole("button", { name: "Enter yard", exact: true })
      .click();
    await expect(
      a.page.getByRole("heading", { name: "Final results", exact: true }),
    ).toBeVisible();
    await pane(a.page, "Tables");
    await expect(
      a.page.getByRole("heading", { name: "Your recent tables", exact: true }),
    ).toBeVisible();
    await a.page
      .getByRole("button", { name: /Open Fix cooperator.*results/ })
      .click();
    await expect(
      a.page.getByRole("heading", { name: "Final results", exact: true }),
    ).toBeVisible();
    assert.equal(
      (await b.get(`/matches/${matchId}/observation`)).seats.find(
        (s: any) => s.kind === "human",
      ).timeouts,
      5,
    );
    for (const p of players) await p.observe();
    await store.event(run, "six-fixes.verified", null, {
      matchId,
      historyIsolation: true,
      inspectionPreservesDock: true,
      editorAndReloadRecovery: true,
      fieldValidation: true,
      friendlyChallengeRejection: true,
      clankerStatus: true,
      timeoutFeedback: true,
    });
    passed = true;
    console.log(
      JSON.stringify({
        runId: run,
        matchId,
        sixFindingRegressions: "PASS",
        historyOwnership: "PASS",
        deliberateHumanTimeouts: 5,
      }),
    );
  } catch (error) {
    await store.issue(run, "Six-finding regression failed", "needs-triage", {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    await Promise.allSettled(players.map((p) => p.close()));
    await browser.close();
    await store.finish(run, passed ? "passed" : "failed");
    await store.db.end();
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
