import { RuleError } from "../match/model";
import {
  RESTAURANT_ROLES,
  RESTAURANT_ZONES,
  type RestaurantAction,
  type RestaurantRole,
  type RestaurantZone,
  type RestaurantTaskView,
  type RestaurantOrder,
  type RestaurantView,
  type RestaurantReceipt,
  type RestaurantCrewView,
} from "../../shared/restaurant/types";
export { RuleError };
type Kind = RestaurantTaskView["kind"];
export type RestaurantCrew = RestaurantCrewView & {
  lastSeen: number;
  joinedAt: number;
  leftAt: number | null;
  pouch: number;
  stolen: number;
  task: RestaurantTaskView | null;
  pendingTheft: { amount: number; readyAt: number } | null;
  falseAccusations: number;
  searchAvailableAt: number;
  mistakes: number;
};
export type RestaurantState = {
  id: string;
  hostId: string;
  phase: "waiting" | "active" | "finished";
  version: number;
  durationMs: number;
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  stealEndsAt: number | null;
  vault: number;
  revenue: number;
  spent: number;
  cleanPlates: number;
  dirtyPlates: number;
  stock: number;
  served: number;
  crew: RestaurantCrew[];
  orders: RestaurantOrder[];
  events: { id: number; at: number; text: string }[];
  drops: {
    id: string;
    zone: RestaurantZone;
    amount: number;
    expiresAt: number;
    source: "pouch" | "stolen";
  }[];
  search: RestaurantView["search"];
  searchCooldownUntil: number;
  lastReconciliation: RestaurantView["lastReconciliation"];
  receipts: RestaurantReceipt[] | null;
  orderMistakes: Record<string, number>;
  nextOrderAt: number;
  sequence: number;
};
function need(ok: unknown, code = "INVALID_ACTION"): asserts ok {
  if (!ok) throw new RuleError(code);
}
const clone = (s: RestaurantState): RestaurantState => structuredClone(s);
function event(s: RestaurantState, now: number, text: string) {
  s.events.push({ id: ++s.sequence, at: now, text });
  s.events = s.events.slice(-60);
}
function crew(
  id: string,
  name: string,
  role: RestaurantRole,
  now: number,
): RestaurantCrew {
  return {
    id,
    name: name.trim().slice(0, 40) || "Prisoner",
    role,
    zone: "dining",
    ready: false,
    active: true,
    caught: false,
    contribution: 0,
    lastSeen: now,
    joinedAt: now,
    leftAt: null,
    pouch: 0,
    stolen: 0,
    task: null,
    pendingTheft: null,
    falseAccusations: 0,
    searchAvailableAt: 0,
    mistakes: 0,
  };
}
export function createShift(
  id: string,
  ownerId: string,
  name: string,
  now: number,
  durationMs = 600000,
): RestaurantState {
  need(
    Number.isFinite(now) &&
      now >= 0 &&
      Number.isInteger(durationMs) &&
      durationMs >= 120000 &&
      durationMs <= 900000,
    "INVALID_SETTINGS",
  );
  return {
    id,
    hostId: ownerId,
    phase: "waiting",
    version: 0,
    durationMs,
    createdAt: now,
    startedAt: null,
    endsAt: null,
    stealEndsAt: null,
    vault: 0,
    revenue: 0,
    spent: 0,
    cleanPlates: 4,
    dirtyPlates: 0,
    stock: 8,
    served: 0,
    crew: [crew(ownerId, name, "chef", now)],
    orders: [],
    events: [],
    drops: [],
    search: null,
    searchCooldownUntil: 0,
    lastReconciliation: null,
    receipts: null,
    orderMistakes: {},
    nextOrderAt: 0,
    sequence: 0,
  };
}
function readiness(s: RestaurantState) {
  for (const c of s.crew) c.ready = false;
}
function spawn(s: RestaurantState, now: number) {
  if (
    s.orders.length >= 40 ||
    s.orders.filter((o) => o.status === "open").length >= 4
  )
    return;
  const n = s.orders.length + 1;
  s.orders.push({
    id: s.id + ":order:" + n,
    table: ((n - 1) % 4) + 1,
    dish: n % 2 ? "noodle bowl" : "toast",
    drink: n % 2 ? "tea" : "juice",
    foodReady: false,
    drinkReady: false,
    createdAt: now,
    expiresAt: now + 120000,
    status: "open",
    paid: 0,
  });
}
function refund(s: RestaurantState, c: RestaurantCrew) {
  s.vault += c.pouch + c.stolen;
  c.pouch = c.stolen = 0;
  c.task = c.pendingTheft = null;
}
function depart(s: RestaurantState, c: RestaurantCrew, now: number) {
  refund(s, c);
  c.active = false;
  c.leftAt = now;
  c.ready = false;
  if (s.phase === "waiting") {
    if (s.hostId === c.id) s.hostId = s.crew.find((x) => x.active)?.id ?? c.id;
    readiness(s);
  }
  event(s, now, c.name + " left the shift.");
}
function mistake(
  s: RestaurantState,
  c: RestaurantCrew,
  now: number,
  random: number,
) {
  c.mistakes++;
  if (c.task?.orderId)
    s.orderMistakes[c.task.orderId] =
      (s.orderMistakes[c.task.orderId] ?? 0) + 1;
  if (random >= Math.min(0.8, 0.15 + c.mistakes * 0.1 + c.stolen * 0.025))
    return;
  for (const source of ["stolen", "pouch"] as const) {
    const amount = Math.min(5, c[source]);
    if (!amount) continue;
    c[source] -= amount;
    s.drops.push({
      id: s.id + ":drop:" + ++s.sequence,
      zone: c.zone,
      amount,
      expiresAt: now + 20000,
      source,
    });
    event(s, now, "Noodles were dropped in " + c.zone + ".");
    break;
  }
}
function resolveSearch(s: RestaurantState, now: number) {
  const search = s.search;
  if (!search) return;
  const target = s.crew.find((c) => c.id === search.targetId)!,
    caller = s.crew.find((c) => c.id === search.callerId)!;
  if (target.stolen > 0) {
    s.vault += target.stolen;
    target.stolen = 0;
    target.pendingTheft = null;
    target.caught = true;
    event(
      s,
      now,
      target.name + " was caught with missing noodles. Funds restored.",
    );
  } else {
    caller.falseAccusations++;
    caller.searchAvailableAt = now + 90000;
    event(
      s,
      now,
      "The search found no missing noodles. False-call penalty recorded.",
    );
  }
  s.search = null;
}
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0),
    w = sum ? weights : weights.map(() => 1),
    denominator = sum || weights.length;
  const shares = w.map((v) => Math.floor((total * v) / denominator));
  const recipients = w
    .map((weight, i) => (weight > 0 ? i : -1))
    .filter((i) => i >= 0);
  for (
    let i = 0, left = total - shares.reduce((a, b) => a + b, 0);
    left > 0;
    i++, left--
  )
    shares[recipients[i % recipients.length]]++;
  return shares;
}
function finish(s: RestaurantState, now: number) {
  if (s.phase !== "active") return;
  if (s.search?.resolvesAt !== null && s.search) resolveSearch(s, now);
  for (const c of s.crew) {
    s.vault += c.pouch;
    c.pouch = 0;
    c.task = c.pendingTheft = null;
  }
  for (const d of s.drops) s.vault += d.amount;
  s.drops = [];
  s.search = null;
  const members = [...s.crew].sort((a, b) => a.id.localeCompare(b.id));
  const weights = members.map((c) =>
    Math.max(0, Math.min(c.leftAt ?? s.endsAt!, s.endsAt!) - s.startedAt!),
  );
  const base = allocate(s.vault, weights),
    receipts = members.map((c, i) => ({
      ownerId: c.id,
      name: c.name,
      base: base[i],
      penalty: Math.floor(
        base[i] * (c.caught ? 0.5 : Math.min(0.5, c.falseAccusations * 0.1)),
      ),
      redistribution: 0,
      theft: c.stolen,
      total: 0,
    }));
  const eligible = receipts
    .map((r, i) =>
      weights[i] > 0 && !members[i].caught && !members[i].falseAccusations
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  if (eligible.length) {
    const pool = receipts.reduce((n, r) => n + r.penalty, 0),
      shares = allocate(
        pool,
        eligible.map(() => 1),
      );
    eligible.forEach((i, n) => (receipts[i].redistribution = shares[n]));
  } else for (const r of receipts) r.penalty = 0;
  for (const r of receipts)
    r.total = r.base - r.penalty + r.redistribution + r.theft;
  s.receipts = receipts;
  s.phase = "finished";
  event(s, now, "Shift finished. Final receipts are ready.");
}
function advanceMutable(s: RestaurantState, now: number) {
  if (s.phase === "waiting") {
    for (const c of s.crew)
      if (c.active && now - c.lastSeen > 45000)
        depart(s, c, c.lastSeen + 45000);
    if (now - s.createdAt >= 900000) {
      s.phase = "finished";
      s.receipts = s.crew.map((c) => ({
        ownerId: c.id,
        name: c.name,
        base: 0,
        penalty: 0,
        redistribution: 0,
        theft: 0,
        total: 0,
      }));
      event(s, now, "The waiting room expired without starting a shift.");
    }
    return;
  }
  if (s.phase !== "active") return;
  const horizon = Math.min(now, s.endsAt!);
  if (
    s.search?.resolvesAt != null &&
    (horizon >= s.search.resolvesAt || now >= s.endsAt!)
  )
    resolveSearch(s, horizon);
  for (const c of s.crew)
    if (c.active && horizon - c.lastSeen > 45000)
      depart(s, c, c.lastSeen + 45000);
  if (now >= s.endsAt!) {
    finish(s, s.endsAt!);
    return;
  }
  for (const c of s.crew)
    if (c.task && now > c.task.expiresAt) {
      c.task = null;
      mistake(s, c, now, 0.5);
    }
  for (const d of s.drops.filter((d) => now >= d.expiresAt))
    s.vault += d.amount;
  s.drops = s.drops.filter((d) => now < d.expiresAt);
  for (const o of s.orders)
    if (o.status === "open" && now >= o.expiresAt) {
      o.status = "expired";
      if (o.foodReady) s.dirtyPlates++;
      for (const c of s.crew) if (c.task?.orderId === o.id) c.task = null;
    }
  if (s.search) {
    if (s.search.resolvesAt !== null && now >= s.search.resolvesAt)
      resolveSearch(s, now);
    else if (s.search.resolvesAt === null && now >= s.search.expiresAt) {
      event(s, now, "Search request expired without enough support.");
      s.search = null;
    }
  }
  let slots = 4 - s.orders.filter((o) => o.status === "open").length;
  while (slots-- > 0 && now >= s.nextOrderAt && s.orders.length < 40) {
    spawn(s, now);
    s.nextOrderAt += 8000;
  }
}
export function advance(state: RestaurantState, now: number): RestaurantState {
  need(Number.isFinite(now) && now >= state.createdAt, "INVALID_TIME");
  const s = clone(state);
  if (s.phase === "finished") return s;
  const before = JSON.stringify(s);
  advanceMutable(s, now);
  if (JSON.stringify(s) !== before) s.version++;
  return s;
}
const taskRoles: Record<Kind, RestaurantRole> = {
  cook: "chef",
  drink: "barman",
  serve: "waiter",
  wash: "runner",
  restock: "runner",
};
const taskZones: Record<Kind, RestaurantZone> = {
  cook: "kitchen",
  drink: "bar",
  serve: "dining",
  wash: "washup",
  restock: "stockroom",
};
const steps: Record<Kind, string[]> = {
  cook: ["chop", "stir", "plate"],
  drink: ["pour", "mix", "garnish"],
  serve: ["lift", "balance-left", "balance-right", "serve"],
  wash: ["scrub", "rinse", "stack"],
  restock: ["collect", "carry", "shelve"],
};
export function applyAction(
  state: RestaurantState,
  ownerId: string,
  action: RestaurantAction,
  now: number,
  random = 0.5,
  name = "Prisoner",
): RestaurantState {
  need(
    Number.isFinite(now) &&
      Number.isFinite(random) &&
      random >= 0 &&
      random <= 1,
    "INVALID_INPUT",
  );
  const s = advance(state, now);
  need(s.phase !== "finished", "SHIFT_FINISHED");
  if (action.type === "join") {
    need(s.phase === "waiting", "WRONG_PHASE");
    need(!s.crew.some((c) => c.id === ownerId && c.active), "ALREADY_JOINED");
    need(s.crew.filter((c) => c.active).length < 8, "CAPACITY_FULL");
    const role =
      RESTAURANT_ROLES.find(
        (r) => !s.crew.some((c) => c.active && c.role === r),
      ) ?? "waiter";
    const old = s.crew.find((c) => c.id === ownerId);
    if (old) Object.assign(old, crew(ownerId, name, role, now));
    else s.crew.push(crew(ownerId, name, role, now));
    readiness(s);
    s.version++;
    return s;
  }
  const c = s.crew.find((x) => x.id === ownerId);
  need(c?.active, "NOT_PARTICIPATING");
  c.lastSeen = now;
  if (action.type === "leave") {
    need(
      !(s.search?.targetId === c.id && s.search.resolvesAt !== null),
      "SEARCH_IN_PROGRESS",
    );
    depart(s, c, now);
    s.version++;
    return s;
  }
  if (s.phase === "waiting") {
    if (action.type === "role") {
      need(RESTAURANT_ROLES.includes(action.role), "INVALID_ROLE");
      c.role = action.role;
      readiness(s);
    } else if (action.type === "ready") {
      need(typeof action.ready === "boolean");
      c.ready = action.ready;
    } else if (action.type === "start") {
      need(c.id === s.hostId, "FORBIDDEN");
      const active = s.crew.filter((x) => x.active);
      need(
        active.length >= 4 &&
          active.length <= 8 &&
          active.every((x) => x.ready) &&
          RESTAURANT_ROLES.every((r) => active.some((x) => x.role === r)),
        "CREW_NOT_READY",
      );
      s.phase = "active";
      s.startedAt = now;
      s.endsAt = now + s.durationMs;
      s.stealEndsAt = s.endsAt - 15000;
      for (const x of active) {
        x.joinedAt = now;
        x.lastSeen = now;
      }
      for (let i = 0; i < (active.length >= 6 ? 4 : 2); i++) spawn(s, now);
      s.nextOrderAt = now + 8000;
      event(s, now, "Service started. Keep the noodles moving.");
    } else throw new RuleError("WRONG_PHASE");
    s.version++;
    return s;
  }
  const frozen = s.search?.targetId === c.id && s.search.resolvesAt !== null;
  switch (action.type) {
    case "move":
      need(RESTAURANT_ZONES.includes(action.zone), "INVALID_ZONE");
      need(!frozen, "SEARCH_IN_PROGRESS");
      c.zone = action.zone;
      c.task = c.pendingTheft = null;
      break;
    case "cancel":
      c.task = c.pendingTheft = null;
      break;
    case "begin": {
      need(!frozen, "SEARCH_IN_PROGRESS");
      need(action.kind in taskRoles);
      need(c.role === taskRoles[action.kind], "WRONG_ROLE");
      need(c.zone === taskZones[action.kind], "WRONG_ZONE");
      need(!c.task && !c.pendingTheft, "ALREADY_BUSY");
      const o = s.orders.find((o) => o.id === action.orderId);
      if (["cook", "drink", "serve"].includes(action.kind)) {
        need(o?.status === "open", "ORDER_UNAVAILABLE");
        need(
          !s.crew.some(
            (x) => x.task?.kind === action.kind && x.task.orderId === o.id,
          ),
          "TASK_RESERVED",
        );
        if (action.kind === "cook") {
          need(!o.foodReady, "ALREADY_PREPARED");
          need(
            s.cleanPlates >
              s.crew.filter((x) => x.task?.kind === "cook").length,
            "NO_PLATES",
          );
        }
        if (action.kind === "drink") need(!o.drinkReady, "ALREADY_PREPARED");
        if (action.kind === "serve")
          need(o.foodReady && o.drinkReady, "ORDER_NOT_READY");
        if (action.kind !== "serve")
          need(
            s.stock >
              s.crew.filter(
                (x) => x.task?.kind === "cook" || x.task?.kind === "drink",
              ).length,
            "NO_STOCK",
          );
      } else {
        need(
          !s.crew.some((x) => x.task?.kind === action.kind),
          "TASK_RESERVED",
        );
        if (action.kind === "wash") need(s.dirtyPlates > 0, "NO_DIRTY_PLATES");
        if (action.kind === "restock") need(s.vault >= 2, "VAULT_EMPTY");
      }
      c.task = {
        kind: action.kind,
        ...(o ? { orderId: o.id } : {}),
        steps: [...steps[action.kind]],
        choices: [...new Set(Object.values(steps).flat())],
        index: 0,
        nextAt: now + 500,
        expiresAt: now + 12000,
      };
      break;
    }
    case "step": {
      need(!frozen, "SEARCH_IN_PROGRESS");
      const task = c.task;
      need(task, "NO_TASK");
      need(now >= task.nextAt, "TOO_FAST");
      if (action.value !== task.steps[task.index]) {
        mistake(s, c, now, random);
        task.nextAt = now + 500;
        task.expiresAt = now + 8000;
        break;
      }
      task.index++;
      task.nextAt = now + 500;
      task.expiresAt = now + 8000;
      if (task.index < task.steps.length) break;
      const o = s.orders.find((o) => o.id === task.orderId);
      if (task.kind === "cook" || task.kind === "drink") {
        need(o?.status === "open", "ORDER_UNAVAILABLE");
        need(s.stock > 0, "NO_STOCK");
        s.stock--;
        if (task.kind === "cook") {
          need(s.cleanPlates > 0, "NO_PLATES");
          s.cleanPlates--;
          o.foodReady = true;
        } else o.drinkReady = true;
        c.contribution++;
      }
      if (task.kind === "serve") {
        need(
          o?.status === "open" && o.foodReady && o.drinkReady,
          "ORDER_NOT_READY",
        );
        const tip = Math.max(
          0,
          (now - o.createdAt < 30000 ? 3 : now - o.createdAt < 60000 ? 2 : 1) -
            Math.min(3, s.orderMistakes[o.id] ?? 0),
        );
        o.paid = 10 + tip;
        o.status = "served";
        s.revenue += o.paid;
        c.pouch += o.paid;
        c.contribution += o.paid;
        s.served++;
        s.dirtyPlates++;
      }
      if (task.kind === "wash") {
        need(s.dirtyPlates > 0, "NO_DIRTY_PLATES");
        s.dirtyPlates--;
        s.cleanPlates++;
        c.contribution++;
      }
      if (task.kind === "restock") {
        need(s.vault >= 2, "VAULT_EMPTY");
        s.vault -= 2;
        s.spent += 2;
        s.stock += 8;
        c.contribution++;
      }
      c.task = null;
      break;
    }
    case "deposit":
      need(c.zone === "office", "WRONG_ZONE");
      s.vault += c.pouch;
      c.pouch = 0;
      break;
    case "steal":
      need(c.zone === "office", "WRONG_ZONE");
      need(!c.caught && !frozen && now < s.stealEndsAt!, "THEFT_CLOSED");
      need(!c.pendingTheft && !c.task, "ALREADY_BUSY");
      need(
        Number.isInteger(action.amount) &&
          action.amount >= 1 &&
          action.amount <= 5 &&
          c.stolen + action.amount <= 15,
        "INVALID_AMOUNT",
      );
      need(s.vault >= action.amount, "VAULT_EMPTY");
      c.pendingTheft = { amount: action.amount, readyAt: now + 3000 };
      break;
    case "take": {
      need(c.zone === "office", "WRONG_ZONE");
      need(!frozen && !c.caught && now < s.stealEndsAt!, "THEFT_CLOSED");
      const t = c.pendingTheft;
      need(t && now >= t.readyAt, "THEFT_NOT_READY");
      need(s.vault >= t.amount, "VAULT_EMPTY");
      s.vault -= t.amount;
      c.stolen += t.amount;
      c.pendingTheft = null;
      break;
    }
    case "return":
      need(c.zone === "office", "WRONG_ZONE");
      need(!frozen, "SEARCH_IN_PROGRESS");
      need(
        Number.isInteger(action.amount) &&
          action.amount > 0 &&
          action.amount <= c.stolen,
        "INVALID_AMOUNT",
      );
      c.stolen -= action.amount;
      s.vault += action.amount;
      break;
    case "recover": {
      const d = s.drops.find((d) => d.id === action.dropId);
      need(d && d.zone === c.zone, "DROP_UNAVAILABLE");
      s.vault += d.amount;
      s.drops = s.drops.filter((x) => x.id !== d.id);
      c.contribution++;
      break;
    }
    case "reconcile":
      need(c.zone === "office", "WRONG_ZONE");
      s.lastReconciliation = {
        at: now,
        missing: Math.max(
          0,
          s.revenue -
            s.spent -
            s.vault -
            s.crew.reduce((n, x) => n + x.pouch, 0) -
            s.drops
              .filter((d) => d.source === "pouch")
              .reduce((n, d) => n + d.amount, 0),
        ),
      };
      event(s, now, "The books were reconciled. Check the office report.");
      break;
    case "search": {
      need(
        !s.search && now >= s.searchCooldownUntil && now >= c.searchAvailableAt,
        "SEARCH_COOLDOWN",
      );
      const target = s.crew.find((x) => x.id === action.targetId && x.active);
      need(
        target && target.id !== c.id && target.zone === c.zone,
        "TARGET_UNAVAILABLE",
      );
      s.search = {
        callerId: c.id,
        targetId: target.id,
        supporters: [c.id],
        expiresAt: now + 15000,
        resolvesAt: null,
      };
      s.searchCooldownUntil = now + 45000;
      event(s, now, c.name + " requested a search of " + target.name + ".");
      break;
    }
    case "support": {
      const q = s.search;
      need(q && q.resolvesAt === null, "NO_SEARCH");
      const target = s.crew.find((x) => x.id === q.targetId)!;
      need(target.active, "TARGET_UNAVAILABLE");
      need(
        s.crew
          .filter((x) => q.supporters.includes(x.id))
          .every((x) => x.active && x.zone === target.zone),
        "SUPPORTERS_UNAVAILABLE",
      );
      need(
        c.id !== target.id &&
          c.zone === target.zone &&
          !q.supporters.includes(c.id),
        "CANNOT_SUPPORT",
      );
      q.supporters.push(c.id);
      const quorum = s.crew.filter((x) => x.active).length >= 7 ? 3 : 2;
      if (q.supporters.length >= quorum) {
        q.resolvesAt = now + 3000;
        target.task = null;
      }
      break;
    }
    default:
      throw new RuleError("WRONG_PHASE");
  }
  s.version++;
  return s;
}
export function restaurantView(
  state: RestaurantState,
  ownerId: string,
  now: number,
): RestaurantView {
  const s = advance(state, now),
    c = s.crew.find((x) => x.id === ownerId);
  need(c, "NOT_PARTICIPATING");
  const visible = (x: RestaurantCrew): RestaurantCrewView => ({
    id: x.id,
    name: x.name,
    role: x.role,
    zone: x.zone,
    ready: x.ready,
    active: x.active,
    caught: x.caught,
    contribution: x.contribution,
  });
  return {
    id: s.id,
    hostId: s.hostId,
    phase: s.phase,
    version: s.version,
    serverTime: now,
    durationMs: s.durationMs,
    startedAt: s.startedAt,
    endsAt: s.endsAt,
    stealEndsAt: s.stealEndsAt,
    vault: s.vault,
    revenue: s.revenue,
    spent: s.spent,
    cleanPlates: s.cleanPlates,
    dirtyPlates: s.dirtyPlates,
    stock: s.stock,
    served: s.served,
    crew: s.crew.map(visible),
    orders: s.orders,
    events: s.events,
    drops: s.drops.map(({ source: _source, ...d }) => d),
    search: s.search,
    searchCooldownUntil: s.searchCooldownUntil,
    lastReconciliation: s.lastReconciliation,
    receipts: s.receipts?.filter((r) => r.ownerId === ownerId) ?? null,
    me: {
      ...visible(c),
      pouch: c.pouch,
      stolen: c.stolen,
      canSteal:
        s.phase === "active" &&
        !c.caught &&
        now < s.stealEndsAt! &&
        c.stolen < 15,
      risk:
        c.stolen >= 10 || c.mistakes >= 4
          ? "high"
          : c.stolen >= 5 || c.mistakes >= 2
            ? "medium"
            : "low",
      task: c.task,
      pendingTheft: c.pendingTheft,
      searchAvailableAt: Math.max(c.searchAvailableAt, s.searchCooldownUntil),
      falseAccusations: c.falseAccusations,
    },
  };
}
