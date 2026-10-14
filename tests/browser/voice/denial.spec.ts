import { test, expect } from "@playwright/test";
import { enter } from "../yard/helpers";
test.use({
  launchOptions: {
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream=deny",
    ],
  },
});
test("real browser microphone denial keeps listening and nearby text usable", async ({
  browser,
}) => {
  const context = await browser.newContext({ permissions: [] }),
    page = await context.newPage();
  try {
    await enter(page, "No microphone");
    const panel = page.getByRole("region", { name: "Nearby voice" });
    await panel.getByRole("button", { name: "Join nearby voice" }).click();
    await panel.getByRole("button", { name: "Enable microphone" }).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Enable microphone" }),
    ).toBeEnabled();
    await expect(panel.locator(".pill")).toContainText("connected");
    await page
      .getByLabel("Nearby message", { exact: true })
      .fill("Text fallback");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel("Nearby messages")).toContainText(
      "Text fallback",
    );
  } finally {
    await context.close();
  }
});
