import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { enter } from "../yard/helpers";
import { constructMirror } from "./helpers";
test("touch viewport supports complete block construction, real drag, rotation and saved version reload", async ({
  browser,
}) => {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await enter(page, "Touch builder");
    await page.goto("/bots/build");
    await expect(page.getByLabel("Block to edit")).toBeVisible();
    await constructMirror(page);
    const root = page
      .locator(".blocklyBlockCanvas > .blocklyDraggable")
      .first();
    await root.scrollIntoViewIfNeeded();
    const rect = await root.boundingBox(),
      before = await root.getAttribute("transform");
    const touch = await context.newCDPSession(page);
    const x = Math.max(20, rect!.x + 24),
      y = rect!.y + 18;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + 26, y: y + 32 }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(root).not.toHaveAttribute("transform", before!);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole("button", { name: "Fit blocks on screen" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.getByLabel("Bot name", { exact: true }).fill("Touch mirror");
    await page
      .getByRole("button", { name: "Publish strategy", exact: true })
      .click();
    await expect(
      page.getByText(
        "Published revision 1. Enter this bot at a mixed circle.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Bot name", { exact: true })).toHaveValue(
      "Touch mirror",
    );
    await expect(
      page.getByLabel("Strategy summary", { exact: true }),
    ).toContainText("this opponent's last revealed move");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: join(
        process.env.SOAP_VISUAL_EVIDENCE ?? "test-results",
        "visual-builder-mobile.png",
      ),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
