import { test, expect } from "@playwright/test";
import { enter } from "../yard/helpers";
test("yard voice uses explicit microphone permission, keyboard push-to-talk, mute and clean leave", async ({
  browser,
}) => {
  const talkerContext = await browser.newContext({
      permissions: ["microphone"],
    }),
    listenerContext = await browser.newContext();
  const talker = await talkerContext.newPage(),
    listener = await listenerContext.newPage();
  try {
    await listener.goto("/lab/media");
    await listener.waitForFunction(() => !!window.mediaProbe);
    await listener.evaluate(() => window.mediaProbe.enter("Control listener"));
    await enter(talker, "Control talker");
    await listener.evaluate(() => window.mediaProbe.voice());
    const panel = talker.getByRole("region", { name: "Nearby voice" });
    await panel.getByRole("button", { name: "Join nearby voice" }).click();
    await panel.getByRole("button", { name: "Enable microphone" }).click();
    const hold = panel.getByRole("button", { name: "Hold to talk" });
    await expect(hold).toBeVisible();
    await hold.focus();
    await talker.keyboard.down("Space");
    await expect(panel.locator(".pill")).toContainText("transmitting");
    await expect
      .poll(() =>
        listener.evaluate(
          async () => (await window.mediaProbe.stats()).packets,
        ),
      )
      .toBeGreaterThan(10);
    await talker.keyboard.up("Space");
    await expect(panel.locator(".pill")).not.toContainText("transmitting");
    await panel
      .getByRole("button", { name: "Mute microphone", exact: true })
      .click();
    await expect(hold).toBeDisabled();
    await panel.getByRole("button", { name: "Unmute microphone" }).click();
    await expect(hold).toBeEnabled();
    await panel.getByLabel("Mute spectators while seated").check();
    await panel.getByRole("button", { name: "Leave voice" }).click();
    await expect(
      panel.getByRole("button", { name: "Join nearby voice" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        listener.evaluate(
          async () => (await window.mediaProbe.stats()).consumers,
        ),
      )
      .toBe(0);
    await talker
      .getByLabel("Nearby message", { exact: true })
      .fill("Voice can leave; text still works");
    await talker.getByRole("button", { name: "Send", exact: true }).click();
    await expect(talker.getByLabel("Nearby messages")).toContainText(
      "Voice can leave",
    );
    await talker.screenshot({
      path: "test-results/voice-controls.png",
      fullPage: true,
    });
  } finally {
    await talkerContext.close();
    await listenerContext.close();
  }
});
