import { execFileSync } from "node:child_process";
const action = process.argv[2];
if (action === "start") {
  try {
    execFileSync(
      "systemctl",
      ["--user", "is-active", "--quiet", "soap-arena-overseer"],
      { stdio: "ignore" },
    );
    console.log("Overseer already running");
  } catch {
    execFileSync(
      "systemd-run",
      [
        "--user",
        "--unit=soap-arena-overseer",
        "--collect",
        "--property=WorkingDirectory=" + process.cwd(),
        "--property=Restart=on-failure",
        "--property=RestartSec=3",
        process.execPath,
        "--import",
        "tsx",
        "scripts/arena/main.ts",
        "serve",
      ],
      { stdio: "inherit" },
    );
  }
} else if (action === "stop")
  execFileSync("systemctl", ["--user", "stop", "soap-arena-overseer"], {
    stdio: "inherit",
  });
else throw Error("Use start or stop");
