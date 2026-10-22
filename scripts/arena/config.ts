import { config as dotenv } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
export const origin = "https://127.0.0.1:3445";
export const dashboard = "http://127.0.0.1:3146";
export const evidenceRoot = "data/arena";
export function prepare() {
  mkdirSync(evidenceRoot, { recursive: true });
  const secret = () => randomBytes(32).toString("hex");
  try {
    writeFileSync(
      ".env.arena",
      [
        `ARENA_DB_PASSWORD=${secret()}`,
        `ARENA_SESSION_PEPPER=${secret()}`,
        `ARENA_COMMAND_SECRET=${secret()}`,
        `ARENA_OVERSEER_TOKEN=${secret()}`,
        "",
      ].join("\n"),
      { flag: "wx", mode: 0o600 },
    );
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  console.log(
    "Arena configuration ready; existing secrets and data preserved.",
  );
}
export function settings() {
  // Read only the arena file: inherited production DATABASE_URL is never used.
  const env = dotenv({
    path: ".env.arena",
    quiet: true,
    processEnv: {},
  }).parsed;
  if (
    !env ||
    !/^[a-f0-9]{64}$/.test(env.ARENA_DB_PASSWORD ?? "") ||
    !/^[a-f0-9]{64}$/.test(env.ARENA_OVERSEER_TOKEN ?? "")
  )
    throw new Error("Run npm run arena:prepare first");
  return {
    database: `postgresql://soap:${env.ARENA_DB_PASSWORD}@127.0.0.1:55435/soap_arena`,
    token: env.ARENA_OVERSEER_TOKEN,
  };
}
export function source() {
  try {
    return readFileSync(".git/HEAD", "utf8").trim();
  } catch {
    return "unknown";
  }
}
