import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { existsSync, writeFileSync, chmodSync } from "node:fs";
const address = process.argv[2] ?? "";
const octets = address.split(".").map(Number);
if (
  isIP(address) !== 4 ||
  !(
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
) {
  console.error(
    "Provide this laptop's private Wi-Fi IPv4 address, for example npm run prepare:playtest -- 192.168.1.104",
  );
  process.exitCode = 1;
} else if (existsSync(".env.playtest")) {
  console.log(
    "Existing .env.playtest preserved. Confirm SOAP_PLAYTEST_ADDRESS matches the laptop Wi-Fi address before starting.",
  );
} else {
  const secret = () => randomBytes(32).toString("hex");
  writeFileSync(
    ".env.playtest",
    [
      "SOAP_PLAYTEST_ADDRESS=" + address,
      "PLAYTEST_DATABASE_PASSWORD=" + secret(),
      "PLAYTEST_SESSION_PEPPER=" + secret(),
      "PLAYTEST_COMMAND_SECRET=" + secret(),
      "",
    ].join("\n"),
    { flag: "wx", mode: 0o600 },
  );
  chmodSync(".env.playtest", 0o600);
  console.log(
    "Private laptop playtest configuration created. Start with npm run playtest:up.",
  );
}
