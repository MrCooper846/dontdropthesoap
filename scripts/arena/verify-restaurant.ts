import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import { Store } from "./store";
import { settings } from "./config";
import { Player, labelledSelect } from "./player";
import type {
  RestaurantView,
  RestaurantZone,
} from "../../shared/restaurant/types";

// All mutations below go through the visible UI. Authenticated GETs only observe
// server deadlines and private balances; no fixture state or clocks are injected.
async function main() {
  const store = new Store(settings().database);
  const run = await store.run("restaurant-first-playable-acceptance", {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
  });
  const browser = await chromium.launch({ headless: true });
  const players = ["chef", "waiter", "barman", "runner"].map(
    (role) =>
      new Player(store, run, "Acceptance " + role, "restaurant-verifier"),
  );
  const [chef, waiter, barman, runner] = players;
  let shiftId = "";
  let passed = false;
  const button = (p: Player, name: string) =>
    p.page.getByRole("button", { name, exact: true });
  async function view(
    p: Player,
  ): Promise<{ shift: RestaurantView; wallet: number }> {
    const response = await p.page.request.get("/api/v1/restaurant/" + shiftId);
    assert.equal(response.status(), 200);
    return response.json();
  }
  async function until(check: () => Promise<boolean>, timeout = 15000) {
    const end = Date.now() + timeout;
    while (!(await check())) {
      assert.ok(Date.now() < end, "Restaurant condition timed out");
      // Keep all four real sessions participating, including during cooldowns.
      await Promise.all(players.map((p) => view(p)));
      await delay(300);
    }
  }
  async function move(p: Player, zone: RestaurantZone) {
    await button(
      p,
      "Move to " +
        {
          dining: "Dining room",
          kitchen: "Kitchen",
          bar: "Bar",
          washup: "Wash-up",
          stockroom: "Stockroom",
          office: "Office",
        }[zone],
    ).click();
    await until(async () => (await view(p)).shift.me.zone === zone);
  }
  async function task(p: Player, kind: string, orderId?: string) {
    const scope = orderId
      ? p.page.getByTestId("restaurant-order-" + orderId)
      : p.page;
    await scope
      .getByRole("button", {
        name: orderId ? new RegExp("^(" + kind + ")") : kind,
        exact: !orderId,
      })
      .click();
    await until(async () => !!(await view(p)).shift.me.task);
    while (true) {
      const snapshot = (await view(p)).shift;
      const current = snapshot.me.task;
      if (!current) break;
      await delay(Math.max(0, current.nextAt - snapshot.serverTime + 60));
      await button(p, current.steps[current.index]).click();
      await until(async () => {
        const next = (await view(p)).shift.me.task;
        return !next || next.index > current.index;
      });
    }
  }
  try {
    for (const p of players) {
      await p.open(browser);
      await p.page.goto("/restaurant");
    }
    await labelledSelect(chef.page, "Shift duration").selectOption("120");
    const created = chef.page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/v1/restaurant" &&
        r.request().method() === "POST",
    );
    await button(chef, "Create shift").click();
    const creation = await (await created).json();
    shiftId = creation.shift.id;
    for (const p of players.slice(1)) {
      await p.page.goto("/restaurant?shift=" + shiftId);
      await button(p, "Join shift").click();
    }
    for (let i = 0; i < players.length; i++) {
      const role = ["chef", "waiter", "barman", "runner"][i];
      await labelledSelect(players[i].page, "Your role").selectOption(role);
      await until(async () => (await view(players[i])).shift.me.role === role);
    }
    for (const p of players) {
      await button(p, "Ready up").click();
      await until(async () => (await view(p)).shift.me.ready);
    }
    await button(chef, "Start shift").click();
    await until(async () => (await view(chef)).shift.phase === "active");
    const opening = await Promise.all(players.map(view));
    await Promise.all([move(chef, "kitchen"), move(barman, "bar")]);
    const order = opening[0].shift.orders.find((o) => o.status === "open");
    assert.ok(order, "Shift starts with a real customer order");
    await Promise.all([
      task(chef, "Cook for table", order.id),
      task(barman, "Mix for table", order.id),
    ]);
    await move(waiter, "dining");
    await task(waiter, "Serve", order.id);
    assert.ok(
      (await view(waiter)).shift.me.pouch > 0,
      "Serving earns an undeposited pouch",
    );
    const beforeWash = (await view(runner)).shift;
    assert.equal(
      beforeWash.orders.find((o) => o.id === order.id)?.status,
      "served",
    );
    await move(runner, "washup");
    await task(runner, "Wash plates");
    const washed = (await view(runner)).shift;
    assert.equal(washed.cleanPlates, beforeWash.cleanPlates + 1);
    assert.equal(washed.dirtyPlates, beforeWash.dirtyPlates - 1);
    await move(waiter, "office");
    const beforeDeposit = (await view(waiter)).shift;
    await button(waiter, "Deposit takings").click();
    await until(async () => (await view(waiter)).shift.me.pouch === 0);
    const deposited = (await view(waiter)).shift;
    assert.equal(deposited.me.pouch, 0);
    assert.equal(deposited.vault, beforeDeposit.vault + beforeDeposit.me.pouch);
    await Promise.all([move(chef, "office"), move(barman, "office")]);
    await chef.page.getByLabel("Amount", { exact: true }).fill("1");
    await button(chef, "Prepare theft").click();
    await until(async () => {
      const s = (await view(chef)).shift;
      return !!s.me.pendingTheft && s.serverTime >= s.me.pendingTheft.readyAt;
    });
    await button(chef, "Take noodles").click();
    await until(async () => (await view(chef)).shift.me.stolen === 1);
    await button(waiter, "Search Acceptance chef").click();
    await button(barman, "Support search").click();
    await until(async () => (await view(chef)).shift.me.caught);
    const caught = (await view(chef)).shift;
    assert.equal(caught.me.stolen, 0, "Caught funds return to vault");
    assert.equal(caught.me.canSteal, false, "Caught thief cannot steal again");
    await expect(button(chef, "Prepare theft")).toBeDisabled();
    await until(async () => {
      const s = (await view(waiter)).shift;
      return s.serverTime >= s.searchCooldownUntil;
    }, 60000);
    await button(waiter, "Search Acceptance barman").click();
    await button(chef, "Support search").click();
    await until(
      async () => (await view(waiter)).shift.me.falseAccusations === 1,
    );
    await chef.page.reload();
    await expect(
      chef.page.getByText("Acceptance chef", { exact: false }).first(),
    ).toBeVisible();
    assert.equal(
      (await view(chef)).shift.me.caught,
      true,
      "Reload recovers caught state",
    );
    await until(
      async () => (await view(chef)).shift.phase === "finished",
      130000,
    );
    const finished = await Promise.all(players.map(view));
    const receipts = finished.flatMap((s) => s.shift.receipts ?? []);
    assert.equal(
      receipts.length,
      4,
      "Each player receives their private receipt",
    );
    const sum = receipts.reduce((total, r) => total + r.total, 0);
    const final = finished[0].shift;
    assert.equal(
      sum,
      final.revenue - final.spent,
      "Payouts conserve earned noodles after expenses",
    );
    for (let i = 0; i < players.length; i++) {
      assert.equal(
        finished[i].wallet - opening[i].wallet,
        receipts.find((r) => r.ownerId === finished[i].shift.me.id)!.total,
      );
      const wallet = finished[i].wallet;
      await players[i].page.reload();
      assert.equal(
        (await view(players[i])).wallet,
        wallet,
        "Wallet payout persists and is not paid twice",
      );
      await players[i].observe();
    }
    await store.event(run, "restaurant.acceptance", "verifier", {
      shiftId,
      allRoles: true,
      deposit: true,
      theft: true,
      caught: true,
      falseAccusation: true,
      reload: true,
      payoutConservation: true,
      receipts: receipts.map(({ ownerId, total }) => ({ ownerId, total })),
    });
    passed = true;
    console.log(
      JSON.stringify({ runId: run, shiftId, restaurantAcceptance: "PASS" }),
    );
  } catch (error) {
    await Promise.allSettled(
      players.filter((p) => p.page).map((p) => p.observe()),
    );
    await store.issue(run, "Restaurant acceptance failed", "needs-triage", {
      shiftId,
      error: String(error),
    });
    throw error;
  } finally {
    await Promise.allSettled(players.map((p) => p.close()));
    await browser.close();
    await store.finish(run, passed ? "passed" : "failed");
    await store.db.end();
  }
}
main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
