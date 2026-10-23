import {
  applyAction,
  advance,
  RuleError,
  type RestaurantState,
} from "../../domain/restaurant/model";
import type {
  RestaurantAction,
  RestaurantZone,
} from "../../shared/restaurant/types";

import {
  UNITY_MAP,
  movePoint,
  zoneAt as mapZone,
  nearStation as mapNear,
} from "../../shared/unity-restaurant/map";
export type Point = { x: number; z: number };
export type NativeStation = Point & {
  id: string;
  kind: "cook" | "drink" | "wash" | "restock" | "office" | "hatch" | "table";
  zone: RestaurantZone;
  range: number;
  table?: number;
};
export type NativeMap = typeof UNITY_MAP;
export type NativeActor = Point & {
  id: string;
  vx: number;
  vz: number;
  inputSeq: number;
  lastInputAt: number;
  updatedAt: number;
  carryingOrderId: string | null;
};
export type NativeWorld = {
  players: NativeActor[];
  deliveries: {
    orderId: string;
    carrierId: string | null;
    x: number;
    z: number;
  }[];
  crumbs: { dropId: string; x: number; z: number }[];
  serverTime: number;
};
export type NativeShift = { state: RestaurantState; world: NativeWorld };
export type NativeAction =
  | Exclude<RestaurantAction, { type: "move" }>
  | { type: "pickup"; orderId: string }
  | { type: "drop" };
