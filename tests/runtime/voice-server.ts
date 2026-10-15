import { buildSync } from "esbuild";
import { createServer } from "node:https";
import { request } from "node:http";
import { connect } from "node:net";
import type { Duplex } from "node:stream";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { prepareVoiceTls } from "./voice-tls";
if (!existsSync(".next/BUILD_ID"))
  throw Error("Build before production voice browser tests");
const probe = buildSync({
  entryPoints: ["tests/runtime/voice-probe-entry.tsx"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  minify: true,
  logLevel: "silent",
}).outputFiles![0].text;
const tls = prepareVoiceTls(),
  peers = new Set<Duplex>();
const app = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3119",
    PUBLIC_ORIGIN: "https://127.0.0.1:3107",
    SESSION_SECRET_PEPPER: randomBytes(32).toString("hex"),
    COMMAND_KEY_SIGNING_SECRET: randomBytes(32).toString("hex"),
    VOICE_ANNOUNCED_ADDRESS: process.env.VOICE_LISTEN_IP ?? "127.0.0.1",
    FEATURE_VOICE: "true",
    FEATURE_YARD: "true",
    DATABASE_URL:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  },
  stdio: ["ignore", "inherit", "inherit"],
});
const proxy = createServer(
  {
    key: readFileSync(path.join(tls, "key.pem")),
    cert: readFileSync(path.join(tls, "cert.pem")),
  },
  (req, res) => {
    const route = req.url?.split("?")[0];
    if (route === "/lab/media") {
      res.writeHead(200, {
        "Content-Type": "text/html",
        "Cache-Control": "no-store",
      });
      res.end(
        '<!doctype html><html><body><div id="probe"></div><script src="/voice-probe.js"></script></body></html>',
      );
      return;
    }
    if (route === "/voice-probe.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      });
      res.end(probe);
      return;
    }
    const upstream = request(
      {
        host: "127.0.0.1",
        port: 3119,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, connection: "close" },
      },
      (response) => {
        res.writeHead(response.statusCode!, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502);
        res.end("Fixture upstream unavailable");
      } else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  },
);
proxy.on("connection", (socket) => {
  peers.add(socket);
  socket.once("close", () => peers.delete(socket));
});
proxy.on("upgrade", (req, socket, head) => {
  const upstream = connect(3119, "127.0.0.1", () => {
    const headers = req.rawHeaders.reduce<string[]>((lines, value, index) => {
      if (index % 2 === 0) lines.push(value + ": " + req.rawHeaders[index + 1]);
      return lines;
    }, []);
    upstream.write(
      req.method +
        " " +
        req.url +
        " HTTP/" +
        req.httpVersion +
        "\r\n" +
        headers.join("\r\n") +
        "\r\n\r\n",
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.once("close", () => upstream.destroy());
  upstream.once("close", () => socket.destroy());
});
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  proxy.close();
  for (const socket of peers) socket.destroy();
  if (app.exitCode === null) {
    app.kill("SIGTERM");
    const timer = setTimeout(() => app.kill("SIGKILL"), 35000);
    timer.unref();
  }
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
app.once("exit", (code) => {
  stop();
  process.exitCode = code ?? 1;
});
proxy.listen(3107, "127.0.0.1");
