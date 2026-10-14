import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { enter, walk } from "../yard/helpers";
import { constructMirror } from "./helpers";

test("a user constructs, tests, publishes, competes, watches and revises a visual bot", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext(),
    humanContext = await browser.newContext();
  const owner = await ownerContext.newPage(),
    human = await humanContext.newPage();
  const errors: string[] = [];
  owner.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(owner, "Builder owner");
    await enter(human, "Builder opponent");
    await owner.goto("/bots/build");
    await expect(owner.getByLabel("Block to edit")).toBeVisible();
    await owner
      .getByLabel("Bot name", { exact: true })
      .fill("Hand-built mirror");
    await constructMirror(owner);
    await owner
      .getByLabel("Opponent last revealed move", { exact: true })
      .selectOption("D");
    await owner
      .getByRole("button", { name: "Test decision", exact: true })
      .click();
    await expect(owner.getByLabel("Practice result")).toContainText(
      "Chooses Betray",
    );
    await owner
      .getByLabel("Opponent last revealed move", { exact: true })
      .selectOption("none");
    await owner
      .getByRole("button", { name: "Test decision", exact: true })
      .click();
    await expect(owner.getByLabel("Practice result")).toContainText(
      "Chooses Cooperate",
    );
    await owner
      .getByRole("button", { name: "Publish strategy", exact: true })
      .click();
    await expect(
      owner.getByText(
        "Published revision 1. Enter this bot at a mixed circle.",
        { exact: true },
      ),
    ).toBeVisible();
    const botId = new URL(owner.url()).searchParams.get("bot")!;
    const version = await owner.request
      .get("/api/v1/bots/" + botId + "/versions/latest")
      .then((r) => r.json());
    await owner.screenshot({
      path: join(
        process.env.SOAP_VISUAL_EVIDENCE ?? "test-results",
        "visual-builder-desktop.png",
      ),
      fullPage: true,
    });
    await owner
      .getByRole("link", { name: "Enter bot in the yard", exact: true })
      .click();
    await owner
      .getByRole("button", { name: "Enter yard", exact: true })
      .click();
    await walk(owner, 240, 450);
    await walk(human, 240, 450);
    await owner
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await expect(owner.getByLabel("Enter as")).toHaveValue(botId);
    await owner.getByLabel("Rounds", { exact: true }).fill("5");
    await owner.getByLabel("Decision seconds").fill("5");
    await owner.getByLabel("Seats", { exact: true }).fill("2");
    await owner.getByRole("button", { name: "Create circle match" }).click();
    await expect(owner.getByRole("button", { name: "Ready up" })).toBeVisible();
    let matchId = "";
    await expect
      .poll(async () => {
        const yard = await owner.request
          .get("/api/v1/yard")
          .then((r) => r.json());
        const id = yard.circles.find(
          (c: any) => c.id === "yard-circle-3",
        ).matchId;
        if (id) matchId = id;
        return id;
      })
      .not.toBeNull();
    await owner.evaluate(async (id) => {
      const s = await (await fetch("/api/v1/session")).json(),
        m = await (
          await fetch("/api/v1/matches/" + id + "/observation")
        ).json();
      const r = await fetch("/api/v1/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": s.csrfToken,
        },
        body: JSON.stringify({
          v: 1,
          commandId: crypto.randomUUID(),
          controllerEpoch: s.controllerEpoch,
          type: "match.configure",
          matchId: id,
          matchVersion: m.version,
          payload: { ...m.settings, revealMs: 1000 },
        }),
      });
      if (!(await r.json()).ok) throw new Error("Configure failed");
    }, matchId);
    await human
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await human
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await owner.getByRole("button", { name: "Ready up" }).click();
    await human.getByRole("button", { name: "Ready up" }).click();
    await owner.getByRole("button", { name: "Start game" }).click();
    for (let round = 1; round <= 5; round++)
      await human.getByRole("button", { name: "Betray", exact: true }).click();
    await expect(
      owner.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(owner.getByLabel("Your bot decisions")).toContainText(
      "Round 5",
    );
    const final = await human.request
      .get("/api/v1/matches/" + matchId + "/observation")
      .then((r) => r.json());
    expect(final.seats.find((s: any) => s.kind === "visual").score).toBe(-6);
    expect(final.seats.find((s: any) => s.kind === "human").score).toBe(-1);
    expect(final.seats.find((s: any) => s.kind === "visual").botVersionId).toBe(
      version.version_id,
    );
    await owner.getByRole("link", { name: "Edit for the next game" }).click();
    await expect(owner.getByLabel("Bot name", { exact: true })).toHaveValue(
      "Hand-built mirror",
    );
    await owner.getByLabel("Starter strategy").selectOption("cooperate");
    await owner
      .getByRole("button", { name: "Load starter", exact: true })
      .click();
    await expect(
      owner.getByLabel("Strategy summary", { exact: true }),
    ).not.toContainText("Otherwise");
    await owner
      .getByRole("button", { name: "Publish strategy", exact: true })
      .click();
    await expect(
      owner.getByText(
        "Published revision 2. Enter this bot at a mixed circle.",
        { exact: true },
      ),
    ).toBeVisible();
    const newer = await owner.request
      .get("/api/v1/bots/" + botId + "/versions/latest")
      .then((r) => r.json());
    expect(newer.version_id).not.toBe(version.version_id);
    expect(
      (
        await human.request
          .get("/api/v1/matches/" + matchId + "/observation")
          .then((r) => r.json())
      ).seats.find((s: any) => s.kind === "visual").botVersionId,
    ).toBe(version.version_id);
    expect(errors).toEqual([]);
  } finally {
    await ownerContext.close();
    await humanContext.close();
  }
});