function need(ok: unknown, code: string): asserts ok {
  if (!ok) throw new RuleError(code);
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function zoneAt(_map: NativeMap, p: Point): RestaurantZone {
  return mapZone(p);
}
export function actorAtSpawn(
  id: string,
  now: number,
  map: NativeMap,
  index = 0,
): NativeActor {
  return {
    id,
    x: map.spawns[index % map.spawns.length].x,
    z: map.spawns[index % map.spawns.length].z,
    vx: 0,
    vz: 0,
    inputSeq: 0,
    lastInputAt: now,
    updatedAt: now,
    carryingOrderId: null,
  };
}
export function createWorld(
  state: RestaurantState,
  now: number,
  map: NativeMap,
): NativeWorld {
  return {
    players: state.crew.map((c, i) => actorAtSpawn(c.id, now, map, i)),
    deliveries: [],
    crumbs: [],
    serverTime: now,
  };
}
function sync(e: NativeShift, now: number, map: NativeMap) {
  e.world.crumbs ??= [];
  for (const d of e.state.drops)
    if (!e.world.crumbs.some((p) => p.dropId === d.id)) {
      const actor = e.world.players.find((a) =>
        e.state.crew.some((c) => c.id === a.id && c.zone === d.zone),
      );
      const station = map.stations.find((s) => mapZone(s) === d.zone);
      e.world.crumbs.push({
        dropId: d.id,
        x: actor?.x ?? station?.x ?? 0,
        z: actor?.z ?? station?.z ?? 0,
      });
    }
  e.world.crumbs = e.world.crumbs.filter((p) =>
    e.state.drops.some((d) => d.id === p.dropId),
  );
  for (const c of e.state.crew)
    if (!e.world.players.some((a) => a.id === c.id))
      e.world.players.push(
        actorAtSpawn(c.id, now, map, e.world.players.length),
      );
  for (const a of e.world.players) {
    const c = e.state.crew.find((c) => c.id === a.id);
    const order = e.state.orders.find((o) => o.id === a.carryingOrderId);
    if (a.carryingOrderId && (!c?.active || order?.status !== "open")) {
      const d = e.world.deliveries.find((d) => d.orderId === a.carryingOrderId);
      if (d) {
        d.carrierId = null;
        d.x = a.x;
        d.z = a.z;
      }
      a.carryingOrderId = null;
    }
  }
  e.world.deliveries = e.world.deliveries.filter((d) =>
    e.state.orders.some((o) => o.id === d.orderId && o.status === "open"),
  );
}
export function advanceNative(
  input: NativeShift,
  now: number,
  map: NativeMap,
): NativeShift {
  const e = structuredClone(input);
  sync(e, now, map);
  for (const a of e.world.players) {
    const c = e.state.crew.find((c) => c.id === a.id);
    const dt = Math.max(0, Math.min(0.25, (now - a.updatedAt) / 1000));
    a.updatedAt = now;
    if (!c?.active || e.state.phase === "finished") continue;
    const frozen =
      e.state.search?.targetId === a.id && e.state.search.resolvesAt !== null;
    if (now - a.lastInputAt > 250 || frozen) {
      a.vx = a.vz = 0;
      continue;
    }
    const before = { x: a.x, z: a.z };
    const factor = a.carryingOrderId ? 0.6 : 1;
    const next = movePoint(a, a.vx * factor, a.vz * factor, dt);
    a.x = next.x;
    a.z = next.z;
    if (distance(before, a) > 0) {
      c.task = null;
      c.pendingTheft = null;
    }
    c.zone = zoneAt(map, a);
    const d = e.world.deliveries.find((d) => d.orderId === a.carryingOrderId);
    if (d) {
      d.x = a.x;
      d.z = a.z;
    }
  }
  const search = e.state.search;
  if (search?.resolvesAt != null) {
    const target = e.world.players.find((a) => a.id === search.targetId);
    const present = (id: string) => {
      const member = e.state.crew.find((c) => c.id === id);
      const actor = e.world.players.find((a) => a.id === id);
      return (
        member?.active &&
        now - member.lastSeen <= 45000 &&
        actor &&
        target &&
        distance(actor, target) <= 2
      );
    };
    if (!present(search.targetId) || !search.supporters.every(present)) {
      e.state.search = null;
      e.state.events.push({
        id: ++e.state.sequence,
        at: now,
        text: "The search lost physical support and was cancelled.",
      });
      e.state.events = e.state.events.slice(-60);
      e.state.version++;
    }
  }
  const previousDrops = new Set(e.state.drops.map((d) => d.id));
  const priorCrew = structuredClone(e.state.crew);
  e.state = advance(e.state, now);
  const assigned = new Set<string>();
  for (const d of e.state.drops)
    if (!previousDrops.has(d.id)) {
      const owner = priorCrew.find(
        (c) =>
          !assigned.has(c.id) &&
          c.zone === d.zone &&
          c.pouch + c.stolen >
            e.state.crew.find((n) => n.id === c.id)!.pouch +
              e.state.crew.find((n) => n.id === c.id)!.stolen,
      );
      const a = e.world.players.find((a) => a.id === owner?.id);
      if (a) {
        assigned.add(a.id);
        e.world.crumbs.push({ dropId: d.id, x: a.x, z: a.z });
      }
    }
  sync(e, now, map);
  e.world.serverTime = now;
  return e;
}
export function applyInput(
  input: NativeShift,
  ownerId: string,
  seq: number,
  x: number,
  z: number,
  now: number,
  map: NativeMap,
): NativeShift {
  need(
    Number.isSafeInteger(seq) &&
      seq >= 0 &&
      seq <= 2147483647 &&
      Number.isFinite(x) &&
      Number.isFinite(z) &&
      Math.abs(x) <= 1 &&
      Math.abs(z) <= 1,
    "INVALID_INPUT",
  );
  const e = advanceNative(input, now, map),
    c = e.state.crew.find((c) => c.id === ownerId),
    a = e.world.players.find((a) => a.id === ownerId);
  need(c?.active && a, "NOT_PARTICIPATING");
  need(e.state.phase !== "finished", "SHIFT_FINISHED");
  if (seq <= a.inputSeq) return e;
  const length = Math.max(1, Math.hypot(x, z));
  a.vx = x / length;
  a.vz = z / length;
  a.inputSeq = seq;
  a.lastInputAt = now;
  c.lastSeen = now;
  return e;
}
export function nearStation(
  _map: NativeMap,
  a: Point,
  kind: NativeStation["kind"],
  table?: number,
): boolean {
  return mapNear(
    a,
    kind === "hatch" ? "pickup" : kind === "table" ? "serve" : kind,
    table,
  );
}
export function applyNativeAction(
  input: NativeShift,
  ownerId: string,
  action: NativeAction,
  now: number,
  map: NativeMap,
  name: string,
  random = 0.5,
): NativeShift {
  let e = advanceNative(input, now, map);
  let c = e.state.crew.find((c) => c.id === ownerId),
    a = e.world.players.find((a) => a.id === ownerId);
  if (action.type === "join") {
    e.state = applyAction(e.state, ownerId, action, now, random, name);
    sync(e, now, map);
    c = e.state.crew.find((c) => c.id === ownerId)!;
    a = e.world.players.find((a) => a.id === ownerId)!;
    c.zone = zoneAt(map, a);
    return e;
  }
  need(c?.active && a, "NOT_PARTICIPATING");
  if (action.type === "pickup" || action.type === "drop") {
    need(e.state.phase === "active", "WRONG_PHASE");
    need(c.role === "waiter", "WRONG_ROLE");
    need(
      !(
        e.state.search?.targetId === ownerId &&
        e.state.search.resolvesAt !== null
      ),
      "SEARCH_IN_PROGRESS",
    );
    if (action.type === "drop") {
      need(a.carryingOrderId, "NOT_CARRYING");
      const d = e.world.deliveries.find(
        (d) =>
          d.orderId === c.task?.orderId || d.orderId === a?.carryingOrderId,
      )!;
      d.carrierId = null;
      d.x = a.x;
      d.z = a.z;
      a.carryingOrderId = null;
      c.task = null;
    } else {
      need(!a.carryingOrderId, "ALREADY_CARRYING");
      const o = e.state.orders.find((o) => o.id === action.orderId);
      need(
        o?.status === "open" && o.foodReady && o.drinkReady,
        "ORDER_NOT_READY",
      );
      let d = e.world.deliveries.find((d) => d.orderId === o.id);
      need(!d?.carrierId, "ORDER_CARRIED");
      need(
        d
          ? distance(a, d) <= 1.6
          : c.zone === "dining" && nearStation(map, a, "hatch"),
        "TOO_FAR",
      );
      if (!d) {
        d = { orderId: o.id, carrierId: null, x: a.x, z: a.z };
        e.world.deliveries.push(d);
      }
      d.carrierId = ownerId;
      a.carryingOrderId = o.id;
      c.task = null;
    }
    c.lastSeen = now;
    e.state.version++;
    return e;
  }
  const command = action as RestaurantAction;
  // Native players never submit their own role-zone or result: only physical simulation does.
  need(command.type !== "move", "USE_MOVEMENT_INPUT");
  if (command.type === "begin") {
    const order = e.state.orders.find((o) => o.id === command.orderId);
    if (command.kind === "serve") {
      need(a.carryingOrderId === command.orderId, "PICKUP_REQUIRED");
      need(order && nearStation(map, a, "table", order.table), "TOO_FAR");
    } else need(nearStation(map, a, command.kind), "TOO_FAR");
  }
  if (
    ["deposit", "steal", "take", "return", "reconcile"].includes(command.type)
  )
    need(nearStation(map, a, "office"), "TOO_FAR");
  if (command.type === "recover") {
    const d = e.world.crumbs.find((d) => d.dropId === command.dropId);
    need(d && distance(a, d) <= 1.6, "TOO_FAR");
  }
  if (command.type === "search") {
    const target = e.world.players.find((p) => p.id === command.targetId);
    need(target && distance(a, target) <= 2, "TOO_FAR");
  }
  if (command.type === "support") {
    const q = e.state.search,
      target = e.world.players.find((p) => p.id === q?.targetId);
    need(
      q &&
        target &&
        distance(a, target) <= 2 &&
        q.supporters.every((id) => {
          const p = e.world.players.find((p) => p.id === id);
          return p && distance(p, target) <= 2;
        }),
      "TOO_FAR",
    );
  }
  const previousDrops = new Set(e.state.drops.map((d) => d.id));
  e.state = applyAction(e.state, ownerId, command, now, random, name);
  for (const d of e.state.drops)
    if (!previousDrops.has(d.id))
      e.world.crumbs.push({ dropId: d.id, x: a.x, z: a.z });
  if (command.type === "leave" || command.type === "step") sync(e, now, map);
  if (command.type === "leave") {
    a = e.world.players.find((a) => a.id === ownerId)!;
    a.vx = a.vz = 0;
  }
  return e;
}
export function worldView(e: NativeShift, map: NativeMap) {
  return {
    serverTime: e.world.serverTime,
    mapVersion: map.version,
    map,
    bounds: map.bounds,
    obstacles: map.obstacles,
    stations: map.stations,
    deliveries: e.world.deliveries,
    droppedOrders: e.world.deliveries
      .filter((d) => d.carrierId === null)
      .map(({ orderId, x, z }) => ({ orderId, x, z })),
    drops: e.world.crumbs,
    players: e.world.players.map((a) => {
      const c = e.state.crew.find((c) => c.id === a.id)!;
      return {
        id: a.id,
        name: c.name,
        x: a.x,
        z: a.z,
        role: c.role,
        zone: c.zone,
        active: c.active,
        carryingOrderId: a.carryingOrderId,
        inputSeq: a.inputSeq,
      };
    }),
  };
}
