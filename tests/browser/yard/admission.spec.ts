import { test, expect } from "@playwright/test";
import { io } from "socket.io-client";
import { spawn, type ChildProcess } from "node:child_process";
import { Pool } from "pg";
import {
  enter,
  walk,
  own,
  post,
  creation,
  speedReveal,
  origin,
} from "./helpers";
const db = new Pool({
  connectionString:
    "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
});
test.beforeEach(async () => {
  await db.query("TRUNCATE owners CASCADE");
});
test.afterAll(() => db.end());
test("remote and teleport admission is rejected, full circles stay bounded, and stale controllers cannot move", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [host, guest, intruder] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  let modified: ReturnType<typeof io> | undefined;
  try {
    await enter(host, "Capacity host");
    await enter(guest, "Capacity guest");
    await enter(intruder, "Remote visitor");
    await walk(host, 240, 450);
    await walk(guest, 240, 450);
    await host
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await host.getByLabel("Seats", { exact: true }).fill("2");
    await host.getByRole("button", { name: "Create circle match" }).click();
    await expect(host.getByRole("button", { name: "Ready up" })).toBeVisible();
    const data = await own(intruder),
      circle = (await own(host)).view.circles.find(
        (c: { id: string }) => c.id === "yard-circle-3",
      );
    const id =
      circle.matchId ??
      (await host.request.get("/api/v1/matches").then((r) => r.json()))
        .matches[0].id;
    const { key } = await post(intruder, "/command-keys", {}).then((r) =>
        r.json(),
      ),
      envelope = {
        key,
        commandId: crypto.randomUUID(),
        controllerEpoch: data.session.controllerEpoch,
      };
    const distant = await post(
      intruder,
      "/matches/" + id + "/join",
      envelope,
    ).then((r) => r.json());
    expect(distant.error.code).toBe("TOO_FAR");
    await expect(
      guest.locator(".circle-card").filter({ hasText: "Noodle Exchange" }),
    ).toContainText("waiting");
    await guest
      .locator(".circle-card")
      .filter({ hasText: "Noodle Exchange" })
      .click();
    await guest
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await expect(guest.getByRole("button", { name: "Ready up" })).toBeVisible();
    await walk(intruder, 240, 450);
    const full = await post(
      intruder,
      "/matches/" + id + "/join",
      envelope,
    ).then((r) => r.json());
    expect(full.error.code).toBe("CAPACITY_FULL");
    expect(
      (await host.request.get("/api/v1/matches/" + id).then((r) => r.json()))
        .seats,
    ).toHaveLength(2);
    const cookies = await contexts[2].cookies();
    modified = io(origin + "/game-v1", {
      transports: ["websocket"],
      extraHeaders: {
        Origin: origin,
        Cookie: cookies.map((c) => c.name + "=" + c.value).join("; "),
      },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      modified!.once("connect", resolve);
      modified!.once("connect_error", reject);
    });
    const epoch = (
      await post(intruder, "/controller/acquire", {}).then((r) => r.json())
    ).controllerEpoch;
    expect(
      (
        await modified
          .timeout(5000)
          .emitWithAck("yard.enter", { controllerEpoch: epoch })
      ).ok,
    ).toBe(true);
    const before = (await own(intruder)).player;
    const teleport = await modified.timeout(5000).emitWithAck("yard.input", {
      controllerEpoch: epoch,
      payload: { seq: 0, axisX: 0, axisY: 0, x: 720, y: 190 },
    });
    expect(teleport.error.code).toBe("INVALID_PAYLOAD");
    const after = (await own(intruder)).player;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    await post(intruder, "/controller/acquire", {});
    const stale = await modified.timeout(5000).emitWithAck("yard.input", {
      controllerEpoch: epoch,
      payload: { seq: 0, axisX: 1, axisY: 0 },
    });
    expect(stale.error.code).toBe("CONTROLLER_STALE");
  } finally {
    modified?.disconnect();
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("a direct challenge creates two fixed seats, plays to completion, and expired invitations reject", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext(),
    host = await a.newPage(),
    guest = await b.newPage();
  try {
    await enter(host, "Challenger");
    await enter(guest, "Challenged");
    await walk(host, 240, 190);
    await walk(guest, 240, 190);
    await host
      .locator(".circle-card")
      .filter({ hasText: "Trust Issues" })
      .click();
    await host.getByLabel("Rounds", { exact: true }).fill("5");
    await host.getByLabel("Decision seconds").fill("5");
    await host
      .getByRole("button", { name: "Challenge Challenged", exact: true })
      .click();
    await expect(
      guest.getByRole("heading", { name: "Challenge from Challenger" }),
    ).toBeVisible();
    await guest.getByRole("button", { name: "Accept challenge" }).click();
    await expect(guest.getByRole("button", { name: "Ready up" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Ready up" })).toBeVisible();
    await speedReveal(host);
    await host.getByRole("button", { name: "Ready up" }).click();
    await guest.getByRole("button", { name: "Ready up" }).click();
    await expect(
      host.getByRole("button", { name: "Start game" }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "Start game" }).click();
    for (let i = 0; i < 5; i++) {
      await host
        .getByRole("button", { name: "Cooperate", exact: true })
        .click();
      await guest
        .getByRole("button", { name: "Cooperate", exact: true })
        .click();
    }
    await expect(
      host.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    const state = (
      await host.request.get("/api/v1/matches").then((r) => r.json())
    ).matches;
    expect(state).toEqual([]);
    const guestId = (await own(guest)).session.ownerId,
      invitation = await creation(host, "/challenges", {
        ownerId: guestId,
        circleId: "yard-circle-1",
      });
    expect(invitation.id).toBeTruthy();
    await db.query(
      "UPDATE challenge_invites SET expires_at=now()-interval '1 second' WHERE id=$1",
      [invitation.id],
    );
    const expired = await creation(
      guest,
      "/challenges/" + invitation.id + "/accept",
      {},
    );
    expect(expired.error.code).toBe("INVITE_EXPIRED");
  } finally {
    await a.close();
    await b.close();
  }
});
test("an owner watches an external bot while moving and a spectator receives no hidden choices", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [human, owner, spectator] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  let runner: ChildProcess | undefined;
  try {
    await enter(human, "Mixed human");
    await enter(owner, "Mixed owner");
    await enter(spectator, "Mixed spectator");
    const bot = await creation(owner, "/bots", { name: "Yard snake" }),
      token = await creation(owner, "/bots/" + bot.id + "/credentials", {});
    runner = spawn(
      process.execPath,
      ["--import", "tsx", "examples/bots/client.ts"],
      {
        env: {
          ...process.env,
          SOAP_URL: origin,
          SOAP_BOT_TOKEN: token.secret,
          SOAP_STRATEGY: "betray",
        },
        stdio: "ignore",
      },
    );
    await expect
      .poll(async () => {
        const { bots } = await owner.request
          .get("/api/v1/bots")
          .then((r) => r.json());
        return bots.find((b: { id: string }) => b.id === bot.id)?.online;
      })
      .toBe(true);
    await walk(human, 720, 450);
    await walk(owner, 720, 450);
    await human
      .locator(".circle-card")
      .filter({ hasText: "Snake Pit" })
      .click();
    await human.getByLabel("Rounds", { exact: true }).fill("5");
    await human.getByLabel("Decision seconds").fill("10");
    await human.getByRole("button", { name: "Create circle match" }).click();
    await expect(human.getByRole("button", { name: "Ready up" })).toBeVisible();
    await speedReveal(human);
    await expect(
      owner.locator(".circle-card").filter({ hasText: "Snake Pit" }),
    ).toContainText("waiting");
    await owner
      .locator(".circle-card")
      .filter({ hasText: "Snake Pit" })
      .click();
    await expect(
      owner
        .getByLabel("Enter as")
        .locator("option")
        .filter({ hasText: "Yard snake" }),
    ).toHaveCount(1);
    await owner.getByLabel("Enter as").selectOption(bot.id);
    await owner
      .getByRole("button", { name: "Join circle", exact: true })
      .click();
    await expect(owner.getByRole("button", { name: "Ready up" })).toBeVisible();
    await spectator
      .locator(".circle-card")
      .filter({ hasText: "Snake Pit" })
      .click();
    await spectator
      .getByRole("button", { name: "Watch match", exact: true })
      .click();
    await expect(spectator.locator('[aria-label="Match panel"]')).toContainText(
      "Yard snake",
    );
    await human.getByRole("button", { name: "Ready up" }).click();
    await owner.getByRole("button", { name: "Ready up" }).click();
    await expect(
      human.getByRole("button", { name: "Start game" }),
    ).toBeEnabled();
    await human.getByRole("button", { name: "Start game" }).click();
    const circle = (await own(human)).view.circles.find(
      (c: { id: string }) => c.id === "yard-circle-4",
    );
    const id = circle.matchId;
    await expect
      .poll(async () => {
        const observation = await owner.request
          .get("/api/v1/matches/" + id)
          .then((r) => r.json());
        return observation.ownMove;
      })
      .toBe("D");
    const publicView = await spectator.request
      .get("/api/v1/matches/" + id)
      .then((r) => r.json());
    expect(publicView.ownMove).toBeNull();
    expect(publicView.results).toEqual([]);
    expect(publicView).not.toHaveProperty("revealedMoves");
    await expect(
      owner.getByRole("button", { name: "Betray", exact: true }),
    ).toHaveCount(0);
    await walk(owner, 820, 450);
    expect((await own(owner)).player.seated).toBe(false);
    expect((await own(human)).player.seated).toBe(true);
    await human.getByRole("button", { name: "Cooperate", exact: true }).click();
    for (let round = 2; round <= 5; round++)
      await human
        .getByRole("button", { name: "Cooperate", exact: true })
        .click();
    await expect(
      human.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      spectator.getByRole("heading", { name: "Final results" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(owner.locator('[aria-label="Match panel"]')).toContainText(
      "15 noodles",
    );
  } finally {
    runner?.kill("SIGTERM");
    await Promise.all(contexts.map((c) => c.close()));
  }
});
