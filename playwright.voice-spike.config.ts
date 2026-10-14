import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/voice-spike",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:3106",
    headless: true,
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command:
      "FEATURE_YARD=false PORT=3106 PUBLIC_ORIGIN=http://127.0.0.1:3106 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_browser npm run dev",
    url: "http://127.0.0.1:3106/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
