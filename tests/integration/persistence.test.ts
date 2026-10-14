import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import {
  newMatch,
  joinMatch,
  command,
  observe,
  tickMatches,
  recoverMatches,
  controller,
} from "../../server/commands/matches";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw new Error("Integration tests require the isolated soap_test database");
beforeAll(async () => {
  await migrate();
  await pool.query("TRUNCATE owners CASCADE");
});
afterAll(() => pool.end());
async function guest(name: string) {
  const g = await createGuest(name);
  const req = {
    headers: { cookie: "dds_session=" + g.secret },
  } as IncomingMessage;
  return { req, p: await authenticate(req) };
}
async function setup(maxSeats = 8) {
  const a = await guest("A"),
    b = await guest("B"),
    key = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [key, a.p.id],
  );
  const created = await newMatch(a.req, {
    commandId: randomUUID(),
    key,
    controllerEpoch: 0,
    settings: { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats },
  });
  const bkey = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [bkey, b.p.id],
  );
  await joinMatch(b.req, created.id, {
    key: bkey,
    controllerEpoch: 0,
    commandId: randomUUID(),
  });
  const m = await observe(a.req, created.id);
  return {
    a,
    b,
    id: created.id,
    sa: m.seats.find((s) => s.ownerId === a.p.ownerId)!.id,
    sb: m.seats.find((s) => s.ownerId === b.p.ownerId)!.id,
  };
}
async function expire(id: string) {
  await transaction(async (db) => {
    const m = await loadMatch(db, id, true);
    m.deadline = Date.now() - 10;
    await saveMatch(db, m);
  });
  await Promise.all([tickMatches(), tickMatches()]);
}
it("commits accepted moves and receipts, recovers without score duplication", async () => {
  const { a, b, id, sa, sb } = await setup();
  const make = (
    who: typeof a,
    type: string,
    seatId: string,
    payload: unknown,
    round = 0,
    version?: number,
  ) => ({
    v: 1,
    commandId: randomUUID(),
    type,
    controllerEpoch: 0,
    matchId: id,
    seatId,
    round,
    matchVersion: version,
    payload,
  });
  await command(a.req, make(a, "seat.ready", sa, { ready: true }));
  await command(b.req, make(b, "seat.ready", sb, { ready: true }));
  const waiting = await observe(a.req, id);
  await command(a.req, make(a, "match.start", sa, {}, 0, waiting.version));
  await expire(id);
  const move = make(a, "move.submit", sa, { move: "D" }, 1);
  expect((await command(a.req, move)).ok).toBe(true);
  expect((await command(a.req, move)).ok).toBe(true);
  expect(
    (
      await pool.query(
        "SELECT move FROM moves WHERE match_id=$1 AND seat_id=$2",
        [id, sa],
      )
    ).rows[0].move,
  ).toBe("D");
  await recoverMatches();
  expect((await observe(a.req, id)).ownMove).toBe("D");
  expect((await observe(b.req, id)).ownMove).toBeNull();
  expect(
    (await command(a.req, { ...move, payload: { move: "C" } })).error!.code,
  ).toBe("COMMAND_ID_REUSED");
  await command(b.req, make(b, "move.submit", sb, { move: "C" }, 1));
  await expire(id);
  for (let r = 2; r <= 5; r++) {
    await expire(id);
    await expire(id);
  }
  const final = await observe(a.req, id);
  expect(final.phase).toBe("finished");
  expect(final.seats.find((s) => s.id === sa)!.score).toBe(7);
  const before = await pool.query(
    "SELECT * FROM balance_entries WHERE match_id=$1",
    [id],
  );
  expect(before.rowCount).toBe(2);
  await transaction(async (db) => saveMatch(db, await loadMatch(db, id, true)));
  expect(
    (await pool.query("SELECT * FROM balance_entries WHERE match_id=$1", [id]))
      .rowCount,
  ).toBe(2);
});
it("capacity races, old controllers and expired creation keys reject without corrupting state", async () => {
  const { a, b, id, sa } = await setup();
  const epoch = await controller(a.req);
  expect(epoch).toBe(1);
  const ack = await command(a.req, {
    v: 1,
    commandId: randomUUID(),
    type: "seat.ready",
    controllerEpoch: 0,
    matchId: id,
    seatId: sa,
    payload: { ready: true },
  });
  expect(ack.error!.code).toBe("CONTROLLER_STALE");
  const key = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()-interval '1 minute')",
    [key, b.p.id],
  );
  await expect(
    newMatch(b.req, { commandId: randomUUID(), key, controllerEpoch: 0 }),
  ).rejects.toThrow("KEY_EXPIRED");
});

it("serialises competing final-seat admissions under the match lock", async () => {
  const { a, b, id, sb } = await setup(2);
  await command(b.req, {
    v: 1,
    commandId: randomUUID(),
    type: "seat.leave",
    controllerEpoch: 0,
    matchId: id,
    seatId: sb,
    payload: {},
  });
  const c = await guest("C"),
    d = await guest("D");
  async function admission(g: typeof c) {
    const key = randomUUID();
    await pool.query(
      "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [key, g.p.id],
    );
    return joinMatch(g.req, id, {
      key,
      controllerEpoch: 0,
      commandId: randomUUID(),
    });
  }
  const outcomes = await Promise.allSettled([admission(c), admission(d)]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find(
    (r) => r.status === "rejected",
  ) as PromiseRejectedResult;
  expect(rejected.reason.code).toBe("CAPACITY_FULL");
  expect((await observe(a.req, id)).seats).toHaveLength(2);
});
