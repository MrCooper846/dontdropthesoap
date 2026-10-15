import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import { createExternalBot } from "../../server/bots/identity";
import { credentialHistory } from "../../server/bots/credential-history";
import {
  yard,
  refreshBlocks,
  blocked,
  retainChat,
  chatHistory,
  invalidateBlocks,
  blockRoutingSize,
} from "../../server/yards/world";
import { newMatch, command, observe } from "../../server/commands/matches";
import { config } from "../../server/config";
const url = new URL(config.DATABASE_URL);
if (
  url.pathname !== "/soap_test" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== "55432"
)
  throw Error("Bounded reads require local soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
async function owner(name: string) {
  const g = await createGuest(name);
  return {
    ...g,
    req: { headers: { cookie: "dds_session=" + g.secret } } as IncomingMessage,
  };
}
it("pages tied microsecond credential timestamps without gaps, secrets or foreign access", async () => {
  const o = await owner("Paged credentials"),
    other = await owner("Other credential owner");
  const bot = await createExternalBot(o.req, {
    name: "Paged bot",
    controllerEpoch: 0,
  });
  const ids = Array.from({ length: 203 }, () => randomUUID());
  await pool.query(
    "INSERT INTO bot_credentials(id,bot_id,secret_hash,scopes,expires_at,revoked_at) SELECT id,$1,replace(id::text,'-','')||replace(id::text,'-',''),ARRAY['observations:read','moves:write'],timestamptz '2030-01-01 00:00:00.123450+00'+(n%3)*interval '1 microsecond',now() FROM unnest($2::uuid[]) WITH ORDINALITY AS v(id,n)",
    [bot.id, ids],
  );
  const seen: string[] = [];
  let before: string | null = null;
  const sizes: number[] = [];
  do {
    const page = await credentialHistory(o.req, bot.id, before);
    sizes.push(page.credentials.length);
    seen.push(...page.credentials.map((r) => r.id));
    expect(JSON.stringify(page)).not.toMatch(/secret_hash|scopes/);
    before = page.next;
  } while (before);
  expect(sizes).toEqual([100, 100, 3]);
  expect(new Set(seen)).toEqual(new Set(ids));
  expect(seen).toHaveLength(203);
  await expect(credentialHistory(o.req, bot.id, "")).rejects.toThrow(
    "Invalid credential cursor",
  );
  await expect(credentialHistory(other.req, bot.id, "invalid")).rejects.toThrow(
    "NOT_FOUND",
  );
});
it("bounds the live routing graph but retains legitimate departed-sender replay and later blocks", async () => {
  const a = await owner("Routing A"),
    b = await owner("Routing B"),
    c = await owner("Routing C");
  const offline = Array.from({ length: 203 }, () => randomUUID());
  await pool.query(
    "INSERT INTO owners(id,display_name) SELECT id,'Offline fixture' FROM unnest($1::uuid[]) AS id",
    [offline],
  );
  await pool.query(
    "INSERT INTO owner_blocks(owner_id,blocked_owner_id) SELECT $1,id FROM unnest($2::uuid[]) AS id",
    [a.ownerId, offline],
  );
  try {
    yard.enter(a.ownerId, "A", "a", 0, Date.now());
    yard.enter(b.ownerId, "B", "b", 0, Date.now());
    await refreshBlocks();
    expect(blocked(a.ownerId, b.ownerId)).toBe(false);
    expect(blockRoutingSize()).toBe(0);
    retainChat(
      {
        id: randomUUID(),
        ownerId: b.ownerId,
        name: "B",
        text: "Before departure",
        sentAt: Date.now(),
      },
      [a.ownerId, b.ownerId],
    );
    yard.leave(b.ownerId);
    await refreshBlocks();
    expect(blocked(a.ownerId, b.ownerId)).toBe(true);
    expect((await chatHistory(a.ownerId)).map((m) => m.text)).toContain(
      "Before departure",
    );
    await pool.query(
      "INSERT INTO owner_blocks(owner_id,blocked_owner_id) VALUES($1,$2)",
      [b.ownerId, a.ownerId],
    );
    invalidateBlocks();
    await refreshBlocks();
    expect(await chatHistory(a.ownerId)).toEqual([]);
    yard.enter(b.ownerId, "B", "b", 0, Date.now());
    expect(blocked(a.ownerId, b.ownerId)).toBe(true);
    await refreshBlocks();
    expect(blockRoutingSize()).toBe(1);
    expect(blocked(a.ownerId, b.ownerId)).toBe(true);
    yard.enter(c.ownerId, "C", "c", 0, Date.now());
    expect(blocked(a.ownerId, c.ownerId)).toBe(true);
    await refreshBlocks();
    expect(blocked(a.ownerId, c.ownerId)).toBe(false);
  } finally {
    for (const id of [a.ownerId, b.ownerId, c.ownerId]) yard.leave(id);
    await refreshBlocks();
  }
});
it("serializes the final standalone table slot and preserves the losing creation key for retry", async () => {
  const owners = await Promise.all(
    Array.from({ length: config.MAX_ACTIVE_MATCHES + 1 }, (_, i) =>
      owner("Capacity " + i),
    ),
  );
  const inputs = await Promise.all(
    owners.map(async (o) => {
      const key = randomUUID();
      await pool.query(
        "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
        [key, o.ownerId],
      );
      return { commandId: randomUUID(), key, controllerEpoch: 0 };
    }),
  );
  const created: Awaited<ReturnType<typeof newMatch>>[] = [];
  for (let i = 0; i < config.MAX_ACTIVE_MATCHES - 1; i++)
    created.push(await newMatch(owners[i].req, inputs[i]));
  const start = config.MAX_ACTIVE_MATCHES - 1;
  const results = await Promise.allSettled([
    newMatch(owners[start].req, inputs[start]),
    newMatch(owners[start + 1].req, inputs[start + 1]),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const loser = results.findIndex((r) => r.status === "rejected"),
    index = start + loser;
  expect((results[loser] as PromiseRejectedResult).reason.code).toBe(
    "CAPACITY_FULL",
  );
  expect(
    (
      await pool.query("SELECT consumed_at FROM creation_keys WHERE id=$1", [
        inputs[index].key,
      ])
    ).rows[0].consumed_at,
  ).toBeNull();
  expect(
    (
      await pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
        inputs[index].commandId,
      ])
    ).rowCount,
  ).toBe(0);
  const m = await observe(owners[0].req, created[0].id);
  expect(
    (
      await command(owners[0].req, {
        v: 1,
        commandId: randomUUID(),
        controllerEpoch: 0,
        type: "seat.leave",
        matchId: m.id,
        seatId: m.ownSeatId,
        payload: {},
      })
    ).ok,
  ).toBe(true);
  const retried = await newMatch(owners[index].req, inputs[index]);
  expect((await newMatch(owners[index].req, inputs[index])).id).toBe(
    retried.id,
  );
  expect(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM matches WHERE mode<>'league' AND phase NOT IN ('finished','cancelled','aborted')",
        )
      ).rows[0].count,
    ),
  ).toBe(config.MAX_ACTIVE_MATCHES);
});
