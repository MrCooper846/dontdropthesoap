import { describe, it, expect } from "vitest";
import {
  createShift,
  applyAction,
  advance,
  restaurantView,
  type RestaurantState,
} from "../domain/restaurant/model";
import type { RestaurantAction } from "../shared/restaurant/types";

function game(count = 4) {
  let s = createShift("shift", "a", "Alice", 0, 120000);
  let now = 0;
  const ids = Array.from({ length: count }, (_, i) =>
    String.fromCharCode(97 + i),
  );
  function act(id: string, action: RestaurantAction, delay = 0, random = 0.99) {
    now += delay;
    s = applyAction(s, id, action, now, random, id.toUpperCase());
    return s;
  }
  for (const id of ids.slice(1)) act(id, { type: "join" });
  for (const id of ids) act(id, { type: "ready", ready: true });
  act("a", { type: "start" });
  return {
    get s() {
      return s;
    },
    set s(value: RestaurantState) {
      s = value;
    },
    get now() {
      return now;
    },
    act,
    ids,
    keepAlive(time: number) {
      for (const c of s.crew) if (c.active) c.lastSeen = time;
    },
    money(n: number) {
      s.revenue += n;
      s.vault += n;
    },
    finish() {
      for (const c of s.crew) if (c.active) c.lastSeen = s.endsAt!;
      s = advance(s, s.endsAt!);
      return s;
    },
  };
}
function perform(
  g: ReturnType<typeof game>,
  id: string,
  kind: "cook" | "drink" | "serve" | "wash" | "restock",
  orderId?: string,
) {
  g.act(id, { type: "begin", kind, ...(orderId ? { orderId } : {}) });
  const sequence = [...g.s.crew.find((c) => c.id === id)!.task!.steps];
  for (const value of sequence) g.act(id, { type: "step", value }, 500);
}
function meal(g: ReturnType<typeof game>) {
  const id = g.s.orders.find((o) => o.status === "open")!.id;
  g.act("a", { type: "move", zone: "kitchen" });
  perform(g, "a", "cook", id);
  g.act("c", { type: "move", zone: "bar" });
  perform(g, "c", "drink", id);
  perform(g, "b", "serve", id);
  return id;
}
function wealth(s: RestaurantState) {
  return (
    s.vault +
    s.crew.reduce((n, c) => n + c.pouch + c.stolen, 0) +
    s.drops.reduce((n, d) => n + d.amount, 0)
  );
}
function sumReceipts(s: RestaurantState) {
  return s.receipts!.reduce((n, r) => n + r.total, 0);
}
function steal(g: ReturnType<typeof game>, owner = "a", amount = 5) {
  g.act(owner, { type: "move", zone: "office" });
  g.act(owner, { type: "steal", amount });
  g.act(owner, { type: "take" }, 3000);
}
function search(g: ReturnType<typeof game>, target = "a") {
  g.act("b", { type: "move", zone: "office" });
  g.act("c", { type: "move", zone: "office" });
  g.act("b", { type: "search", targetId: target });
  g.act("c", { type: "support" });
}

