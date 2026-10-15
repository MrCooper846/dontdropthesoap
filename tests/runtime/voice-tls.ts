import {
  mkdtempSync,
  existsSync,
  readFileSync,
  chmodSync,
  unlinkSync,
  rmdirSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
export function prepareVoiceTls() {
  let directory = process.env.SOAP_VOICE_TEST_TLS_DIR;
  if (!directory) {
    directory = mkdtempSync(path.join(tmpdir(), "soap-voice-tls-"));
    chmodSync(directory, 0o700);
    process.env.SOAP_VOICE_TEST_TLS_DIR = directory;
    process.once("exit", () => cleanupVoiceTls());
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=soap-voice-fixture",
        "-addext",
        "subjectAltName=IP:127.0.0.1,DNS:localhost",
        "-keyout",
        path.join(directory, "key.pem"),
        "-out",
        path.join(directory, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    for (const name of ["key.pem", "cert.pem"])
      chmodSync(path.join(directory, name), 0o600);
    process.env.SOAP_VOICE_TEST_TLS_DIR = directory;
  }
  if (
    !realpathSync(directory).startsWith(
      path.join(realpathSync(tmpdir()), "soap-voice-tls-"),
    )
  )
    throw Error("Unexpected voice TLS fixture");
  return directory;
}
export function voiceTlsOptions() {
  return { ca: readFileSync(path.join(prepareVoiceTls(), "cert.pem"), "utf8") };
}
export function cleanupVoiceTls() {
  const directory = process.env.SOAP_VOICE_TEST_TLS_DIR;
  if (!directory || !existsSync(directory)) return;
  if (
    !realpathSync(directory).startsWith(
      path.join(realpathSync(tmpdir()), "soap-voice-tls-"),
    )
  )
    throw Error("Unexpected voice TLS cleanup target");
  for (const name of ["key.pem", "cert.pem"])
    if (existsSync(path.join(directory, name)))
      unlinkSync(path.join(directory, name));
  rmdirSync(directory);
  delete process.env.SOAP_VOICE_TEST_TLS_DIR;
}
