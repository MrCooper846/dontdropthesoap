import { defineConfig } from "@playwright/test";
import voice from "./playwright.voice.config";
export default defineConfig({
  ...voice,
  testDir: "tests/browser",
  testMatch: ["visual/*.spec.ts", "security/*.spec.ts"],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  globalSetup: "./tests/browser/security/setup.ts",
  timeout: 180000,
  use: { ...voice.use, viewport: { width: 1440, height: 1000 } },
});
