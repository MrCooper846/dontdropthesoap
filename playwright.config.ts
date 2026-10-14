import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testIgnore: "**/alpha/**",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: { baseURL: "http://127.0.0.1:3100", headless: true },
  webServer: {
    command: "PORT=3100 PUBLIC_ORIGIN=http://127.0.0.1:3100 npm run dev:legacy",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
