import { test, expect } from "@playwright/test";
test.use({ hasTouch: true, isMobile: true });
test("Phaser and Blockly mount once, dispose and remount on a mobile viewport", async ({
  page,
}) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(msg.text());
  });
  page.on("pageerror", (e) => console.log(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lab");
  await expect(
    page.getByRole("status", { name: "Prototype status" }),
  ).toHaveText("Renderer and editor mounted", { timeout: 20000 });
  await expect(page.locator('[data-testid="yard-spike"] canvas')).toHaveCount(
    1,
  );
  await expect(page.locator(".blocklySvg")).toHaveCount(1);
  await page.locator('[data-testid="editor-spike"]').scrollIntoViewIfNeeded();
  const block = await page
    .locator(".blocklyFlyout .blocklyDraggable")
    .first()
    .boundingBox();
  expect(block).not.toBeNull();
  const cdp = await page.context().newCDPSession(page);
  const x = block!.x + 20,
    y = block!.y + 20;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 12; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + i * 14, y: y + 20 }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByTestId("block-count")).toHaveText(
    "Blocks in workspace: 1",
  );
  await page.getByRole("button", { name: "Unmount prototypes" }).click();
  await expect(page.locator("canvas:not(.blocklyComputeCanvas)")).toHaveCount(
    0,
  );
  await expect(page.locator(".blocklySvg")).toHaveCount(0);
  await page.getByRole("button", { name: "Mount prototypes" }).click();
  await expect(
    page.getByRole("status", { name: "Prototype status" }),
  ).toHaveText("Renderer and editor mounted");
  await expect(page.locator('[data-testid="yard-spike"] canvas')).toHaveCount(
    1,
  );
  await expect(page.locator(".blocklySvg")).toHaveCount(1);
});
