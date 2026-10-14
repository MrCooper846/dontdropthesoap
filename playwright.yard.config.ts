import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/yard",
  workers: 1,
  timeout: 180000,
  use: {
    baseURL: "http://127.0.0.1:3104",
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command:
      "FEATURE_YARD=true PORT=3104 PUBLIC_ORIGIN=http://127.0.0.1:3104 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser npm run dev",
    url: "http://127.0.0.1:3104/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
