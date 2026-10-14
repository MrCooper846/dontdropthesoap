import "dotenv/config";
import { z } from "zod";
const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");
export function readConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    PUBLIC_ORIGIN: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z
      .string()
      .url()
      .default("postgresql://soap:soap_local_only@localhost:55432/soap"),
    SESSION_SECRET_PEPPER: z
      .string()
      .min(32)
      .default("local-development-pepper-change-before-deploying"),
    COMMAND_KEY_SIGNING_SECRET: z
      .string()
      .min(32)
      .default("local-development-signing-change-before-deploying"),
    MAX_YARD_PLAYERS: z.coerce.number().int().min(2).max(64).default(32),
    MAX_ACTIVE_MATCHES: z.coerce.number().int().min(1).max(16).default(4),
    FEATURE_YARD: flag,
    FEATURE_EXTERNAL_BOTS: flag,
    FEATURE_VOICE: flag,
    FEATURE_LEAGUE: flag,
    LIVEKIT_URL: z.string().url().optional(),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
  });
  const c = schema.parse(env);
  if (c.NODE_ENV === "production") {
    if (!c.PUBLIC_ORIGIN.startsWith("https://"))
      throw new Error("PUBLIC_ORIGIN must use HTTPS in production");
    for (const s of [c.SESSION_SECRET_PEPPER, c.COMMAND_KEY_SIGNING_SECRET])
      if (s.startsWith("local-development"))
        throw new Error("Configure unique production secrets");
  }
  if (
    c.FEATURE_VOICE &&
    (!c.LIVEKIT_URL || !c.LIVEKIT_API_KEY || !c.LIVEKIT_API_SECRET)
  )
    throw new Error("Voice requires configured media credentials");
  return c;
}
export const config = readConfig();
