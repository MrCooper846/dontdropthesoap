import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { enter, walk } from "./helpers";
test("a deserted waiting room expires durably, frees its circle and explains the outcome on return", async ({
  browser,
}) => {
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  });
  const context = await browser.newContext();
  let returned: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await db.query("TRUNCATE owners CASCADE");
    const page = await context.newPage();
    await enter(page, "Returning waiting guest");
    await walk(page, 240, 450);
    await page
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await page.getByRole("button", { name: "Create circle match" }).click();
    await expect(page.getByRole("button", { name: "Ready up" })).toBeVisible();
    const id = (await db.query("SELECT id FROM matches WHERE phase='waiting'"))
      .rows[0].id;
    // Seed a past absence, then prove the live authenticated participant clears it.
    await db.query(
      "UPDATE matches SET waiting_empty_since=clock_timestamp()-interval '16 minutes' WHERE id=$1",
      [id],
    );
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT waiting_empty_since FROM matches WHERE id=$1",
              [id],
            )
          ).rows[0].waiting_empty_since,
        { timeout: 12000 },
      )
      .toBeNull();
    const storageState = await context.storageState();
    await context.close();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT waiting_empty_since IS NOT NULL AS absent FROM matches WHERE id=$1",
              [id],
            )
          ).rows[0].absent,
        { timeout: 12000 },
      )
      .toBe(true);
    // Accelerate only the persisted fixture age; production still uses its fixed 15-minute bound.
    await db.query(
      "UPDATE matches SET waiting_empty_since=clock_timestamp()-interval '16 minutes' WHERE id=$1",
      [id],
    );
    await expect
      .poll(
        async () =>
          (await db.query("SELECT phase FROM matches WHERE id=$1", [id]))
            .rows[0].phase,
        { timeout: 12000 },
      )
      .toBe("cancelled");
    expect(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM balance_entries WHERE match_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(0);
    returned = await browser.newContext({ storageState });
    const back = await returned.newPage();
    await back.goto("/yard?match=" + id);
    await back.getByRole("button", { name: "Enter yard" }).click();
    await expect(
      back.getByRole("status").filter({ hasText: "closed after 15 minutes" }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const view = await back.request
          .get("/api/v1/yard")
          .then((r) => r.json());
        return (
          view.circles.find(
            (circle: { id: string }) => circle.id === "noodle-exchange",
          )?.matchId ??
          view.circles.find(
            (circle: { name: string }) => circle.name === "Noodle Exchange",
          )?.matchId
        );
      })
      .toBeNull();
  } finally {
    await context.close();
    await returned?.close();
    await db.end();
  }
});
