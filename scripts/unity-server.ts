import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const action = process.argv[2];
const unit = "soap-unity-restaurant";
if (action === "prepare") {
  const password = randomBytes(32).toString("hex");
  try {
    writeFileSync(
      ".env.unity",
      `UNITY_DB_PASSWORD=${password}\nUNITY_DATABASE_URL=postgresql://soap:${password}@127.0.0.1:55436/soap_unity_restaurant\nUNITY_RESTAURANT_PORT=3157\n`,
      { flag: "wx", mode: 0o600 },
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  mkdirSync("data/unity-arena", { recursive: true });
  console.log(
    "Unity local configuration ready; existing credentials/data preserved.",
  );
} else if (action === "start") {
  try {
    execFileSync("systemctl", ["--user", "is-active", "--quiet", unit], {
      stdio: "ignore",
    });
  } catch {
    execFileSync(
      "systemd-run",
      [
        "--user",
        "--unit=" + unit,
        "--collect",
        "--property=WorkingDirectory=" + process.cwd(),
        "--property=Restart=on-failure",
        "--property=RestartSec=3",
        "--property=TimeoutStopSec=10s",
        process.execPath,
        "--import",
        "tsx",
        "server/unity-restaurant/main.ts",
      ],
      { stdio: "inherit" },
    );
  }
  console.log("Unity restaurant service started on http://127.0.0.1:3157.");
} else if (action === "stop")
  execFileSync("systemctl", ["--user", "stop", unit], { stdio: "inherit" });
else if (action === "status") {
  execFileSync("systemctl", ["--user", "status", unit, "--no-pager"], {
    stdio: "inherit",
  });
} else throw new Error("Use prepare, start, stop or status");