describe("restaurant shift domain", () => {
  it("requires a ready 4–8 person crew covering every role and keeps inputs immutable", () => {
    const s = createShift("s", "a", "A", 0),
      original = structuredClone(s);
    const joined = applyAction(s, "b", { type: "join" }, 0, 0.5, "B");
    expect(s).toEqual(original);
    expect(joined.crew[1]).toMatchObject({ role: "waiter", name: "B" });
    expect(() => applyAction(joined, "a", { type: "start" }, 0)).toThrow();
    const g = game();
    expect(g.s.orders).toHaveLength(2);
    expect(g.s.crew.map((c) => c.role)).toEqual([
      "chef",
      "waiter",
      "barman",
      "runner",
    ]);
    expect(() => applyAction(g.s, "e", { type: "join" }, 0)).toThrow();
    expect(() => createShift("s", "a", "A", 0, 119999)).toThrow();
    expect(() => createShift("s", "a", "A", 0, 900001)).toThrow();
  });
  it("clears readiness after role/join/leave and transfers waiting host", () => {
    let s = createShift("s", "a", "A", 0);
    s = applyAction(s, "b", { type: "join" }, 0, 0.5, "B");
    s = applyAction(s, "a", { type: "ready", ready: true }, 0);
    s = applyAction(s, "b", { type: "role", role: "runner" }, 0);
    expect(s.crew.every((c) => !c.ready)).toBe(true);
    s = applyAction(s, "a", { type: "leave" }, 0);
    expect(s.hostId).toBe("b");
  });
  it("rejects readiness with a missing role, unauthorised start, duplicates and ninth guest", () => {
    let s = createShift("s", "a", "A", 0);
    for (const id of ["b", "c", "d", "e", "f", "g", "h"])
      s = applyAction(s, id, { type: "join" }, 0);
    expect(() => applyAction(s, "i", { type: "join" }, 0)).toThrow();
    expect(() => applyAction(s, "a", { type: "join" }, 0)).toThrow();
    expect(() => applyAction(s, "b", { type: "start" }, 0)).toThrow();
    for (const c of s.crew) {
      c.role = "chef";
      c.ready = true;
    }
    expect(() => applyAction(s, "a", { type: "start" }, 0)).toThrow();
  });
  it("produces food and drink, requires balanced serving, earns server-derived revenue, deposits, washes and restocks", () => {
    const g = game();
    const id = meal(g);
    expect(g.s.orders.find((o) => o.id === id)).toMatchObject({
      status: "served",
      paid: 13,
    });
    expect(g.s.revenue).toBe(13);
    expect(g.s.vault).toBe(0);
    expect(g.s.crew[1].pouch).toBe(13);
    expect(g.s.stock).toBe(6);
    g.act("b", { type: "move", zone: "office" });
    g.act("b", { type: "deposit" });
    expect(g.s.vault).toBe(13);
    g.act("d", { type: "move", zone: "washup" });
    perform(g, "d", "wash");
    expect(g.s.cleanPlates).toBe(4);
    expect(g.s.dirtyPlates).toBe(0);
    g.act("d", { type: "move", zone: "stockroom" });
    perform(g, "d", "restock");
    expect(g.s.spent).toBe(2);
    expect(g.s.stock).toBe(14);
    expect(wealth(g.s)).toBe(g.s.revenue - g.s.spent);
    const final = g.finish();
    expect(sumReceipts(final)).toBe(11);
    expect(advance(final, 999999)).toEqual(final);
  });
  it("rejects wrong role/zone, missing supplies and unprepared serving without changing inputs", () => {
    const g = game(),
      id = g.s.orders[0].id,
      prior = structuredClone(g.s);
    expect(() =>
      g.act("b", { type: "begin", kind: "cook", orderId: id }),
    ).toThrow();
    expect(g.s).toEqual(prior);
    expect(() =>
      g.act("a", { type: "begin", kind: "cook", orderId: id }),
    ).toThrow();
    expect(() =>
      g.act("b", { type: "begin", kind: "serve", orderId: id }),
    ).toThrow();
    g.act("a", { type: "move", zone: "kitchen" });
    g.s.stock = 0;
    expect(() =>
      g.act("a", { type: "begin", kind: "cook", orderId: id }),
    ).toThrow();
  });
  it("reserves an order task against duplicate workers and releases reservation on movement", () => {
    const g = game(5);
    g.s.crew.find((c) => c.id === "e")!.role = "chef";
    const id = g.s.orders[0].id;
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("e", { type: "move", zone: "kitchen" });
    g.act("a", { type: "begin", kind: "cook", orderId: id });
    expect(() =>
      g.act("e", { type: "begin", kind: "cook", orderId: id }),
    ).toThrow();
    g.act("a", { type: "move", zone: "bar" });
    g.act("e", { type: "begin", kind: "cook", orderId: id });
    expect(g.s.crew.find((c) => c.id === "e")!.task).not.toBeNull();
  });
  it("rejects instant/repeated steps; incorrect balance does not complete or create money", () => {
    const g = game(),
      id = g.s.orders[0].id;
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("a", { type: "begin", kind: "cook", orderId: id });
    expect(() => g.act("a", { type: "step", value: "chop" })).toThrow();
    g.act("a", { type: "step", value: "plate" }, 500);
    expect(g.s.crew[0].task!.index).toBe(0);
    expect(g.s.crew[0].mistakes).toBe(1);
    expect(g.s.revenue).toBe(0);
    g.act("a", { type: "step", value: "chop" }, 500);
    expect(() => g.act("a", { type: "step", value: "chop" })).toThrow();
    expect(() => g.act("a", { type: "deposit" })).toThrow();
  });
  it("expires abandoned tasks and caps open orders/total orders", () => {
    const g = game();
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("a", { type: "begin", kind: "cook", orderId: g.s.orders[0].id });
    g.keepAlive(13000);
    g.s = advance(g.s, 13000);
    expect(g.s.crew[0].task).toBeNull();
    expect(
      g.s.orders.filter((o) => o.status === "open").length,
    ).toBeLessThanOrEqual(4);
    g.s.durationMs = 900000;
    g.s.endsAt = 900000;
    g.s.stealEndsAt = 885000;
    for (let t = 14000; t < 900000; t += 10000) {
      g.keepAlive(t);
      g.s = advance(g.s, t);
    }
    expect(g.s.orders.length).toBeLessThanOrEqual(40);
    expect(g.s.orders.some((o) => o.status === "expired")).toBe(true);
  });
  it("does not allow theft without office, funds, preparation delay or valid bounded amount", () => {
    const g = game();
    g.money(50);
    expect(() => g.act("a", { type: "steal", amount: 5 })).toThrow();
    g.act("a", { type: "move", zone: "office" });
    for (const amount of [-1, 0, 6, NaN, 1.5, Infinity])
      expect(() => g.act("a", { type: "steal", amount })).toThrow();
    g.act("a", { type: "steal", amount: 5 });
    expect(() => g.act("a", { type: "take" })).toThrow();
    g.act("a", { type: "move", zone: "dining" });
    expect(g.s.crew[0].pendingTheft).toBeNull();
    steal(g);
    steal(g);
    steal(g);
    expect(g.s.crew[0].stolen).toBe(15);
    expect(() => g.act("a", { type: "steal", amount: 1 })).toThrow();
    expect(wealth(g.s)).toBe(50);
  });
  it("reconciliation reports only missing funds and player views hide all other inventories/tasks/theft", () => {
    const g = game();
    g.money(20);
    steal(g);
    g.act("a", { type: "reconcile" });
    const view = restaurantView(g.s, "b", g.now);
    expect(view.lastReconciliation?.missing).toBe(5);
    expect(Object.keys(view.lastReconciliation!)).toEqual(["at", "missing"]);
    expect(view.crew[0]).not.toHaveProperty("stolen");
    expect(view.crew[0]).not.toHaveProperty("pendingTheft");
    expect(view.crew[0]).not.toHaveProperty("task");
    expect(view.me.stolen).toBe(0);
    const final = g.finish();
    expect(restaurantView(final, "b", 120000).receipts).toHaveLength(1);
    expect(restaurantView(final, "b", 120000).receipts![0].ownerId).toBe("b");
    expect(final.receipts!.find((r) => r.ownerId === "a")!.theft).toBe(5);
    expect(sumReceipts(final)).toBe(20);
  });
  it("approved guilty search freezes escape/return/take, restores funds, blocks repeat theft and redistributes exact penalties", () => {
    const g = game();
    g.money(101);
    steal(g);
    search(g);
    for (const action of [
      { type: "move", zone: "dining" },
      { type: "return", amount: 5 },
      { type: "take" },
      { type: "leave" },
    ] as RestaurantAction[])
      expect(() => g.act("a", action)).toThrow();
    g.act("d", { type: "move", zone: "office" }, 3000);
    expect(g.s.crew[0].caught).toBe(true);
    expect(g.s.vault).toBe(101);
    expect(g.s.crew[0].stolen).toBe(0);
    expect(() => g.act("a", { type: "steal", amount: 1 })).toThrow();
    const final = g.finish();
    expect(sumReceipts(final)).toBe(101);
    expect(
      final.receipts!.find((r) => r.ownerId === "a")!.penalty,
    ).toBeGreaterThan(0);
  });
  it("requires three supporters in a seven-person shift and never accepts target self-support", () => {
    const g = game(7);
    g.money(20);
    steal(g);
    search(g);
    expect(g.s.search!.resolvesAt).toBeNull();
    expect(() => g.act("a", { type: "support" })).toThrow();
    g.act("d", { type: "move", zone: "office" });
    g.act("d", { type: "support" });
    expect(g.s.search!.resolvesAt).toBe(g.now + 3000);
  });
  it("false searches reveal no innocent inventory and apply caller cooldown/penalty", () => {
    const g = game();
    g.money(100);
    g.act("a", { type: "move", zone: "office" });
    search(g);
    g.act("d", { type: "move", zone: "office" }, 3000);
    expect(g.s.crew[1].falseAccusations).toBe(1);
    expect(g.s.crew[1].searchAvailableAt).toBe(g.now + 90000);
    expect(g.s.events.at(-1)!.text).not.toMatch(
      /pouch|carrying|stolen:|0 noodles/,
    );
    expect(() => g.act("b", { type: "search", targetId: "a" })).toThrow();
    const final = g.finish();
    expect(final.receipts!.find((r) => r.ownerId === "b")!.penalty).toBe(2);
    expect(sumReceipts(final)).toBe(100);
  });
  it("search expires unsupported and rejects supporters no longer beside the target", () => {
    const g = game();
    g.act("a", { type: "move", zone: "office" });
    g.act("b", { type: "move", zone: "office" });
    g.act("b", { type: "search", targetId: "a" });
    g.act("b", { type: "move", zone: "bar" });
    g.act("c", { type: "move", zone: "office" });
    expect(() => g.act("c", { type: "support" })).toThrow();
    g.s = advance(g.s, g.now + 15000);
    expect(g.s.search).toBeNull();
  });
  it("mistake drops hide their source, can be recovered by anyone, and auto-recover without losing money", () => {
    const g = game();
    g.money(20);
    steal(g);
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("a", { type: "begin", kind: "cook", orderId: g.s.orders[0].id });
    g.act("a", { type: "step", value: "wrong" }, 500, 0);
    expect(g.s.drops[0].amount).toBe(5);
    expect(restaurantView(g.s, "b", g.now).drops[0]).not.toHaveProperty(
      "source",
    );
    expect(wealth(g.s)).toBe(20);
    g.act("b", { type: "move", zone: "kitchen" });
    g.act("b", { type: "recover", dropId: g.s.drops[0].id });
    expect(g.s.vault).toBe(20);
    expect(g.s.drops).toHaveLength(0);
    g.s.drops.push({
      id: "fixture",
      zone: "office",
      amount: 3,
      expiresAt: g.now + 1000,
      source: "pouch",
    });
    g.s.vault -= 3;
    g.s = advance(g.s, g.now + 1000);
    expect(wealth(g.s)).toBe(20);
    expect(g.s.vault).toBe(20);
  });
  it("voluntary/offline departures refund both inventories and reduce participation weight", () => {
    const g = game();
    g.money(100);
    steal(g);
    g.act("a", { type: "leave" });
    expect(g.s.vault).toBe(100);
    expect(g.s.crew[0].stolen).toBe(0);
    g.s.crew[1].pouch = 7;
    g.s.vault -= 7;
    g.keepAlive(50000);
    g.s.crew[1].lastSeen = 0;
    g.s = advance(g.s, 50000);
    expect(g.s.crew[1].active).toBe(false);
    expect(g.s.crew[1].leftAt).toBe(45000);
    expect(g.s.vault).toBe(100);
    const final = g.finish();
    expect(sumReceipts(final)).toBe(100);
    expect(final.receipts!.find((r) => r.ownerId === "a")!.base).toBeLessThan(
      final.receipts!.find((r) => r.ownerId === "d")!.base,
    );
  });
  it("closes theft for the final 15 seconds, resolves approved searches at deadline, and never pays twice", () => {
    const g = game();
    g.money(31);
    g.keepAlive(105000);
    g.s = advance(g.s, 105000);
    expect(() =>
      applyAction(g.s, "a", { type: "steal", amount: 1 }, 105000),
    ).toThrow();
    g.s.crew[0].zone = "office";
    g.s.crew[0].stolen = 5;
    g.s.vault -= 5;
    g.s.search = {
      callerId: "b",
      targetId: "a",
      supporters: ["b", "c"],
      expiresAt: 130000,
      resolvesAt: 121000,
    };
    const final = g.finish();
    expect(final.crew[0].caught).toBe(true);
    expect(sumReceipts(final)).toBe(31);
    expect(advance(final, 200000)).toEqual(final);
    expect(() =>
      applyAction(final, "a", { type: "deposit" }, 200000),
    ).toThrow();
  });
  it("retains every noodle when all teammates are penalised and rejects nonfinite input", () => {
    const g = game();
    g.money(17);
    for (const c of g.s.crew) c.caught = true;
    const final = g.finish();
    expect(sumReceipts(final)).toBe(17);
    expect(final.receipts!.every((r) => r.penalty === 0)).toBe(true);
    expect(() => advance(g.s, NaN)).toThrow();
    expect(() => applyAction(g.s, "a", { type: "cancel" }, 0, NaN)).toThrow();
  });

  it("expires waiting-room guests, transfers host, and closes stale lobbies after fifteen minutes", () => {
    let s = createShift("s", "a", "A", 0);
    s = applyAction(s, "b", { type: "join" }, 0, 0.5, "B");
    s.crew[1].lastSeen = 40000;
    s = advance(s, 46000);
    expect(s.crew[0].active).toBe(false);
    expect(s.hostId).toBe("b");
    expect(s.crew[1].active).toBe(true);
    s = advance(s, 900000);
    expect(s.phase).toBe("finished");
    expect(sumReceipts(s)).toBe(0);
    expect(() => applyAction(s, "c", { type: "join" }, 900000)).toThrow();
  });
  it("charges meal-quality mistakes to that order without client-chosen rewards", () => {
    const g = game(),
      id = g.s.orders[0].id;
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("a", { type: "begin", kind: "cook", orderId: id });
    g.act("a", { type: "step", value: "wrong" }, 500);
    for (const value of ["chop", "stir", "plate"])
      g.act("a", { type: "step", value }, 500);
    g.act("c", { type: "move", zone: "bar" });
    perform(g, "c", "drink", id);
    perform(g, "b", "serve", id);
    expect(g.s.orders[0].paid).toBe(12);
    meal(g);
    expect(
      g.s.orders.filter((o) => o.status === "served").map((o) => o.paid),
    ).toEqual([12, 13]);
  });
  it("handles delayed final advancement using offline participation cutoffs and refunding unheld theft", () => {
    const g = game();
    g.money(79);
    steal(g);
    g.s = advance(g.s, 200000);
    expect(g.s.phase).toBe("finished");
    expect(g.s.crew.every((c) => !c.active)).toBe(true);
    expect(g.s.receipts!.every((r) => r.theft === 0)).toBe(true);
    expect(sumReceipts(g.s)).toBe(79);
  });
  it("settles exact deterministic remainders across sizes and penalty combinations, including partial participation", () => {
    for (let count = 4; count <= 8; count++)
      for (let money = 0; money <= 29; money++) {
        const g = game(count);
        g.money(money);
        g.s.crew.forEach((c, i) => {
          c.falseAccusations = i % 3;
          c.caught = i % 4 === 0;
          if (i === count - 1) {
            c.active = false;
            c.leftAt = 30000;
          }
        });
        const one = g.finish();
        expect(sumReceipts(one)).toBe(money);
        expect(
          one.receipts!.every((r) => Number.isInteger(r.total) && r.total >= 0),
        ).toBe(true);
        expect(advance(one, 999999)).toEqual(one);
        expect(restaurantView(one, "a", 120000).receipts).toHaveLength(1);
      }
  });

  it("never pays waiting-room leavers base remainders or penalty redistribution", () => {
    for (const caught of [false, true]) {
      let s = createShift("s", "a", "A", 0, 120000);
      s = applyAction(s, "0", { type: "join" }, 0);
      s = applyAction(s, "0", { type: "leave" }, 0);
      for (const id of ["b", "c", "d"])
        s = applyAction(s, id, { type: "join" }, 0);
      for (const c of s.crew.filter((c) => c.active))
        s = applyAction(s, c.id, { type: "ready", ready: true }, 0);
      s = applyAction(s, "a", { type: "start" }, 0);
      s.vault = s.revenue = 101;
      s.crew.find((c) => c.id === "a")!.caught = caught;
      for (const c of s.crew.filter((c) => c.active)) c.lastSeen = 120000;
      const final = advance(s, 120000);
      expect(final.receipts!.find((r) => r.ownerId === "0")).toMatchObject({
        base: 0,
        redistribution: 0,
        total: 0,
      });
      expect(sumReceipts(final)).toBe(101);
    }
  });
  it("prevents an approved suspect shedding evidence via task mistakes, then permits work after resolution", () => {
    const g = game();
    g.money(20);
    steal(g);
    g.act("a", { type: "move", zone: "kitchen" });
    g.act("b", { type: "move", zone: "kitchen" });
    g.act("c", { type: "move", zone: "kitchen" });
    g.act("b", { type: "search", targetId: "a" });
    g.act("c", { type: "support" });
    expect(() =>
      g.act("a", { type: "begin", kind: "cook", orderId: g.s.orders[0].id }),
    ).toThrow();
    expect(() =>
      g.act("a", { type: "step", value: "wrong" }, 500, 0),
    ).toThrow();
    expect(g.s.crew[0].stolen).toBe(5);
    expect(g.s.drops).toHaveLength(0);
    g.act("d", { type: "move", zone: "kitchen" }, 3000);
    expect(g.s.crew[0].caught).toBe(true);
    expect(g.s.crew[1].falseAccusations).toBe(0);
    g.act("a", { type: "begin", kind: "cook", orderId: g.s.orders[0].id });
    expect(g.s.crew[0].task).not.toBeNull();
    expect(wealth(g.s)).toBe(20);
  });
});
