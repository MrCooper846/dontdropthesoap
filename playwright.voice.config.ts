import { prepareVoiceTls } from "./tests/runtime/voice-tls";
prepareVoiceTls();
import { defineConfig } from "@playwright/test";
import { networkInterfaces } from "node:os";
const mediaAddress =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address ?? "127.0.0.1";
export default defineConfig({
  globalTeardown: "./tests/runtime/voice-tls-teardown.ts",
  testDir: "tests/browser/voice",
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    {
      name: "firefox",
      testMatch: "privacy.spec.ts",
      use: {
        browserName: "firefox",
        launchOptions: {
          args: [],
          firefoxUserPrefs: {
            "media.autoplay.default": 0,
            "media.autoplay.blocking_policy": 0,
          },
        },
      },
    },
    {
      name: "webkit",
      testMatch: "privacy.spec.ts",
      use: { browserName: "webkit", launchOptions: { args: [] } },
    },
  ],
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "https://127.0.0.1:3107",
    ignoreHTTPSErrors: true,
    headless: true,
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: {
    env: { VOICE_LISTEN_IP: mediaAddress },
    command:
      "VOICE_MIN_PORT=19300 VOICE_MAX_PORT=19427 node --import tsx tests/runtime/voice-server.ts",
    url: "https://127.0.0.1:3107/health/ready",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
