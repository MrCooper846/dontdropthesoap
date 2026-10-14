import { it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import {
  createExternalBot,
  mintCredential,
  acquireBot,
} from "../../server/bots/identity";
import {
  newMatch,
  joinMatch,
  observe,
  command,
} from "../../server/commands/matches";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw new Error("Bot authority tests require soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
async function owner(name: string) {
  const g = await createGuest(name);
  return { headers: { cookie: "dds_session=" + g.secret } } as IncomingMessage;
}
async function key(req: IncomingMessage) {
  const p = await authenticate(req),
    key = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [key, p.id],
  );
  return key;
}
it("a scoped bot cannot submit for its human opponent or perform owner/host actions", async () => {
  const human = await owner("Authority human"),
    ownerReq = await owner("Authority bot owner"),
    bot = await createExternalBot(ownerReq, {
      name: "Scoped",
      controllerEpoch: 0,
    }),
    token = await mintCredential(ownerReq, bot.id, { controllerEpoch: 0 }),
    botReq = {
      headers: { authorization: "Bearer " + token.secret },
    } as IncomingMessage,
    lease = await acquireBot(botReq);
  const created = await newMatch(human, {
    key: await key(human),
    commandId: randomUUID(),
    controllerEpoch: 0,
    mode: "mixed",
  });
  await joinMatch(ownerReq, created.id, {
    key: await key(ownerReq),
    commandId: randomUUID(),
    controllerEpoch: 0,
    botId: bot.id,
  });
  const snapshot = await observe(botReq, created.id),
    humanSeat = snapshot.seats.find((s) => s.kind === "human")!.id;
  const envelope = {
    v: 1,
    commandId: randomUUID(),
    controllerEpoch: lease.controllerEpoch,
    matchId: created.id,
    round: 0,
    seatId: humanSeat,
    payload: { move: "D" },
    type: "move.submit",
  };
  expect((await command(botReq, envelope)).error!.code).toBe("FORBIDDEN");
  expect(
    (
      await command(botReq, {
        ...envelope,
        commandId: randomUUID(),
        type: "match.start",
        matchVersion: snapshot.version,
        payload: {},
      })
    ).error!.code,
  ).toBe("FORBIDDEN");
  expect(
    (
      await command(botReq, {
        ...envelope,
        commandId: randomUUID(),
        seatId: snapshot.ownSeatId,
        type: "seat.ready",
        payload: { ready: true },
      })
    ).error!.code,
  ).toBe("FORBIDDEN");
  expect((await observe(human, created.id)).ownMove).toBeNull();
  const unrelated = await owner("Authority outsider"),
    other = await newMatch(unrelated, {
      key: await key(unrelated),
      commandId: randomUUID(),
      controllerEpoch: 0,
    });
  await expect(observe(botReq, other.id)).rejects.toThrow("FORBIDDEN");
});
