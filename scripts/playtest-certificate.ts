import { execFileSync } from "node:child_process";
import { mkdirSync, chmodSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
try {
  mkdirSync("data/playtest", { recursive: true, mode: 0o700 });
  execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.playtest",
      "-f",
      "deploy/laptop.compose.yml",
      "cp",
      "web:/data/caddy/pki/authorities/local/root.crt",
      "data/playtest/laptop-root.crt",
    ],
    { stdio: "pipe" },
  );
  chmodSync("data/playtest/laptop-root.crt", 0o644);
  const cert = new X509Certificate(
    readFileSync("data/playtest/laptop-root.crt"),
  );
  if (!cert.ca) throw Error("Not a certificate authority");
  console.log(
    JSON.stringify({
      publicCertificate: "data/playtest/laptop-root.crt",
      fingerprint256: cert.fingerprint256,
    }),
  );
} catch {
  console.error(
    "Public certificate export failed. Start the laptop stack and check its web service first.",
  );
  process.exitCode = 1;
}
