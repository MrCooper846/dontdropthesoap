import { describe, it, expect } from "vitest";
import { createShift, applyAction } from "../domain/restaurant/model";
import { UNITY_MAP, blocked, zoneAt } from "../shared/unity-restaurant/map";
import {
  applyInput,
  advanceNative,
  applyNativeAction,
  createWorld,
  worldView,
  type NativeShift,
} from "../server/unity-restaurant/world";
import {
  inputSchema,
  nativeActionSchema,
  canonical,
  validateDatabase,
} from "../server/unity-restaurant/service";

function fixture(extraWaiter = false) {
  let state = createShift("test", "a", "Chef", 1000, 120000);
  for (const id of ["b", "c", "d", ...(extraWaiter ? ["e"] : [])])
    state = applyAction(state, id, { type: "join" }, 1000);
  if (extraWaiter)
    state = applyAction(state, "e", { type: "role", role: "waiter" }, 1000);
  for (const c of state.crew)
    state = applyAction(state, c.id, { type: "ready", ready: true }, 1000);
  state = applyAction(state, "a", { type: "start" }, 1000);
  return { state, world: createWorld(state, 1000, UNITY_MAP) };
}
function position(
  e: NativeShift,
  id: string,
  kind: string,
  table?: number,
  zone?: string,
) {
  const station = UNITY_MAP.stations.find(
    (s) => s.kind === kind && (table === undefined || s.table === table),
  )!;
  const candidates = [];
  for (
    let x = station.x - station.radius;
    x <= station.x + station.radius;
    x += 0.2
  )
    for (
      let z = station.z - station.radius;
      z <= station.z + station.radius;
      z += 0.2
    ) {
      const p = { x, z };
      if (
        !blocked(p) &&
        Math.hypot(x - station.x, z - station.z) <= station.radius &&
        (!zone || zoneAt(p) === zone)
      )
        candidates.push(p);
    }
  expect(candidates.length).toBeGreaterThan(0);
  const a = e.world.players.find((p) => p.id === id)!;
  Object.assign(
    a,
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - station.x, a.z - station.z) -
        Math.hypot(b.x - station.x, b.z - station.z),
    )[0],
    { updatedAt: 1000, lastInputAt: 1000, vx: 0, vz: 0 },
  );
  e.state.crew.find((c) => c.id === id)!.zone = zoneAt(a);
}
function readyOrder(e: NativeShift) {
  const o = e.state.orders[0];
  o.foodReady = o.drinkReady = true;
  e.state.stock -= 2;
  e.state.cleanPlates--;
  return o;
}

