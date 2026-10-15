import { it, expect, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { api } from "../server/http";
import { pool } from "../server/persistence/db";
it("an actual HTTP infrastructure failure returns and logs only fixed public diagnostics", async () => {
  const sentinel = "private-http-diagnostic-sentinel";
  const error = new Error("database error\n" + sentinel);
  error.name = sentinel;
  const query = vi.spyOn(pool, "query").mockRejectedValue(error);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const server = createServer((req, res) => {
    void api(
      req,
      res,
      () => true,
      () => {},
    ).catch(() => res.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw Error("Missing port");
    const response = await fetch(
      "http://127.0.0.1:" + address.port + "/api/v1/session",
      {
        headers: {
          cookie: "dds_session=" + "a".repeat(64),
          "x-request-id": sentinel,
        },
      },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(sentinel);
    expect(log).toHaveBeenCalledTimes(1);
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toEqual({
      event: "api.error",
      code: "SERVICE_UNAVAILABLE",
      requestId: response.headers.get("x-request-id"),
      latencyMs: expect.any(Number),
    });
    expect(record.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    query.mockRestore();
    log.mockRestore();
  }
});
