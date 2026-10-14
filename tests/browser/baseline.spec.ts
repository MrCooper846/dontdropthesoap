import { test, expect } from "@playwright/test";
test("two browsers play the baseline and reveal scores", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const host = await a.newPage(),
    guest = await b.newPage();
  for (const [page, name] of [
    [host, "Baseline Host"],
    [guest, "Baseline Guest"],
  ] as const) {
    await page.goto("/nickname");
    await page.getByPlaceholder("e.g. Dave The Betrayer").fill(name);
    await page.getByRole("button", { name: "Save Nickname" }).click();
  }
  await host.getByRole("button", { name: "Create Lobby", exact: true }).click();
  await host.getByLabel("Rounds").fill("3");
  await host.getByRole("button", { name: "Create Lobby", exact: true }).click();
  await expect(host).toHaveURL(/lobby/);
  await guest.goto(host.url());
  await expect(
    guest.getByText("Baseline Host", { exact: false }).first(),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: "Start Game" })).toBeEnabled();
  await host.getByRole("button", { name: "Start Game" }).click();
  for (let round = 1; round <= 3; round++) {
    await host.getByRole("button", { name: "Cooperate", exact: true }).click();
    await guest.getByRole("button", { name: "Defect", exact: true }).click();
    if (round < 3) {
      await expect(
        host.getByRole("button", { name: "Next Round Now" }),
      ).toBeVisible();
      await host.getByRole("button", { name: "Next Round Now" }).click();
    }
  }
  await expect(
    host.getByRole("heading", { name: "Final Results" }),
  ).toBeVisible();
  await expect(
    guest.getByRole("heading", { name: "Final Results" }),
  ).toBeVisible();
  await a.close();
  await b.close();
});
