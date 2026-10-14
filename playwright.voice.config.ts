import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/voice",
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
    command:
      "FEATURE_VOICE=true FEATURE_YARD=true VOICE_MIN_PORT=19300 VOICE_MAX_PORT=19427 PORT=3107 PUBLIC_ORIGIN=http://127.0.0.1:3107 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser npm run dev",
    url: "http://127.0.0.1:3107/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
