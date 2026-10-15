import { test, expect } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
import { voiceTlsOptions } from "../../runtime/voice-tls";
test("an owner sees actionable socket capacity feedback and reconnects when an older connection closes", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    first = await context.newPage();
  const extras: Socket[] = [];
  try {
    await first.goto("/yard");
    await first
      .getByLabel("Nickname", { exact: true })
      .fill("Socket budget cohort");
    await first.getByRole("button", { name: "Save alias" }).click();
    await expect(
      first.getByRole("button", { name: "Enter yard" }),
    ).toBeEnabled();
    const session = (await context.cookies()).find(
      (cookie) => cookie.name === "dds_session",
    )!;
    expect({
      secure: session.secure,
      httpOnly: session.httpOnly,
      sameSite: session.sameSite,
    }).toEqual({
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    for (let i = 0; i < 7; i++) {
      const socket = io("https://127.0.0.1:3107/game-v1", {
        transports: ["websocket"],
        ...voiceTlsOptions(),
        extraHeaders: {
          Origin: "https://127.0.0.1:3107",
          Cookie: "dds_session=" + session.value,
        },
        reconnection: false,
      });
      extras.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
    }
    const second = await context.newPage();
    await second.goto("/yard");
    await expect(second.locator(".yard-alert")).toContainText(
      "Close an older tab or bot connection",
    );
    extras[0].disconnect();
    await expect(
      second.getByRole("button", { name: "Enter yard" }),
    ).toBeEnabled({ timeout: 10000 });
    await expect(second.locator(".yard-alert")).toHaveCount(0);
  } finally {
    for (const socket of extras) socket.disconnect();
    await context.close();
  }
});
