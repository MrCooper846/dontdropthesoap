import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request } from "node:https";
import { connect, isIP } from "node:net";
import { io, type Socket } from "socket.io-client";
const address = readFileSync(".env.playtest", "utf8")
  .split("\n")
  .find((line) => line.startsWith("SOAP_PLAYTEST_ADDRESS="))
  ?.split("=")[1];
assert.ok(address && isIP(address) === 4, "Missing laptop address");
const origin = "https://" + address + ":3443";
const ca = readFileSync("data/playtest/laptop-root.crt", "utf8");
let socket: Socket | undefined;
async function http(
  route: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  csrf = "",
) {
  return new Promise<{ status: number; body: string; cookie?: string }>(
    (resolve, reject) => {
      const req = request(
        origin + route,
        {
          method,
          ca,
          headers: {
            Origin: origin,
            Cookie: cookie,
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
            if (data.length > 4194304)
              req.destroy(Error("Response bound exceeded"));
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              body: data,
              cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
            }),
          );
          res.on("error", reject);
        },
      );
      req.setTimeout(10000, () => req.destroy(Error("HTTPS request timeout")));
      req.on("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    },
  );
}
async function main() {
  assert.equal((await http("/health/ready")).status, 200);
  assert.equal((await http("/yard")).status, 200);
  const guest = await http("/api/v1/session/guest", "POST", {
    name: "Laptop setup check",
  });
  assert.equal(guest.status, 201);
  assert.ok(guest.cookie);
  const session = JSON.parse(
    (await http("/api/v1/session", "GET", undefined, guest.cookie)).body,
  );
  const control = await http(
    "/api/v1/controller/acquire",
    "POST",
    {},
    guest.cookie,
    session.csrfToken,
  );
  assert.equal(control.status, 200);
  const { controllerEpoch } = JSON.parse(control.body);
  socket = io(origin + "/game-v1", {
    transports: ["websocket"],
    ca,
    reconnection: false,
    timeout: 10000,
    extraHeaders: { Origin: origin, Cookie: guest.cookie },
  });
  await new Promise<void>((resolve, reject) => {
    socket!.once("connect", resolve);
    socket!.once("connect_error", reject);
  });
  const rpc = async (event: string, input: unknown) => {
    const ack = await socket!.timeout(10000).emitWithAck(event, input);
    assert.equal(
      ack.ok,
      true,
      "Socket action rejected: " + (ack.error?.code ?? ""),
    );
    return ack.result;
  };
  await rpc("yard.enter", { controllerEpoch });
  await rpc("voice.command", { controllerEpoch, payload: { op: "join" } });
  const transport = await rpc("voice.command", {
    controllerEpoch,
    payload: { op: "transport", direction: "recv" },
  });
  assert.ok(transport.iceCandidates.length >= 2);
  assert.ok(
    transport.iceCandidates.every(
      (candidate: any) =>
        candidate.ip === address &&
        candidate.port >= 18000 &&
        candidate.port <= 18127,
    ),
  );
  const tcp = transport.iceCandidates.find(
    (candidate: any) => candidate.protocol === "tcp",
  );
  assert.ok(tcp);
  await new Promise<void>((resolve, reject) => {
    const connection = connect(tcp.port, address!, () => {
      connection.end();
      resolve();
    });
    connection.setTimeout(5000, () =>
      connection.destroy(Error("Media TCP connection timeout")),
    );
    connection.on("error", reject);
  });
  await rpc("voice.command", { controllerEpoch, payload: { op: "leave" } });
  console.log(
    JSON.stringify({
      origin,
      trustedHTTPS: "PASS",
      builtYard: "PASS",
      guestAndController: "PASS",
      proxiedWebSocket: "PASS",
      nativeVoiceTransport: "PASS",
      announcedLANAddress: "PASS",
      mediaTCPReachability: "PASS",
      physicalPhoneAudio: "NOT_TESTED",
      udpRTP: "NOT_TESTED",
    }),
  );
}
main()
  .catch(() => {
    console.error(
      "Laptop smoke failed; inspect readiness, certificate trust, origin and media configuration.",
    );
    process.exitCode = 1;
  })
  .finally(() => socket?.disconnect());
