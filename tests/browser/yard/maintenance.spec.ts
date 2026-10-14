import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { enter, walk } from "./helpers";
const database =
  "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser";
function admissions(open: boolean) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/operator.ts", "apply"],
      {
        input: JSON.stringify({
          commandId: randomUUID(),
          action: open ? "matches.resume" : "matches.pause",
          targetId: "00000000-0000-4000-8000-000000000001",
          reason: "Synthetic yard maintenance fixture",
        }),
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: database,
          SOAP_OPERATOR_ID: "yard-maintenance-fixture",
        },
        encoding: "utf8",
        timeout: 15000,
      },
    ),
  );
}
test("operator pause is visible in the yard, rejects real circle creation, and resumes without losing presence", async ({
  page,
}) => {
  const db = new Pool({ connectionString: database });
  try {
    await db.query("TRUNCATE owners CASCADE");
    admissions(true);
    await enter(page, "Maintenance yard guest");
    await walk(page, 240, 450);
    await page
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    admissions(false);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "New games are paused for maintenance" }),
    ).toBeVisible();
    const publicStatus = await page.request.get("/api/v1/service");
    expect(await publicStatus.json()).toEqual({ matchesOpen: false });
    await page.getByRole("button", { name: "Create circle match" }).click();
    await expect(page.locator(".yard-alert")).toContainText(
      "New games are paused",
    );
    expect(
      (await db.query("SELECT count(*)::int AS n FROM matches")).rows[0].n,
    ).toBe(0);
    await expect(
      page.getByRole("img", { name: "Cartoon prison yard" }),
    ).toBeVisible();
    admissions(true);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "New games are paused for maintenance" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Create circle match" }).click();
    await expect(page.getByRole("button", { name: "Ready up" })).toBeVisible();
    await page.getByRole("button", { name: "Leave table" }).click();
    await expect
      .poll(
        async () =>
          (
            await db.query(
              "SELECT count(*)::int AS n FROM matches WHERE phase NOT IN ('finished','aborted','cancelled')",
            )
          ).rows[0].n,
      )
      .toBe(0);
  } finally {
    admissions(true);
    await db.end();
  }
});
