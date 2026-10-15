import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
test("credential management pages older metadata without growing the displayed list", async ({
  page,
}) => {
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_browser",
  });
  try {
    await page.goto("/play");
    await page.getByLabel("Your alias").fill("History owner");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await page.getByRole("link", { name: "Manage your bots" }).click();
    await page.getByLabel("Bot name").fill("History snake");
    await page.getByRole("button", { name: "Register bot" }).click();
    await expect(
      page.getByRole("heading", { name: "History snake" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Issue credential" }).click();
    await page.getByRole("button", { name: "Hide credential" }).click();
    const session = await page.request
      .get("/api/v1/session")
      .then((r) => r.json());
    const bot = (
      await db.query(
        "SELECT id FROM bots WHERE owner_id=$1 AND name='History snake'",
        [session.ownerId],
      )
    ).rows[0].id;
    const ids = Array.from({ length: 105 }, () => randomUUID());
    await db.query(
      "INSERT INTO bot_credentials(id,bot_id,secret_hash,scopes,expires_at,revoked_at) SELECT id,$1,replace(id::text,'-','')||replace(id::text,'-',''),ARRAY['observations:read','moves:write'],now()+interval '29 days',now() FROM unnest($2::uuid[]) AS id",
      [bot, ids],
    );
    await page.getByRole("button", { name: "Manage credentials" }).click();
    await expect(
      page.getByRole("button", { name: "Older credentials", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Revoke", exact: true }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Older credentials", exact: true })
      .click();
    await expect(page.getByText(/· revoked/)).toHaveCount(6);
    await expect(
      page.getByRole("button", { name: "Revoke", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Older credentials", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Manage credentials" }).click();
    await expect(
      page.getByRole("button", { name: "Revoke", exact: true }),
    ).toHaveCount(1);
  } finally {
    await db.end();
  }
});
