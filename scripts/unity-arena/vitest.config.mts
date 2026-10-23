import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["scripts/unity-arena/*.test.ts"], testTimeout: 15000 },
});
