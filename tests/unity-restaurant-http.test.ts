import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { NativeRestaurantService } from "../server/unity-restaurant/service";
import { nativeHandler } from "../server/unity-restaurant/main";
import { UNITY_MAP, blocked, zoneAt } from "../shared/unity-restaurant/map";
import type { NativeShift } from "../server/unity-restaurant/world";

// Opt-in isolated native database only. Random identities/rows remain as durable test evidence.
const url = process.env.UNITY_TEST_DATABASE_URL;
describe.skipIf(!url)("native HTTP + persistent transaction acceptance", () => {
  let service: NativeRestaurantService, server: Server, base: string;
  type User = { token: string; playerId: string; name: string };
  async function request(path: string, token?: string, data?: unknown) {
    const r = await fetch(base + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        ...(token ? { Authorization: "Bearer " + token } : {}),
        "Content-Type": "application/json",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return { status: r.status, body: (await r.json()) as any };
  }
  async function player(name: string): Promise<User> {
    return (
      await request("/session", undefined, {
        name: "native-test-" + name + "-" + randomUUID().slice(0, 8),
      })
    ).body;
  }
  async function create(p: User) {
    return (
      await request("/shifts", p.token, {
        commandId: randomUUID(),
        durationSeconds: 120,
      })
    ).body;
  }
  async function command(
    p: User,
    id: string,
    action: unknown,
    commandId = randomUUID(),
  ) {
    return request("/shifts/" + id + "/commands", p.token, {
      commandId,
      action,
    });
  }
  async function arrange(id: string, work: (e: NativeShift) => void) {
    await service.transaction(async (db) => {
      const e = await service.load(db, id);
      work(e);
      await service.save(db, e);
    });
  }
  function put(
    e: NativeShift,
    id: string,
    kind: string,
    table?: number,
    zone?: string,
  ) {
    const station = UNITY_MAP.stations.find(
      (s) => s.kind === kind && (table === undefined || s.table === table),
    )!;
    for (let x = station.x - 2; x <= station.x + 2; x += 0.2)
      for (let z = station.z - 2; z <= station.z + 2; z += 0.2) {
        if (
          blocked({ x, z }) ||
          Math.hypot(x - station.x, z - station.z) > station.radius ||
          (zone && zoneAt({ x, z }) !== zone)
        )
          continue;
        const a = e.world.players.find((a) => a.id === id)!;
        a.x = x;
        a.z = z;
        a.vx = a.vz = 0;
        e.state.crew.find((c) => c.id === id)!.zone = zoneAt(a);
        return;
      }
    throw Error("No station fixture");
  }
  beforeAll(async () => {
    service = new NativeRestaurantService(url!);
    await service.initialise();
    server = createServer(nativeHandler(service));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (service) await service.close();
  });
  it("authenticates hashed persistent sessions, resumes identity and rejects invalid tokens", async () => {
    const p = await player("identity"),
      resume = await request("/session", undefined, {
        name: "ignored rename",
        token: p.token,
      });
    expect(resume.status).toBe(200);
    expect(resume.body.playerId).toBe(p.playerId);
    expect(resume.body.name).toBe(p.name);
    expect(
      (
        await request("/session", undefined, {
          name: "bad",
          token: "x".repeat(43),
        })
      ).status,
    ).toBe(401);
    expect((await request("/lobbies")).status).toBe(401);
    const q = await service.pool.query(
      "SELECT token_hash FROM unity_restaurant_sessions WHERE player_id=$1",
      [p.playerId],
    );
    expect(q.rows[0].token_hash).not.toBe(p.token);
    expect(q.rows[0].token_hash).toHaveLength(64);
    const second = new NativeRestaurantService(url!);
    try {
      await second.transaction(async (db) =>
        expect((await second.authenticate(db, p.token)).id).toBe(p.playerId),
      );
    } finally {
      await second.close();
    }
  });
  it("replays one committed command exactly, conflicts on changed payload, preserves independent player ownership", async () => {
    const p = await player("idempotency"),
      id = randomUUID(),
      payload = { commandId: id, durationSeconds: 120 };
    const a = await request("/shifts", p.token, payload),
      b = await request("/shifts", p.token, payload);
    expect(a.status).toBe(201);
    expect(Number.isSafeInteger(a.body.shift.serverTime)).toBe(true);
    expect(Number.isSafeInteger(a.body.world.serverTime)).toBe(true);
    expect(b.body).toEqual(a.body);
    expect(
      (await request("/shifts", p.token, { ...payload, durationSeconds: 300 }))
        .status,
    ).toBe(409);
    const outsider = await player("outsider"),
      view = await request("/shifts/" + a.body.shift.id, outsider.token);
    expect(view.body.shift.me).toBeNull();
    expect(view.body.shift.receipts).toBeNull();
    expect(JSON.stringify(view.body)).not.toContain(p.token);
    expect(view.body.shift.crew[0]).not.toHaveProperty("pouch");
    expect(view.body.shift.crew[0]).not.toHaveProperty("stolen");
    expect(
      (
        await request("/shifts/" + a.body.shift.id + "/input", outsider.token, {
          seq: 1,
          x: 1,
          z: 0,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("/shifts/" + a.body.shift.id + "/input", p.token, {
          seq: 1,
          x: 999,
          z: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/shifts/" + a.body.shift.id + "/input", p.token, {
          seq: 1,
          x: 1,
          z: 0,
          playerId: outsider.playerId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/shifts/" + a.body.shift.id + "/input", p.token, {
          seq: 1,
          x: null,
          z: 0,
        })
      ).status,
    ).toBe(400);
    const accepted = await request(
      "/shifts/" + a.body.shift.id + "/input",
      p.token,
      { seq: 7, x: 0, z: 0 },
    );
    expect(
      accepted.body.world.players.find((x: any) => x.id === p.playerId)
        .inputSeq,
    ).toBe(7);
    const stale = await request(
      "/shifts/" + a.body.shift.id + "/input",
      p.token,
      { seq: 1, x: 1, z: 0 },
    );
    expect(
      stale.body.world.players.find((x: any) => x.id === p.playerId).inputSeq,
    ).toBe(7);
  });
  it("enforces physical gameplay and one simultaneous hatch owner; settles immutable wallet receipts exactly once", async () => {
    const crew = await Promise.all(
        ["chef", "waiter", "bar", "runner", "extra"].map(player),
      ),
      first = await create(crew[0]),
      id = first.shift.id;
    for (const p of crew.slice(1))
      expect((await command(p, id, { type: "join" })).status).toBe(200);
    for (const p of crew) await command(p, id, { type: "ready", ready: true });
    expect((await command(crew[0], id, { type: "start" })).status).toBe(200);
    const firstOrder = (await request("/shifts/" + id, crew[0].token)).body
      .shift.orders[0];
    expect(
      (
        await command(crew[0], id, {
          type: "begin",
          kind: "cook",
          orderId: firstOrder.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (await command(crew[0], id, { type: "move", zone: "office" })).status,
    ).toBe(400);
    expect(
      (await command(crew[0], id, { type: "steal", amount: 1 })).status,
    ).toBe(409);
    // Arrange physically valid prepared-order fixtures, then race real HTTP commands under DB locking.
    await arrange(id, (e) => {
      e.state.orders[0].foodReady = e.state.orders[0].drinkReady = true;
      e.state.stock -= 2;
      e.state.cleanPlates--;
      put(e, crew[1].playerId, "pickup", undefined, "dining");
      put(e, crew[4].playerId, "pickup", undefined, "dining");
    });
    const race = await Promise.all([
      command(crew[1], id, { type: "pickup", orderId: firstOrder.id }),
      command(crew[4], id, { type: "pickup", orderId: firstOrder.id }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const owner = crew[race[0].status === 200 ? 1 : 4];
    expect(
      (
        await command(owner, id, {
          type: "begin",
          kind: "serve",
          orderId: firstOrder.id,
        })
      ).status,
    ).toBe(409);
    await arrange(id, (e) => {
      e.state.revenue = 19;
      e.state.vault = 14;
      e.state.crew.find((c) => c.id === owner.playerId)!.pouch = 5;
      for (const c of e.state.crew) c.lastSeen = Date.now();
      e.state.endsAt = Date.now() - 1;
      e.state.stealEndsAt = e.state.endsAt - 15000;
    });
    const final = await request("/shifts/" + id, owner.token);
    expect(final.body.shift.phase).toBe("finished");
    expect(final.body.shift.receipts).toHaveLength(1);
    expect(final.body.wallet).toBeGreaterThanOrEqual(0);
    await Promise.all(crew.map((p) => request("/shifts/" + id, p.token)));
    const credits = await service.pool.query(
      "SELECT player_id,amount FROM unity_restaurant_wallet WHERE shift_id=$1",
      [id],
    );
    expect(credits.rows).toHaveLength(5);
    expect(credits.rows.reduce((n, r) => n + r.amount, 0)).toBe(19);
    await expect(
      service.pool.query(
        "UPDATE unity_restaurant_wallet SET amount=99 WHERE shift_id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      service.pool.query(
        "DELETE FROM unity_restaurant_wallet WHERE shift_id=$1",
        [id],
      ),
    ).rejects.toThrow(/immutable/);
    const again = await request("/shifts/" + id, owner.token);
    expect(again.body.wallet).toBe(final.body.wallet);
    expect(
      (
        await service.pool.query(
          "SELECT count(*)::int AS n FROM unity_restaurant_wallet WHERE shift_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(5);
  });
});
