import { config as dotenv } from "dotenv";
import { resolve } from "node:path";

export function settings() {
  const file = process.env.UNITY_ARENA_ENV ?? ".env.unity";
  const privateEnv =
    dotenv({ path: file, quiet: true, processEnv: {} }).parsed ?? {};
  const read = (name: string) => process.env[name] ?? privateEnv[name];
  const database = read("UNITY_DATABASE_URL");
  const executable =
    read("UNITY_ARENA_EXECUTABLE") ??
    "D:/Unity/Projects/SoapMultiplayer/Build/SoapMultiplayer.exe";
  if (!database)
    throw Error("Set UNITY_DATABASE_URL in the private native arena env file");
  const server = read("UNITY_ARENA_SERVER") ?? "http://127.0.0.1:3157";
  const url = new URL(server);
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw Error("Native arena server must stay on this laptop");
  return {
    database,
    executable: executable ? resolve(executable) : "",
    server,
    profiles: resolve(
      read("UNITY_ARENA_PROFILES") ??
        "D:/Unity/Projects/SoapMultiplayer/TestEvidence/profiles",
    ),
    evidence: resolve(
      read("UNITY_ARENA_EVIDENCE") ??
        "D:/Unity/Projects/SoapMultiplayer/TestEvidence",
    ),
  };
}