describe("authoritative native restaurant world", () => {
  it("accepts bounded directions only, ignores replay, and never trusts client position/time", () => {
    const e = fixture(),
      original = structuredClone(e),
      a = e.world.players[0];
    for (const value of [
      { seq: 1, x: NaN, z: 0 },
      { seq: 1, x: 2, z: 0 },
      { seq: -1, x: 0, z: 0 },
      { seq: 1, x: 0, z: 0, playerId: "other" },
      { seq: 1, x: 0, z: 0, time: 1 },
    ])
      expect(() => inputSchema.parse(value)).toThrow();
    expect(() => applyInput(e, "outsider", 1, 1, 0, 1000, UNITY_MAP)).toThrow();
    const first = applyInput(e, "a", 1, 1, 1, 1000, UNITY_MAP),
      moved = advanceNative(first, 1100, UNITY_MAP),
      p = moved.world.players[0];
    expect(Math.hypot(p.x - a.x, p.z - a.z)).toBeLessThanOrEqual(
      UNITY_MAP.speed * 0.1 + 1e-8,
    );
    expect(e).toEqual(original);
    const replay = applyInput(moved, "a", 1, -1, -1, 1100, UNITY_MAP);
    expect(replay.world.players[0].vx).toBeGreaterThan(0);
    expect(replay.world.players[0].inputSeq).toBe(1);
  });
  it("stops stale held input after disconnect and caps delayed clock catch-up", () => {
    const e = applyInput(fixture(), "a", 1, 1, 0, 1000, UNITY_MAP),
      moved = advanceNative(e, 1100, UNITY_MAP),
      p = moved.world.players[0];
    const stale = advanceNative(moved, 1400, UNITY_MAP);
    expect(stale.world.players[0].x).toBe(p.x);
    expect(stale.world.players[0].vx).toBe(0);
    const late = advanceNative(e, 20000, UNITY_MAP);
    expect(late.world.players[0].x).toBe(e.world.players[0].x);
  });
  it("blocks walls/counters even through repeated inputs rather than teleporting", () => {
    let e = fixture();
    const obstacle = UNITY_MAP.obstacles.find((o) => o.kind !== "wall")!;
    expect(obstacle).toBeDefined();
    let p = { x: obstacle.x, z: obstacle.z - obstacle.d / 2 - 0.5 };
    if (blocked(p)) p = { x: obstacle.x + obstacle.w / 2 + 0.5, z: obstacle.z };
    Object.assign(e.world.players[0], p);
    const dir =
      Math.abs(p.x - obstacle.x) > 0.1 ? { x: -1, z: 0 } : { x: 0, z: 1 };
    for (let i = 1; i <= 30; i++) {
      e = applyInput(e, "a", i, dir.x, dir.z, 1000 + i * 100, UNITY_MAP);
      expect(blocked(e.world.players[0])).toBe(false);
    }
    expect(
      Math.hypot(e.world.players[0].x - p.x, e.world.players[0].z - p.z),
    ).toBeLessThan(3);
  });
  it("requires physical stations and authoritative zones, cancels tasks and theft on actual movement", () => {
    let e = fixture();
    expect(() =>
      applyNativeAction(
        e,
        "a",
        { type: "begin", kind: "cook", orderId: e.state.orders[0].id },
        1000,
        UNITY_MAP,
        "Chef",
      ),
    ).toThrow();
    expect(() =>
      nativeActionSchema.parse({ type: "move", zone: "kitchen" }),
    ).toThrow();
    position(e, "a", "cook", undefined, "kitchen");
    e = applyNativeAction(
      e,
      "a",
      { type: "begin", kind: "cook", orderId: e.state.orders[0].id },
      1000,
      UNITY_MAP,
      "Chef",
    );
    expect(e.state.crew[0].task).not.toBeNull();
    e = applyInput(e, "a", 1, 0, -1, 1000, UNITY_MAP);
    e = advanceNative(e, 1100, UNITY_MAP);
    expect(e.state.crew[0].task).toBeNull();
    position(e, "a", "office", undefined, "office");
    e.state.revenue = e.state.vault = 5;
    e = applyNativeAction(
      e,
      "a",
      { type: "steal", amount: 1 },
      1200,
      UNITY_MAP,
      "Chef",
    );
    e = applyInput(e, "a", 2, -1, 0, 1200, UNITY_MAP);
    e = advanceNative(e, 1300, UNITY_MAP);
    expect(e.state.crew[0].pendingTheft).toBeNull();
    expect(e.state.vault).toBe(5);
  });
  it("exclusively reserves hatch pickup, requires waiter and correct table for serving, recovers a dropped tray once", () => {
    let e = fixture(true);
    const order = readyOrder(e);
    position(e, "b", "pickup", undefined, "dining");
    position(e, "e", "pickup", undefined, "dining");
    expect(() =>
      applyNativeAction(
        e,
        "a",
        { type: "pickup", orderId: order.id },
        1000,
        UNITY_MAP,
        "Chef",
      ),
    ).toThrow();
    e = applyNativeAction(
      e,
      "b",
      { type: "pickup", orderId: order.id },
      1000,
      UNITY_MAP,
      "Waiter",
    );
    expect(() =>
      applyNativeAction(
        e,
        "e",
        { type: "pickup", orderId: order.id },
        1000,
        UNITY_MAP,
        "Other",
      ),
    ).toThrow();
    expect(() =>
      applyNativeAction(
        e,
        "b",
        { type: "begin", kind: "serve", orderId: order.id },
        1000,
        UNITY_MAP,
        "Waiter",
      ),
    ).toThrow();
    e = applyNativeAction(e, "b", { type: "drop" }, 1000, UNITY_MAP, "Waiter");
    expect(worldView(e, UNITY_MAP).droppedOrders).toHaveLength(1);
    e = applyNativeAction(
      e,
      "e",
      { type: "pickup", orderId: order.id },
      1000,
      UNITY_MAP,
      "Other",
    );
    expect(() =>
      applyNativeAction(
        e,
        "b",
        { type: "pickup", orderId: order.id },
        1000,
        UNITY_MAP,
        "Waiter",
      ),
    ).toThrow();
    position(e, "e", "serve", order.table, "dining");
    e = applyNativeAction(
      e,
      "e",
      { type: "begin", kind: "serve", orderId: order.id },
      1000,
      UNITY_MAP,
      "Other",
    );
    for (const [i, value] of [
      "lift",
      "balance-left",
      "balance-right",
      "serve",
    ].entries())
      e = applyNativeAction(
        e,
        "e",
        { type: "step", value },
        1500 + i * 500,
        UNITY_MAP,
        "Other",
      );
    expect(e.state.revenue).toBe(13);
    expect(
      e.world.players.find((a) => a.id === "e")!.carryingOrderId,
    ).toBeNull();
    expect(e.world.deliveries).toHaveLength(0);
    expect(() =>
      applyNativeAction(
        e,
        "e",
        { type: "step", value: "serve" },
        4000,
        UNITY_MAP,
        "Other",
      ),
    ).toThrow();
  });
  it("releases carried orders on departure without duplicating order ownership", () => {
    let e = fixture(true);
    const o = readyOrder(e);
    position(e, "b", "pickup", undefined, "dining");
    position(e, "e", "pickup", undefined, "dining");
    e = applyNativeAction(
      e,
      "b",
      { type: "pickup", orderId: o.id },
      1000,
      UNITY_MAP,
      "B",
    );
    e = applyNativeAction(e, "b", { type: "leave" }, 1000, UNITY_MAP, "B");
    expect(
      e.world.players.find((a) => a.id === "b")!.carryingOrderId,
    ).toBeNull();
    expect(e.world.deliveries[0].carrierId).toBeNull();
    e = applyNativeAction(
      e,
      "e",
      { type: "pickup", orderId: o.id },
      1000,
      UNITY_MAP,
      "E",
    );
    expect(e.world.deliveries.filter((d) => d.carrierId)).toHaveLength(1);
  });
  it("physically gates searches and supporters and freezes approved suspects during movement", () => {
    let e = fixture();
    position(e, "a", "office", undefined, "office");
    position(e, "b", "office", undefined, "office");
    position(e, "c", "office", undefined, "office");
    e.world.players.find((a) => a.id === "b")!.x += 5;
    expect(() =>
      applyNativeAction(
        e,
        "b",
        { type: "search", targetId: "a" },
        1000,
        UNITY_MAP,
        "B",
      ),
    ).toThrow();
    position(e, "b", "office", undefined, "office");
    e = applyNativeAction(
      e,
      "b",
      { type: "search", targetId: "a" },
      1000,
      UNITY_MAP,
      "B",
    );
    e.world.players.find((a) => a.id === "c")!.x += 5;
    expect(() =>
      applyNativeAction(e, "c", { type: "support" }, 1000, UNITY_MAP, "C"),
    ).toThrow();
    position(e, "c", "office", undefined, "office");
    e = applyNativeAction(e, "c", { type: "support" }, 1000, UNITY_MAP, "C");
    const pos = { ...e.world.players[0] };
    e = applyInput(e, "a", 1, -1, 0, 1000, UNITY_MAP);
    e = advanceNative(e, 1100, UNITY_MAP);
    expect(e.world.players[0].x).toBe(pos.x);
  });
  it("restricts database identity, action payloads and canonical command hashes", () => {
    for (const u of [
      "postgresql://x@localhost:5432/soap_unity_restaurant",
      "postgresql://x@example.com:55436/soap_unity_restaurant",
      "postgresql://x@127.0.0.1:55436/soap_test",
      "postgresql://x@127.0.0.1:55436/soap_unity_restaurant?host=example.com",
      "postgresql://x@127.0.0.1:55436/soap_unity_restaurant?dbname=soap_test",
    ])
      expect(() => validateDatabase(u)).toThrow();
    expect(
      validateDatabase("postgresql://x@127.0.0.1:55436/soap_unity_restaurant"),
    ).toContain("55436");
    expect(() =>
      nativeActionSchema.parse({ type: "step", value: "serve", score: 999 }),
    ).toThrow();
    expect(() =>
      nativeActionSchema.parse({ type: "steal", amount: NaN }),
    ).toThrow();
    expect(canonical({ b: 2, a: { z: 1, x: 3 } })).toBe(
      canonical({ a: { x: 3, z: 1 }, b: 2 }),
    );
  });

  it("cancels an approved search when a supporter walks away in the same zone before resolution", () => {
    let e = fixture();
    for (const id of ["a", "b", "c"])
      position(e, id, "office", undefined, "office");
    e.state.vault = 5;
    e.state.revenue = 10;
    e.state.crew[0].stolen = 5;
    e = applyNativeAction(
      e,
      "b",
      { type: "search", targetId: "a" },
      1000,
      UNITY_MAP,
      "B",
    );
    e = applyNativeAction(e, "c", { type: "support" }, 1000, UNITY_MAP, "C");
    expect(e.state.search!.resolvesAt).toBe(4000);
    const target = e.world.players[0],
      supporter = e.world.players.find((a) => a.id === "c")!;
    let away;
    for (let x = -2; x < 4 && !away; x += 0.25)
      for (let z = 7.5; z < 12 && !away; z += 0.25)
        if (
          !blocked({ x, z }) &&
          zoneAt({ x, z }) === "office" &&
          Math.hypot(x - target.x, z - target.z) > 2.1
        )
          away = { x, z };
    expect(away).toBeDefined();
    Object.assign(supporter, away);
    expect(zoneAt(supporter)).toBe("office");
    e = advanceNative(e, 4000, UNITY_MAP);
    expect(e.state.search).toBeNull();
    expect(e.state.crew[0].stolen).toBe(5);
    expect(e.state.crew[0].caught).toBe(false);
    expect(e.state.crew[1].falseAccusations).toBe(0);
    expect(e.state.events.at(-1)!.text).toContain("lost physical support");
  });

  it("physically recovers exhausted stock with an authoritative emergency restock and no invented income", () => {
    let e = fixture();
    e.state.stock = 0;
    position(e, "d", "restock", undefined, "stockroom");
    e = applyNativeAction(
      e,
      "d",
      { type: "begin", kind: "restock" },
      1000,
      UNITY_MAP,
      "Runner",
    );
    for (const [i, value] of ["collect", "carry", "shelve"].entries())
      e = applyNativeAction(
        e,
        "d",
        { type: "step", value },
        1500 + i * 500,
        UNITY_MAP,
        "Runner",
      );
    expect(e.state.stock).toBe(8);
    expect(e.state.vault).toBe(0);
    expect(e.state.spent).toBe(0);
    expect(e.state.revenue).toBe(0);
  });

  it("reports the authoritative shared map version and cancels work even for tiny real movement", () => {
    let e = fixture();
    expect(worldView(e, UNITY_MAP).mapVersion).toBe(UNITY_MAP.version);
    position(e, "a", "cook", undefined, "kitchen");
    e = applyNativeAction(
      e,
      "a",
      { type: "begin", kind: "cook", orderId: e.state.orders[0].id },
      1000,
      UNITY_MAP,
      "A",
    );
    e = applyInput(e, "a", 1, 0.0001, 0, 1000, UNITY_MAP);
    e = advanceNative(e, 1100, UNITY_MAP);
    expect(e.state.crew[0].task).toBeNull();
  });
});
