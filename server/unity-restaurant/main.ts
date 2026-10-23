import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
import { z } from "zod";
import { RuleError } from "../../domain/restaurant/model";
import { UNITY_MAP } from "../../shared/unity-restaurant/map";
import { NativeRestaurantService } from "./service";
async function body(req: IncomingMessage) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 16384) throw new RuleError("BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(data);
  } catch {
    throw new RuleError("INVALID_JSON");
  }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function nativeHandler(
  service: NativeRestaurantService,
  accepting: () => boolean = () => true,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!accepting()) {
        send(res, 503, {
          protocolVersion: 1,
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Native restaurant is restarting. Retry shortly.",
          },
        });
        return;
      }
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname,
        method = req.method,
        token =
          req.headers.authorization?.match(
            /^Bearer ([A-Za-z0-9_-]{32,200})$/,
          )?.[1] ?? "";
      if (path === "/health" && method === "GET") {
        send(res, 200, { ok: true, protocolVersion: 1 });
        return;
      }
      if (path === "/map" && method === "GET") {
        send(res, 200, UNITY_MAP);
        return;
      }
      if (path === "/session" && method === "POST") {
        send(res, 200, await service.session(await body(req)));
        return;
      }
      if (path === "/lobbies" && method === "GET") {
        send(res, 200, await service.lobbies(token));
        return;
      }
      if (path === "/shifts" && method === "POST") {
        send(res, 201, await service.create(token, await body(req)));
        return;
      }
      const route = path.match(/^\/shifts\/([^/]+)(?:\/(commands|input))?$/);
      if (!route) throw new RuleError("NOT_FOUND");
      if (method === "GET" && !route[2]) {
        send(res, 200, await service.get(token, route[1]));
        return;
      }
      if (method === "POST" && route[2] === "commands") {
        send(res, 200, await service.command(token, route[1], await body(req)));
        return;
      }
      if (method === "POST" && route[2] === "input") {
        send(res, 200, await service.input(token, route[1], await body(req)));
        return;
      }
      throw new RuleError("NOT_FOUND");
    } catch (e) {
      const code =
          e instanceof z.ZodError
            ? "INVALID_INPUT"
            : e instanceof RuleError
              ? e.code
              : "SERVICE_UNAVAILABLE",
        status =
          code === "UNAUTHENTICATED"
            ? 401
            : code === "NOT_FOUND"
              ? 404
              : ["INVALID_INPUT", "INVALID_JSON", "BODY_TOO_LARGE"].includes(
                    code,
                  )
                ? 400
                : code === "SERVICE_UNAVAILABLE"
                  ? 503
                  : 409;
      send(res, status, {
        protocolVersion: 1,
        error: {
          code,
          message:
            code === "SERVICE_UNAVAILABLE"
              ? "Local restaurant service unavailable. Retry shortly."
              : code.replaceAll("_", " ").toLowerCase(),
        },
      });
    }
  };
}
export async function closeNativeListener(
  server: Server,
  finish: () => Promise<void>,
  graceMs = 1000,
): Promise<void> {
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  const timer = setTimeout(() => server.closeAllConnections(), graceMs);
  timer.unref();
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
  await finish();
}
export async function startNativeRestaurant() {
  const local = parse(await readFile(resolve(".env.unity"), "utf8"));
  const url = local.UNITY_DATABASE_URL;
  if (!url)
    throw new Error(
      "Missing dedicated native restaurant database configuration.",
    );
  const port = Number(local.UNITY_RESTAURANT_PORT ?? 3157);
  if (port !== 3157)
    throw new Error("Native restaurant requires local port3157.");
  const service = new NativeRestaurantService(url);
  await service.initialise();
  let accepting = true;
  let closePromise: Promise<void> | null = null;
  const server = createServer(nativeHandler(service, () => accepting));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void service
      .tick()
      .catch(() => console.error("Native restaurant tick failed; will retry."))
      .finally(() => (ticking = false));
  }, 100);
  await new Promise<void>((ok, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", ok);
  });
  console.log("Native restaurant listening on 127.0.0.1:3157");
  return {
    server,
    service,
    close: () => {
      if (closePromise) return closePromise;
      accepting = false;
      clearInterval(timer);
      closePromise = closeNativeListener(server, () => service.close());
      return closePromise;
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void startNativeRestaurant()
    .then((app) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.on(signal, () => void app.close().then(() => process.exit(0)));
    })
    .catch(() => {
      console.error(
        "Native restaurant startup failed. Check dedicated database configuration.",
      );
      process.exitCode = 1;
    });
}
