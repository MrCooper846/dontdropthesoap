import type { Server } from "node:http";
import type { Socket } from "node:net";
import { increment } from "../observability/metrics";
export function limitConnections(
  server: Server,
  total: number,
  perAddress: number,
  headerMs: number,
) {
  const peers = new Set<Socket>(),
    addresses = new Map<string, number>(),
    headers = new Map<Socket, ReturnType<typeof setTimeout>>();
  function clearHeader(socket: Socket) {
    const timer = headers.get(socket);
    if (timer) clearTimeout(timer);
    headers.delete(socket);
  }
  server.prependListener("connection", (socket: Socket) => {
    const address = socket.remoteAddress ?? "unknown",
      count = addresses.get(address) ?? 0;
    if (peers.size >= total || count >= perAddress) {
      increment("connection.rejected");
      socket.destroy();
      return;
    }
    peers.add(socket);
    addresses.set(address, count + 1);
    const timer = setTimeout(() => socket.destroy(), headerMs);
    timer.unref();
    headers.set(socket, timer);
    socket.once("close", () => {
      clearHeader(socket);
      peers.delete(socket);
      const left = addresses.get(address)! - 1;
      if (left) addresses.set(address, left);
      else addresses.delete(address);
    });
  });
  server.prependListener("request", (req) => clearHeader(req.socket));
  server.prependListener("upgrade", (req) => clearHeader(req.socket));
  return {
    get current() {
      return peers.size;
    },
    get addressCount() {
      return addresses.size;
    },
  };
}
