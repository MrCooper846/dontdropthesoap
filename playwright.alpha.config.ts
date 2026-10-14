import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser/alpha",
  workers: 1,
  timeout: 120000,
  use: { baseURL: "http://127.0.0.1:3101", headless: true },
  webServer: {
    command:
      "PORT=3101 PUBLIC_ORIGIN=http://127.0.0.1:3101 DATABASE_URL=postgresql://soap:soap_local_only@localhost:55432/soap_browser npm run dev",
    url: "http://127.0.0.1:3101/health/ready",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
