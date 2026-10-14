import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import os from "node:os";
async function run() {
  const requested = process.argv[2] ?? "26d38b3";
  assert.match(requested, /^[a-f0-9]{7,40}$/);
  const revision = execFileSync("git", ["rev-parse", requested + "^{commit}"], {
    encoding: "utf8",
  }).trim();
  execFileSync("git", ["merge-base", "--is-ancestor", revision, "HEAD"], {
    stdio: "pipe",
  });
  assert.notEqual(
    revision,
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  const modes = execFileSync(
    "git",
    ["ls-tree", "-rz", "--full-tree", revision],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const entry of modes)
    assert.match(
      entry,
      /^100(?:644|755) blob /,
      "Review symlinks/submodules before packaging a rollback",
    );
  // The drill intentionally accepts only /tmp packages on this Ubuntu host.
  const directory = path.join(
    "/tmp",
    "soap-rollback-" + randomUUID().replaceAll("-", ""),
  );
  assert.equal(os.platform(), "linux", "Prepare rollback packages in Ubuntu");
  mkdirSync(directory, { mode: 0o700 });
  const archive = directory + ".source.tar";
  execFileSync("git", [
    "archive",
    "--format=tar",
    "--output=" + archive,
    revision,
  ]);
  execFileSync("tar", [
    "--extract",
    "--file",
    archive,
    "--directory",
    directory,
    "--no-same-owner",
  ]);
  unlinkSync(archive);
  writeFileSync(path.join(directory, "release-revision.txt"), revision + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  for (const args of [["ci"], ["run", "build"], ["ci", "--omit=dev"]]) {
    const child = spawn("npm", args, {
      cwd: directory,
      env: {
        ...process.env,
        NODE_ENV:
          args[0] === "run" || args.includes("--omit=dev")
            ? "production"
            : "development",
      },
      stdio: "inherit",
    });
    assert.equal(
      await new Promise((resolve) => {
        child.once("error", () => resolve(-1));
        child.once("exit", resolve);
      }),
      0,
      "Rollback package command failed",
    );
  }
  console.log(
    JSON.stringify({
      rollbackPackage: directory,
      revision,
      cleanInstallAndBuild: "PASS",
      productionOnlyInstall: "PASS",
    }),
  );
}
run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
