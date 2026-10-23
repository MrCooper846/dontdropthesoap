import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { pool, migrate } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import { api } from "../../server/http";
import { config } from "../../server/config";

if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Restaurant HTTP fixtures require soap_test");
beforeAll(migrate);
afterAll(() => pool.end());

it("guards restaurant commands with CSRF, ownership, controller epochs and replay receipts", async () => {
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
  if (!address || typeof address === "string") throw Error("Missing HTTP port");
  const base = "http://127.0.0.1:" + address.port + "/api/v1";
  async function identity(name: string) {
    const guest = await createGuest(name);
    const cookie = "dds_session=" + guest.secret;
    const session = await (
      await fetch(base + "/session", { headers: { cookie } })
    ).json();
    return {
      cookie,
      csrf: session.csrfToken as string,
      epoch: session.controllerEpoch as number,
    };
  }
  type Identity = Awaited<ReturnType<typeof identity>>;
  async function send(
    who: Identity,
    path: string,
    body: unknown,
    extra: Record<string, string> = {},
  ) {
    await delay(130);
    return fetch(base + path, {
      method: "POST",
      headers: {
        cookie: who.cookie,
        origin: config.PUBLIC_ORIGIN,
        "content-type": "application/json",
        "x-csrf-token": who.csrf,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  }
  async function envelope(who: Identity, payload: unknown) {
    const result = await send(who, "/command-keys", {});
    expect(result.status).toBe(201);
    return {
      commandId: randomUUID(),
      key: (await result.json()).key as string,
      controllerEpoch: who.epoch,
      payload,
    };
  }
  try {
    const host = await identity("Restaurant HTTP host");
    const stranger = await identity("Restaurant HTTP outsider");
    expect((await fetch(base + "/restaurant")).status).toBe(401);
    const create = await envelope(host, { durationSeconds: 120 });
    expect(
      (await send(host, "/restaurant", create, { "x-csrf-token": "" })).status,
    ).toBe(403);
    expect(
      (
        await send(host, "/restaurant", create, {
          origin: "https://invalid.example",
        })
      ).status,
    ).toBe(403);
    const createdResponse = await send(host, "/restaurant", create);
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    const shiftId = created.shift.id as string;
    expect(created.shift.phase).toBe("waiting");
    const replay = await send(host, "/restaurant", create);
    expect(replay.status).toBe(201);
    expect((await replay.json()).shift.id).toBe(shiftId);
    const changed = await send(host, "/restaurant", {
      ...create,
      payload: { durationSeconds: 300 },
    });
    expect(changed.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await changed.json())).toContain("COMMAND_ID_REUSED");
    const consumed = await send(host, "/restaurant", {
      ...create,
      commandId: randomUUID(),
    });
    expect(consumed.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await consumed.json())).toContain("KEY_EXPIRED");
    const stale = await send(host, "/restaurant/" + shiftId + "/commands", {
      ...(await envelope(host, { type: "ready", ready: true })),
      controllerEpoch: host.epoch + 1,
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await stale.json())).toContain("CONTROLLER_STALE");
    const outsider = await (
      await fetch(base + "/restaurant/" + shiftId, {
        headers: { cookie: stranger.cookie },
      })
    ).json();
    expect(outsider.shift.me).toBeNull();
    expect(outsider.shift.receipts).toBeNull();
    expect(
      outsider.shift.crew.every(
        (c: Record<string, unknown>) =>
          !("pouch" in c) && !("stolen" in c) && !("task" in c),
      ),
    ).toBe(true);
    const forbidden = await send(
      stranger,
      "/restaurant/" + shiftId + "/commands",
      await envelope(stranger, { type: "start" }),
    );
    expect(forbidden.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await forbidden.json())).toContain(
      "NOT_PARTICIPATING",
    );
    const join = await send(
      stranger,
      "/restaurant/" + shiftId + "/commands",
      await envelope(stranger, { type: "join" }),
    );
    expect(join.status).toBe(200);
    const nonHost = await send(
      stranger,
      "/restaurant/" + shiftId + "/commands",
      await envelope(stranger, { type: "start" }),
    );
    expect(nonHost.status).toBe(403);
    expect(JSON.stringify(await nonHost.json())).toContain("FORBIDDEN");
    const detail = await fetch(base + "/restaurant/" + shiftId, {
      headers: { cookie: host.cookie },
    });
    expect(detail.status).toBe(200);
    expect(detail.headers.get("cache-control")).toContain("no-store");
    expect((await detail.json()).shift.phase).toBe("waiting");
    const malformed = await send(
      host,
      "/restaurant/" + shiftId + "/commands",
      await envelope(host, { type: "role", role: "accountant" }),
    );
    expect(malformed.status).toBe(400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 30000);
