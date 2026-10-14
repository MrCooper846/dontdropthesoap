import { io } from "socket.io-client";
import { test, expect } from "@playwright/test";
test("two authenticated humans finish a fair match through the UI", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const host = await a.newPage(),
    guest = await b.newPage();
  const failures: string[] = [];
  host.on("pageerror", (e) => failures.push(e.message));
  guest.on("pageerror", (e) => failures.push(e.message));
  for (const [page, name] of [
    [host, "Alpha Host"],
    [guest, "Alpha Guest"],
  ] as const) {
    await page.goto("/play");
    await page.getByLabel("Your alias").fill(name);
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await host.getByLabel("Rounds").fill("5");
  await host.getByLabel("Decision seconds").fill("5");
  await host.getByRole("button", { name: "Create table", exact: true }).click();
  await expect(host).toHaveURL(/match=/);
  await guest.goto(host.url());
  await expect(
    guest.getByRole("button", { name: "Join this table" }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Join this table" }).click();
  await expect(guest.getByRole("button", { name: "Ready up" })).toBeVisible();
  await expect(
    host.locator(".listItem").filter({ hasText: "Alpha Guest" }),
  ).toBeVisible();
  await host.getByRole("button", { name: "Ready up" }).click();
  await guest.getByRole("button", { name: "Ready up" }).click();
  await expect(host.getByRole("button", { name: "Start game" })).toBeEnabled();
  await host.getByRole("button", { name: "Start game" }).click();
  for (let round = 1; round <= 5; round++) {
    await host.getByRole("button", { name: "Cooperate", exact: true }).click();
    await expect(host.getByRole("status")).toHaveText("Locked: Cooperate");
    await guest.getByRole("button", { name: "Betray", exact: true }).click();
  }
  await expect(
    host.getByRole("heading", { name: "Final results" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(
    guest.getByRole("heading", { name: "Final results" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(host.getByText("-10 noodles", { exact: false })).toBeVisible();
  await expect(guest.getByText("15 noodles", { exact: false })).toBeVisible();
  expect(failures).toEqual([]);
  await a.close();
  await b.close();
});
test("HTTP rejects impersonation, rewrites, stale rounds, controller takeover and missing CSRF", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (let i = 0; i < 2; i++) {
    await pages[i].goto("/play");
    await pages[i].getByLabel("Your alias").fill("Wire " + i);
    await pages[i].getByRole("button", { name: "Enter", exact: true }).click();
    await expect(
      pages[i].getByText("Wire " + i, { exact: true }),
    ).toBeVisible();
  }
  const sessions = await Promise.all(
    contexts.map((c) => c.request.get("/api/v1/session").then((r) => r.json())),
  );
  async function post(i: number, path: string, data: unknown) {
    return (
      await contexts[i].request.post("/api/v1" + path, {
        headers: {
          Origin: "http://127.0.0.1:3101",
          "x-csrf-token": sessions[i].csrfToken,
        },
        data,
      })
    ).json();
  }
  const epochs = await Promise.all([
    post(0, "/controller/acquire", {}),
    post(1, "/controller/acquire", {}),
  ]);
  const { key } = await post(0, "/command-keys", {});
  const created = await post(0, "/matches", {
    commandId: crypto.randomUUID(),
    key,
    controllerEpoch: epochs[0].controllerEpoch,
    settings: { rounds: 5, decisionMs: 10000, revealMs: 1000, maxSeats: 8 },
  });
  const guestKey = await post(1, "/command-keys", {});
  await post(1, "/matches/" + created.id + "/join", {
    key: guestKey.key,
    controllerEpoch: epochs[1].controllerEpoch,
    commandId: crypto.randomUUID(),
  });
  const state = await contexts[0].request
    .get("/api/v1/matches/" + created.id + "/observation")
    .then((r) => r.json());
  const hostSeat = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === sessions[0].ownerId,
    ).id,
    guestSeat = state.seats.find(
      (s: { ownerId: string }) => s.ownerId === sessions[1].ownerId,
    ).id;
  const cmd = (
    i: number,
    type: string,
    seatId: string,
    payload: unknown,
    round = 0,
    matchVersion?: number,
  ) => ({
    v: 1,
    commandId: crypto.randomUUID(),
    controllerEpoch: epochs[i].controllerEpoch,
    type,
    matchId: created.id,
    seatId,
    round,
    matchVersion,
    payload,
  });
  expect(
    (
      await post(
        1,
        "/commands",
        cmd(1, "seat.ready", hostSeat, { ready: true }),
      )
    ).error.code,
  ).toBe("FORBIDDEN");
  await post(0, "/commands", cmd(0, "seat.ready", hostSeat, { ready: true }));
  await post(1, "/commands", cmd(1, "seat.ready", guestSeat, { ready: true }));
  const ready = await contexts[0].request
    .get("/api/v1/matches/" + created.id)
    .then((r) => r.json());
  await post(
    0,
    "/commands",
    cmd(0, "match.start", hostSeat, {}, 0, ready.version),
  );
  await expect
    .poll(async () => {
      return (
        await contexts[0].request
          .get("/api/v1/matches/" + created.id)
          .then((r) => r.json())
      ).phase;
    })
    .toBe("collecting");

  const cookies = await contexts[1].cookies();
  const wire = io("http://127.0.0.1:3101/game-v1", {
    transports: ["websocket"],
    extraHeaders: {
      Origin: "http://127.0.0.1:3101",
      Cookie: cookies.map((c) => c.name + "=" + c.value).join("; "),
    },
    reconnection: false,
  });
  const events: Record<string, unknown>[] = [];
  wire.on("match.snapshot", (event) => events.push(event.payload));
  await new Promise<void>((resolve, reject) => {
    wire.once("connect", () => resolve());
    wire.once("connect_error", reject);
  });
  const synced = await wire
    .timeout(5000)
    .emitWithAck("state.sync", { matchId: created.id });
  expect(synced.ok).toBe(true);
  const move = cmd(0, "move.submit", hostSeat, { move: "D" }, 1);

  expect((await post(0, "/commands", move)).ok).toBe(true);
  expect((await post(0, "/commands", move)).ok).toBe(true);

  await expect.poll(() => events.length).toBeGreaterThan(0);
  for (const event of events) {
    expect(event.ownMove).toBeNull();
    expect(event.results).toEqual([]);
    expect(event).not.toHaveProperty("moves");
    expect(event).not.toHaveProperty("revealedMoves");
    expect(event).not.toHaveProperty("rngState");
  }
  wire.disconnect();
  const other = await contexts[1].request
    .get("/api/v1/matches/" + created.id)
    .then((r) => r.json());
  expect(other.ownMove).toBeNull();
  expect(other.results).toEqual([]);
  expect(other).not.toHaveProperty("moves");
  expect(other).not.toHaveProperty("revealedMoves");
  expect(
    (
      await post(
        0,
        "/commands",
        cmd(0, "move.submit", hostSeat, { move: "C" }, 1),
      )
    ).error.code,
  ).toBe("MOVE_LOCKED");
  expect(
    (
      await post(
        1,
        "/commands",
        cmd(1, "move.submit", guestSeat, { move: "D" }, 0),
      )
    ).error.code,
  ).toBe("ROUND_MISMATCH");
  await post(0, "/controller/acquire", {});
  expect(
    (
      await post(
        0,
        "/commands",
        cmd(0, "move.submit", hostSeat, { move: "D" }, 1),
      )
    ).error.code,
  ).toBe("CONTROLLER_STALE");
  const noCsrf = await contexts[1].request.post("/api/v1/commands", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: cmd(1, "move.submit", guestSeat, { move: "D" }, 1),
  });
  expect(noCsrf.status()).toBe(403);
  await Promise.all(contexts.map((c) => c.close()));
});

test("three humans plus the system Clanker finish through the real protocol", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const sessions: any[] = [];
  for (let i = 0; i < 3; i++) {
    const req = contexts[i].request;
    await req.post("/api/v1/session/guest", {
      headers: { Origin: "http://127.0.0.1:3101" },
      data: { name: "Clanker test " + i },
    });
    const s = await req.get("/api/v1/session").then((r) => r.json());
    const e = await req
      .post("/api/v1/controller/acquire", {
        headers: {
          Origin: "http://127.0.0.1:3101",
          "x-csrf-token": s.csrfToken,
        },
        data: {},
      })
      .then((r) => r.json());
    sessions.push({ ...s, controllerEpoch: e.controllerEpoch });
  }
  async function post(i: number, path: string, data: unknown) {
    return contexts[i].request
      .post("/api/v1" + path, {
        headers: {
          Origin: "http://127.0.0.1:3101",
          "x-csrf-token": sessions[i].csrfToken,
        },
        data,
      })
      .then((r) => r.json());
  }
  const { key } = await post(0, "/command-keys", {}),
    { id } = await post(0, "/matches", {
      key,
      commandId: crypto.randomUUID(),
      controllerEpoch: sessions[0].controllerEpoch,
      settings: { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    });
  for (let i = 1; i < 3; i++) {
    const { key } = await post(i, "/command-keys", {});
    await post(i, "/matches/" + id + "/join", {
      key,
      commandId: crypto.randomUUID(),
      controllerEpoch: sessions[i].controllerEpoch,
    });
  }
  const state = () =>
    contexts[0].request.get("/api/v1/matches/" + id).then((r) => r.json());
  let current = await state();
  const seatIds = sessions.map(
    (s) =>
      current.seats.find(
        (seat: { ownerId: string }) => seat.ownerId === s.ownerId,
      ).id,
  );
  const cmd = (i: number, type: string, payload: unknown) => ({
    v: 1,
    commandId: crypto.randomUUID(),
    controllerEpoch: sessions[i].controllerEpoch,
    type,
    matchId: id,
    seatId: seatIds[i],
    round: current.round,
    matchVersion: current.version,
    payload,
  });
  for (let i = 0; i < 3; i++)
    expect(
      (await post(i, "/commands", cmd(i, "seat.ready", { ready: true }))).ok,
    ).toBe(true);
  current = await state();
  expect((await post(0, "/commands", cmd(0, "match.start", {}))).ok).toBe(true);
  for (let round = 1; round <= 5; round++) {
    await expect
      .poll(async () => {
        current = await state();
        return current.phase === "collecting" && current.round === round;
      })
      .toBe(true);
    expect(current.seats).toHaveLength(4);
    for (let i = 0; i < 3; i++)
      expect(
        (await post(i, "/commands", cmd(i, "move.submit", { move: "D" }))).ok,
      ).toBe(true);
  }
  await expect
    .poll(async () => {
      current = await state();
      return current.phase;
    })
    .toBe("finished");
  expect(current.results).toHaveLength(10);
  const system = current.seats.find(
    (s: { kind: string }) => s.kind === "system",
  );
  expect(system.ownerId).toBeNull();
  expect(
    current.results.filter(
      (r: { a: string; b: string }) => r.a === system.id || r.b === system.id,
    ),
  ).toHaveLength(5);
  await Promise.all(contexts.map((c) => c.close()));
});
