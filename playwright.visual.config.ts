import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/visual",
  globalSetup: "./tests/browser/visual/setup.ts",
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: "http://127.0.0.1:3108",
    headless: true,
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "FEATURE_VISUAL_BOTS=true FEATURE_YARD=true PORT=3108 PUBLIC_ORIGIN=http://127.0.0.1:3108 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_visual_browser npm run dev",
    url: "http://127.0.0.1:3108/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
