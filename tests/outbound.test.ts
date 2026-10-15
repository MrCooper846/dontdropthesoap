import { it, expect } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket as ServerSocket } from "socket.io";
import { io as connect } from "socket.io-client";
import { boundOutbound } from "../server/lifecycle/outbound";
async function fixture(limits: {
  packets: number;
  bytes: number;
  totalBytes: number;
}) {
  const http = createServer();
  const io = new Server(http);
  const stop = boundOutbound(io, limits);
  const slow: ServerSocket[] = [];
  io.on("connection", (socket) => {
    if (socket.handshake.auth.kind === "slow") slow.push(socket);
    socket.on("check", (ack: (value: string) => void) => ack("ok"));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + (http.address() as AddressInfo).port;
  const healthy = connect(origin, {
    transports: ["websocket"],
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    healthy.once("connect", resolve);
    healthy.once("connect_error", reject);
  });
  async function nonReader() {
    const response = await fetch(
      origin + "/socket.io/?EIO=4&transport=polling",
    );
    const open = await response.text();
    const id = JSON.parse(open.slice(1)).sid as string;
    const index = slow.length;
    const posted = await fetch(
      origin + "/socket.io/?EIO=4&transport=polling&sid=" + id,
      {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: '40{"kind":"slow"}',
      },
    );
    expect(posted.ok).toBe(true);
    await expect.poll(() => slow.length).toBe(index + 1);
    return { socket: slow[index], id };
  }
  async function alive() {
    const reply = await healthy.timeout(2000).emitWithAck("check");
    expect(reply).toBe("ok");
  }
  return {
    origin,
    nonReader,
    alive,
    close: async () => {
      healthy.disconnect();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      stop();
    },
  };
}
it("closes a real polling nonreader at the queued-byte limit, releases its accounting and keeps another connection usable", async () => {
  const f = await fixture({ packets: 128, bytes: 4096, totalBytes: 16384 });
  try {
    const slow = await f.nonReader();
    const closed = new Promise<void>((resolve) =>
      slow.socket.conn.once("close", () => resolve()),
    );
    slow.socket.emit("bulk", "x".repeat(4096));
    await closed;
    expect(slow.socket.connected).toBe(false);
    const refused = await fetch(
      f.origin + "/socket.io/?EIO=4&transport=polling&sid=" + slow.id,
    );
    expect(refused.status).toBe(400);
    await f.alive();
    const next = await f.nonReader();
    next.socket.emit("small", "x".repeat(100));
    expect(next.socket.connected).toBe(true);
  } finally {
    await f.close();
  }
});
it("caps many small reliable packets and subtracts flushed polling payloads", async () => {
  const f = await fixture({ packets: 3, bytes: 8192, totalBytes: 16384 });
  try {
    const slow = await f.nonReader();
    slow.socket.emit("first", "x".repeat(2000));
    const flushed = await fetch(
      f.origin + "/socket.io/?EIO=4&transport=polling&sid=" + slow.id,
    );
    expect(flushed.ok).toBe(true);
    await flushed.text();
    slow.socket.emit("second", "x".repeat(2000));
    expect(slow.socket.connected).toBe(true);
    const closed = new Promise<void>((resolve) =>
      slow.socket.conn.once("close", () => resolve()),
    );
    for (let i = 0; i < 3; i++) slow.socket.emit("tiny", i);
    await closed;
    await f.alive();
  } finally {
    await f.close();
  }
});
it("enforces the aggregate reliable-byte ceiling across peers without closing a healthy reader", async () => {
  const f = await fixture({ packets: 128, bytes: 8192, totalBytes: 6000 });
  try {
    const a = await f.nonReader(),
      b = await f.nonReader();
    const closed = Promise.race(
      [a, b].map(
        (peer) =>
          new Promise<void>((resolve) =>
            peer.socket.conn.once("close", () => resolve()),
          ),
      ),
    );
    a.socket.emit("bulk", "x".repeat(3500));
    b.socket.emit("bulk", "x".repeat(3500));
    await closed;
    expect([a, b].filter((peer) => peer.socket.connected)).toHaveLength(1);
    await f.alive();
  } finally {
    await f.close();
  }
});
