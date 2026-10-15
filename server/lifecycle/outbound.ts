import type { Server } from "socket.io";
import type { Socket } from "engine.io";
import type { Packet } from "engine.io-parser";
import { increment } from "../observability/metrics";
export const OUTBOUND_LIMITS = {
  packets: 128,
  bytes: 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
};
type State = { packets: number; bytes: number };
function packetBytes(packet: Packet) {
  const data = packet.data;
  if (typeof data === "string") return Buffer.byteLength(data) + 1;
  if (data instanceof ArrayBuffer) return data.byteLength + 1;
  if (ArrayBuffer.isView(data)) return data.byteLength + 1;
  // Protocol control packets have no payload.
  return 1;
}
// Observe public Engine.IO packetCreate/flush events instead of accessing its
// private write buffer. A flush transfers ownership to the transport; that
// transport's existing heartbeat bounds a peer that never drains/answers.
export function boundOutbound(io: Server, limits = OUTBOUND_LIMITS) {
  const peers = new Map<Socket, State>();
  let totalBytes = 0;
  const cleanups = new Map<Socket, () => void>();
  const attach = (socket: Socket) => {
    const state: State = { packets: 0, bytes: 0 };
    peers.set(socket, state);
    const drop = () => {
      increment("connection.backpressure");
      socket.close(true);
    };
    const packet = (value: Packet) => {
      const bytes = packetBytes(value);
      state.packets++;
      state.bytes += bytes;
      totalBytes += bytes;
      if (state.packets > limits.packets || state.bytes > limits.bytes) drop();
      else if (totalBytes > limits.totalBytes) {
        let largest = socket;
        for (const [peer, queued] of peers)
          if (queued.bytes > (peers.get(largest)?.bytes ?? 0)) largest = peer;
        increment("connection.backpressure");
        largest.close(true);
      }
    };
    const flush = () => {
      totalBytes -= state.bytes;
      state.bytes = 0;
      state.packets = 0;
    };
    const cleanup = () => {
      socket.off("packetCreate", packet);
      socket.off("flush", flush);
      socket.off("close", cleanup);
      flush();
      peers.delete(socket);
      cleanups.delete(socket);
    };
    socket.on("packetCreate", packet);
    socket.on("flush", flush);
    socket.once("close", cleanup);
    cleanups.set(socket, cleanup);
  };
  io.engine.on("connection", attach);
  return () => {
    io.engine.off("connection", attach);
    for (const cleanup of cleanups.values()) cleanup();
  };
}
