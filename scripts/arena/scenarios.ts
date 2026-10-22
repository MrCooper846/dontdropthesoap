import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "@playwright/test";
import { Player } from "./player";
import { Store } from "./store";
import { walk, pane, settings } from "../../tests/browser/yard/helpers";
import { origin } from "./config";

async function until(check: () => Promise<boolean>, label: string, ms = 45000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (await check()) return;
    await delay(150);
  }
  throw Error("Timed out: " + label);
}
export async function verifyMatch(
  store: Store,
  run: string,
  players: Player[],
  id: string,
  expected: number[],
  versions: (string | null)[],
) {
  const views = await Promise.all(
    players.map((p) => p.get(`/matches/${id}/observation`)),
  );
  const projection = (m: any) => ({
    phase: m.phase,
    round: m.round,
    seats: m.seats,
    results: m.results,
  });
  assert.equal(views[0].phase, "finished", "Match must finish");
  assert.equal(views[0].round, 5, "Exactly five rounds");
  for (const view of views)
    assert.deepEqual(
      projection(view),
      projection(views[0]),
      "Players must agree on final state",
    );
  assert.equal(views[0].seats.length, 2, "No ghost or duplicate seats");
  for (let i = 0; i < players.length; i++) {
    const seat = views[i].seats.find((s: any) => s.id === views[i].ownSeatId);
    assert.ok(seat, "Owner must retain their seat");
    assert.equal(seat.score, expected[i], "Independent expected score");
    assert.equal(seat.timeouts, 0, "Decisions must execute without timeouts");
    assert.equal(seat.abandoned, false, "Live player must not be abandoned");
    if (versions[i]) {
      assert.equal(seat.kind, "visual");
      assert.equal(
        seat.botVersionId,
        versions[i],
        "Published revision must remain pinned",
      );
    } else assert.equal(seat.kind, "human");
  }
  assert.equal(
    views[0].results.length,
    5,
    "One result per round for this pair",
  );
  const persisted = await store.db.query(
    "SELECT phase,state_json FROM matches WHERE id=$1",
    [id],
  );
  assert.equal(persisted.rows[0].phase, "finished");
  assert.deepEqual(
    persisted.rows[0].state_json.seats.map((s: any) => s.score),
    views[0].seats.map((s: any) => s.score),
    "Persisted scores must match player views",
  );
  const results = await store.db.query(
    "SELECT count(*)::int AS n FROM round_results WHERE match_id=$1",
    [id],
  );
  assert.equal(results.rows[0].n, 5, "Results persist exactly once");
  await store.event(run, "match.verified", null, {
    matchId: id,
    expected,
    views,
  });
}
async function uiTable(
  a: Player,
  b: Player,
  circle: { name: string; x: number; y: number; id: string },
  bots?: [{ id: string; versionId: string }, { id: string; versionId: string }],
) {
  await Promise.all([a, b].map((p) => walk(p.page, circle.x, circle.y)));
  await pane(a.page, "Tables");
  await a.page.locator(".circle-card").filter({ hasText: circle.name }).click();
  if (bots) await a.page.getByLabel("Enter as").selectOption(bots[0].id);
  await settings(a.page);
  await a.page.getByLabel("Rounds", { exact: true }).fill("5");
  await a.page.getByLabel("Decision seconds", { exact: true }).fill("10");
  await a.page.getByLabel("Seats", { exact: true }).fill("2");
  await a.page.locator(".yard-settings > summary").click();
  await a.page
    .getByRole("button", { name: "Create circle match", exact: true })
    .click();
  await expect(
    a.page.getByRole("button", { name: "Ready up", exact: true }),
  ).toBeVisible();
  let id: string | null = null;
  await until(async () => {
    const yard = await a.get("/yard");
    id = yard.circles.find((c: any) => c.id === circle.id).matchId;
    return !!id;
  }, "created match becomes visible in yard");
  assert.ok(id, "UI creation must create a circle match");
  await a.command(id, "match.configure", {
    rounds: 5,
    decisionMs: 10000,
    revealMs: 1000,
    maxSeats: 2,
  });
  await pane(b.page, "Tables");
  await b.page.locator(".circle-card").filter({ hasText: circle.name }).click();
  if (bots) await b.page.getByLabel("Enter as").selectOption(bots[1].id);
  await b.page
    .getByRole("button", { name: "Join circle", exact: true })
    .click();
  await expect(
    b.page.getByRole("button", { name: "Ready up", exact: true }),
  ).toBeVisible();
  await a.store.event(a.run, "match.created", a.id, {
    matchId: id,
    circle: circle.id,
    bots,
  });
  return id as string;
}
async function humanMatch(store: Store, run: string, a: Player, b: Player) {
  const id = await uiTable(a, b, {
    id: "yard-circle-4",
    name: "Snake Pit",
    x: 720,
    y: 450,
  });
  await Promise.all(
    [a, b].map((p) =>
      p.page.getByRole("button", { name: "Ready up", exact: true }).click(),
    ),
  );
  // A reload keeps the same identity/seat and must recover the current match.
  await b.page.reload();
  await b.page.getByRole("button", { name: "Enter yard", exact: true }).click();
  await expect(b.page.getByTestId("yard-canvas")).toHaveAttribute(
    "data-player-visible",
    "true",
    { timeout: 30000 },
  );
  await pane(b.page, "Tables");
  await b.page.locator(".circle-card").filter({ hasText: "Snake Pit" }).click();
  const reconnect = await b.get(`/matches/${id}/observation`);
  assert.ok(reconnect.ownSeatId, "Reload must retain seat");
  await a.page.getByRole("button", { name: "Start game", exact: true }).click();
  const play = async (p: Player, move: "Cooperate" | "Betray") => {
    for (let round = 1; round <= 5; round++) {
      await until(async () => {
        const m = await p.get(`/matches/${id}/observation`);
        return m.round === round && m.phase === "collecting";
      }, `human round ${round}`);
      await p.page.getByRole("button", { name: move, exact: true }).click();
      await store.event(run, "human.move", p.id, { matchId: id, round, move });
    }
  };
  // Opening the table after reload is deliberate UI recovery, rather than changing state through a back door.
  const my = b.page.getByRole("button", { name: /My table/ });
  if (await my.isVisible()) await my.click();
  await Promise.all([play(a, "Cooperate"), play(b, "Betray")]);
  await until(
    async () =>
      (await a.get(`/matches/${id}/observation`)).phase === "finished",
    "human completion",
  );
  await verifyMatch(store, run, [a, b], id, [-10, 15], [null, null]);
}
async function botMatch(
  store: Store,
  run: string,
  a: Player,
  b: Player,
  mirror: boolean,
  circle = { id: "yard-circle-3", name: "Noodle Exchange", x: 240, y: 450 },
) {
  const bots = await Promise.all([
    a.publish(
      mirror ? "tit-for-tat" : "cooperate",
      "Arena " + (mirror ? "mirror" : "cooperator"),
    ),
    b.publish("betray", "Arena betrayer"),
  ]);
  await Promise.all([a.backToYard(), b.backToYard()]);
  const id = await uiTable(a, b, circle, bots);
  // Publishing a newer revision after deployment must not change the seated version.
  const newer = await a.publish("betray", "Arena revised", bots[0].id);
  assert.notEqual(
    newer.versionId,
    bots[0].versionId,
    "Revision must be immutable",
  );
  await a.backToYard();
  await Promise.all(
    [a, b].map((p) => p.command(id, "seat.ready", { ready: true })),
  );
  await a.command(id, "match.start", {});
  await until(
    async () =>
      (await a.get(`/matches/${id}/observation`)).phase === "finished",
    "bot versus bot completion",
  );
  await verifyMatch(
    store,
    run,
    [a, b],
    id,
    mirror ? [-6, -1] : [-10, 15],
    bots.map((bot) => bot.versionId),
  );
  for (const p of [a, b]) {
    const m = await p.get(`/matches/${id}/observation`);
    const feedback = await p.get(
      `/matches/${id}/seats/${m.ownSeatId}/visual-feedback`,
    );
    await store.event(run, "bot.feedback", p.id, { matchId: id, feedback });
  }
}
async function joinRace(store: Store, run: string, players: Player[]) {
  await Promise.all(
    players.map(async (p) => {
      await p.backToYard();
      await walk(p.page, 720, 450);
    }),
  );
  const [host, ...contenders] = players;
  const match = await host.resource("/matches", {
    circleId: "yard-circle-4",
    mode: "mixed",
    settings: { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
  });
  const attempts = await Promise.all(
    contenders.map(async (p) => {
      const s = await p.get("/session"),
        { key } = await p.post("/command-keys", {});
      const response = await p.page.request.post(
        `/api/v1/matches/${match.id}/join`,
        {
          headers: { Origin: origin, "x-csrf-token": s.csrfToken },
          data: {
            commandId: randomUUID(),
            key,
            controllerEpoch: s.controllerEpoch,
          },
        },
      );
      return {
        player: p.id,
        status: response.status(),
        body: await response.json(),
      };
    }),
  );
  await store.event(run, "join.race", null, { matchId: match.id, attempts });
  assert.equal(
    attempts.filter((a) => a.status >= 200 && a.status < 300).length,
    1,
    "Exactly one contender may take the final seat",
  );
  const view = await host.get(`/matches/${match.id}/observation`);
  assert.equal(view.seats.length, 2, "Race must not overfill table");
  assert.equal(
    new Set(view.seats.map((s: any) => s.ownerId)).size,
    2,
    "Race must not duplicate owners",
  );
  for (const attempt of attempts.filter((a) => a.status >= 300))
    assert.equal(
      attempt.body.error?.code,
      "CAPACITY_FULL",
      "Rejected join must explain full table",
    );
  for (const p of players) {
    const v = await p.get(`/matches/${match.id}/observation`);
    if (v.ownSeatId) await p.command(match.id, "seat.leave", {});
  }
}
export async function suite(
  store: Store,
  run: string,
  players: Player[],
  cycles: number,
) {
  const scenarios = [
    {
      name: "concurrent-human-and-bot-tables",
      execute: () =>
        Promise.allSettled([
          humanMatch(store, run, players[2], players[3]),
          botMatch(store, run, players[0], players[1], false),
        ]).then((results) => {
          const errors = results.filter((r) => r.status === "rejected");
          if (errors.length)
            throw new AggregateError(
              errors.map((r) => (r as PromiseRejectedResult).reason),
              "Concurrent table failures",
            );
        }),
    },
    {
      name: "concurrent-bot-tables-and-revisions",
      execute: () =>
        Promise.allSettled([
          botMatch(store, run, players[0], players[1], true),
          botMatch(store, run, players[2], players[3], false, {
            id: "yard-circle-4",
            name: "Snake Pit",
            x: 720,
            y: 450,
          }),
        ]).then((results) => {
          const errors = results.filter((r) => r.status === "rejected");
          if (errors.length)
            throw new AggregateError(
              errors.map((r) => (r as PromiseRejectedResult).reason),
              "Concurrent bot table failures",
            );
        }),
    },
    {
      name: "simultaneous-last-seat",
      execute: () => joinRace(store, run, players),
    },
  ];
  let failed = 0;
  for (let cycle = 1; cycle <= cycles; cycle++)
    for (const scenario of scenarios) {
      await store.event(run, "scenario.started", null, {
        scenario: scenario.name,
        cycle,
      });
      try {
        await scenario.execute();
        await store.event(run, "scenario.passed", null, {
          scenario: scenario.name,
          cycle,
        });
      } catch (error) {
        failed++;
        const detail = {
          scenario: scenario.name,
          cycle,
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
          causes:
            error instanceof AggregateError
              ? error.errors.map(String)
              : undefined,
        };
        const evidence = await Promise.allSettled(
          players.map((p) => p.observe()),
        );
        await store.issue(
          run,
          "Scenario failed: " + scenario.name,
          "needs-triage",
          { ...detail, evidence },
          "scenario:" +
            scenario.name +
            ":" +
            (error instanceof AggregateError
              ? error.errors.map(String).join("|")
              : String(error)
            ).replace(
              /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
              "<uuid>",
            ),
        );
        await store.event(run, "scenario.failed", null, detail);
        // A failed scenario may leave occupied tables. Stop this run and retain state for investigation.
        return failed;
      }
    }
  return failed;
}
