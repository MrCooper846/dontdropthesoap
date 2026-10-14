import { defineConfig } from "@playwright/test";
import { networkInterfaces } from "node:os";
const mediaAddress =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address ?? "127.0.0.1";
export default defineConfig({
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
    baseURL: "http://127.0.0.1:3107",
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
      "FEATURE_VOICE=true FEATURE_YARD=true VOICE_MIN_PORT=19300 VOICE_MAX_PORT=19427 PORT=3107 PUBLIC_ORIGIN=http://127.0.0.1:3107 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser npm run dev",
    url: "http://127.0.0.1:3107/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
