import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import { createBatch } from "../../server/league/service";
import { api } from "../../server/http";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("League HTTP fixture requires soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
it("serves the specified public league-batches route with identical bounded batch reads and cursor validation", async () => {
  const guest = await createGuest("Public batch owner");
  const req = {
    headers: { cookie: "dds_session=" + guest.secret },
  } as IncomingMessage;
  const batch = await transaction((db) =>
    createBatch(req, { name: "Public route fixture" }, db),
  );
  const server = createServer((request, response) => {
    void api(
      request,
      response,
      () => true,
      () => {},
    ).catch(() => response.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const base = "http://127.0.0.1:" + address.port + "/api/v1";
  try {
    const canonical = await fetch(base + "/leagues/" + batch.id);
    const specified = await fetch(base + "/league-batches/" + batch.id);
    expect(canonical.status).toBe(200);
    expect(specified.status).toBe(200);
    expect(await specified.json()).toEqual(await canonical.json());
    expect(specified.headers.get("cache-control")).toContain("no-store");
    expect(
      (await fetch(base + "/league-batches/" + batch.id + "?after=121")).status,
    ).toBe(400);
    expect((await fetch(base + "/league-batches/" + randomUUID())).status).toBe(
      404,
    );
    expect((await fetch(base + "/league-batches/not-a-uuid")).status).toBe(400);
  } finally {
    try {
      await pool.query(
        "UPDATE league_batches SET state='cancelled' WHERE id=$1 AND state='registration'",
        [batch.id],
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});
