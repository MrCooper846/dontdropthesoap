import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
const local = parse(readFileSync(".env.unity", "utf8"));
if (!local.UNITY_DATABASE_URL) throw new Error("Prepare .env.unity first");
execFileSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/unity-restaurant-http.test.ts",
    "tests/unity-restaurant-shutdown.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, UNITY_TEST_DATABASE_URL: local.UNITY_DATABASE_URL },
  },
);
