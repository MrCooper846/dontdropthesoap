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
    SHUTDOWN_GRACE_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(30000),
    MAX_YARD_PLAYERS: z.coerce.number().int().min(2).max(64).default(32),
    MAX_ACTIVE_LEAGUE_FIXTURES: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4),
    MAX_ACTIVE_MATCHES: z.coerce.number().int().min(1).max(16).default(4),
    FEATURE_YARD: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    FEATURE_EXTERNAL_BOTS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    FEATURE_VISUAL_BOTS: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    FEATURE_VOICE: flag,
    FEATURE_LEAGUE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    VOICE_LISTEN_IP: z.string().default("127.0.0.1"),
    VOICE_ANNOUNCED_ADDRESS: z.string().min(1).optional(),
    VOICE_MIN_PORT: z.coerce.number().int().min(1024).max(65535).default(18000),
    VOICE_MAX_PORT: z.coerce.number().int().min(1024).max(65535).default(18127),
  });
  const c = schema.parse(env);
  if (c.NODE_ENV === "production") {
    if (!c.PUBLIC_ORIGIN.startsWith("https://"))
      throw new Error("PUBLIC_ORIGIN must use HTTPS in production");
    for (const s of [c.SESSION_SECRET_PEPPER, c.COMMAND_KEY_SIGNING_SECRET])
      if (s.startsWith("local-development"))
        throw new Error("Configure unique production secrets");
  }
  if (c.VOICE_MIN_PORT > c.VOICE_MAX_PORT)
    throw new Error("Invalid media port range");
  if (c.FEATURE_VOICE && !c.FEATURE_YARD)
    throw new Error("Voice requires yard");
  if (
    c.FEATURE_VOICE &&
    c.NODE_ENV === "production" &&
    !c.VOICE_ANNOUNCED_ADDRESS
  )
    throw new Error("Voice requires an announced media address in production");
  return c;
}
export const config = readConfig();
