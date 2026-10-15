import { beforeAll, afterAll, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { pool, migrate } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import {
  createExternalBot,
  listOwnedBots,
  mintCredential,
  revokeCredential,
  botPrincipal,
  acquireBot,
  heartbeatBot,
  assertLease,
  isBotOnline,
  clearBotLeases,
} from "../../server/bots/identity";
import { config } from "../../server/config";
import { setTimeout as delay } from "node:timers/promises";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw new Error("Bot integration tests require soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
async function owner(name: string) {
  const guest = await createGuest(name);
  return {
    headers: { cookie: "dds_session=" + guest.secret },
  } as IncomingMessage;
}
function external(secret: string) {
  return { headers: { authorization: "Bearer " + secret } } as IncomingMessage;
}
it("stores only scoped credential hashes and fences replaced controllers", async () => {
  const req = await owner("Bot owner"),
    bot = await createExternalBot(req, {
      name: "Tiny snake",
      controllerEpoch: 0,
    });
  const first = await mintCredential(req, bot.id, { controllerEpoch: 0 }),
    second = await mintCredential(req, bot.id, { controllerEpoch: 0 });
  const row = (
    await pool.query(
      "SELECT secret_hash,scopes FROM bot_credentials WHERE id=$1",
      [first.credentialId],
    )
  ).rows[0];
  expect(row.secret_hash).not.toBe(first.secret);
  expect(row.scopes).toEqual(["observations:read", "moves:write"]);
  const one = external(first.secret),
    two = external(second.secret);
  const lease1 = await acquireBot(one);
  expect(isBotOnline(bot.id)).toBe(true);
  assertLease(await botPrincipal(one), lease1.controllerEpoch);
  const lease2 = await acquireBot(two);
  expect(lease2.controllerEpoch).toBe(lease1.controllerEpoch + 1);
  const oldPrincipal = await botPrincipal(one);
  expect(() =>
    assertLease(
      { ...oldPrincipal, epoch: lease1.controllerEpoch },
      lease1.controllerEpoch,
    ),
  ).toThrow("CONTROLLER_STALE");
  await expect(
    heartbeatBot(one, { controllerEpoch: lease1.controllerEpoch }),
  ).rejects.toThrow("CONTROLLER_STALE");
  expect(
    (await heartbeatBot(two, { controllerEpoch: lease2.controllerEpoch })).ok,
  ).toBe(true);
  await revokeCredential(req, bot.id, second.credentialId, {
    controllerEpoch: 0,
  });
  await expect(botPrincipal(two)).rejects.toThrow("AUTH_REQUIRED");
  expect(isBotOnline(bot.id)).toBe(false);
  clearBotLeases();
});
it("does not let another owner inspect, mint or revoke an owned bot", async () => {
  const a = await owner("A bot owner"),
    b = await owner("B bot owner"),
    bot = await createExternalBot(a, { name: "Owned", controllerEpoch: 0 }),
    token = await mintCredential(a, bot.id, { controllerEpoch: 0 });
  expect((await listOwnedBots(b)).some((item) => item.id === bot.id)).toBe(
    false,
  );
  await expect(
    mintCredential(b, bot.id, { controllerEpoch: 0 }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    revokeCredential(b, bot.id, token.credentialId, { controllerEpoch: 0 }),
  ).rejects.toThrow("NOT_FOUND");
  const p = await authenticate(a);
  expect((await botPrincipal(external(token.secret))).ownerId).toBe(p.ownerId);
});

it("an actually expired lease cannot be revived by heartbeat and reacquisition fences its old epoch", async () => {
  const req = await owner("Expired bot owner");
  const bot = await createExternalBot(req, {
    name: "Expired bot",
    controllerEpoch: 0,
  });
  const token = await mintCredential(req, bot.id, { controllerEpoch: 0 });
  const remote = external(token.secret);
  const first = await acquireBot(remote);
  await delay(15100);
  expect(isBotOnline(bot.id)).toBe(false);
  await expect(
    heartbeatBot(remote, { controllerEpoch: first.controllerEpoch }),
  ).rejects.toThrow("CONTROLLER_STALE");
  const next = await acquireBot(remote);
  expect(next.controllerEpoch).toBe(first.controllerEpoch + 1);
  await expect(
    heartbeatBot(remote, { controllerEpoch: first.controllerEpoch }),
  ).rejects.toThrow("CONTROLLER_STALE");
  expect(
    (await heartbeatBot(remote, { controllerEpoch: next.controllerEpoch })).ok,
  ).toBe(true);
  clearBotLeases();
});
