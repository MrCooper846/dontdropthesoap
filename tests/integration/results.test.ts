import { retentionBatch } from "../../server/persistence/retention";
import { createExternalBot, mintCredential } from "../../server/bots/identity";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest } from "../../server/auth/sessions";
import {
  createMatch,
  makeSeat,
  addSeat,
  ready,
  requestStart,
  advance,
  submit,
} from "../../domain/match/engine";
import { saveMatch } from "../../server/matches/repository";
import { api } from "../../server/http";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Results fixture requires soap_test");
beforeAll(migrate);
afterAll(() => pool.end());

it("pages actual 200-result history over HTTP without exposing hidden moves and resets archived cursors", async () => {
  const owners = await Promise.all(
    Array.from({ length: 8 }, (_, i) => createGuest("Result player " + i)),
  );
  const ownerReq = {
    headers: { cookie: "dds_session=" + owners[0].secret },
  } as IncomingMessage;
  const bot = await createExternalBot(ownerReq, {
    name: "Results bot",
    controllerEpoch: 0,
  });
  const credential = await mintCredential(ownerReq, bot.id, {
    controllerEpoch: 0,
  });
  const foreign = await createExternalBot(ownerReq, {
    name: "Unassigned results bot",
    controllerEpoch: 0,
  });
  const foreignCredential = await mintCredential(ownerReq, foreign.id, {
    controllerEpoch: 0,
  });
  let now = Date.now();
  const m = createMatch(
    randomUUID(),
    owners[0].ownerId,
    "mixed",
    { rounds: 50, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    now,
    1,
  );
  for (const [i, owner] of owners.entries())
    addSeat(
      m,
      makeSeat(
        randomUUID(),
        owner.ownerId,
        "Result player",
        i === 0 ? "external" : "human",
        i === 0 ? bot.id : null,
        i === 0 ? bot.versionId : null,
      ),
    );
  for (const seat of m.seats) ready(m, seat.id, true);
  requestStart(m, now);
  now += 3000;
  advance(m, now);
  const save = () =>
    transaction((db) => saveMatch(db, m, "match.snapshot", true));
  // The real engine runs on a fixture clock; normalized rounds/moves/results
  // are persisted at each boundary. This tests history, not real-time deadlines.
  for (let round = 1; round <= 49; round++) {
    for (const seat of m.seats) submit(m, seat.id, round, "C", now);
    await save();
    now += 1000;
    advance(m, now);
  }
  submit(m, m.seats[0].id, 50, "D", now);
  await save();
  const server = createServer((req, res) => {
    void api(
      req,
      res,
      () => true,
      () => {},
    )
      .then((handled) => {
        if (!handled) {
          res.statusCode = 404;
          res.end();
        }
      })
      .catch(() => res.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing fixture port");
  const base = "http://127.0.0.1:" + address.port + "/api/v1/matches/" + m.id;
  const cookie = "dds_session=" + owners[0].secret;
  const read = (suffix: string, authenticated = true) =>
    fetch(base + suffix, { headers: authenticated ? { cookie } : {} });
  try {
    expect((await read("/results", false)).status).toBe(401);
    const first = await (await read("/results")).json();
    const botRead = (secret: string, suffix = "") =>
      fetch(base + "/results" + suffix, {
        headers: { authorization: "Bearer " + secret },
      });
    expect(await (await botRead(credential.secret)).json()).toEqual(first);
    const botSecond = await (
      await botRead(credential.secret, "?afterResult=100")
    ).json();
    expect(botSecond.results).toHaveLength(96);
    expect(botSecond.cursor).toBe(196);

    expect((await botRead(foreignCredential.secret)).status).toBe(403);
    await pool.query(
      "UPDATE bot_credentials SET scopes=ARRAY['moves:write']::text[] WHERE id=$1",
      [credential.credentialId],
    );
    expect((await botRead(credential.secret)).status).toBe(403);

    expect(first.results).toHaveLength(100);
    expect(first.nextAfterResult).toBe(100);
    expect(first.hasMore).toBe(true);
    expect(Object.keys(first).sort()).toEqual(
      [
        "cursor",
        "hasMore",
        "historyExpired",
        "nextAfterResult",
        "reset",
        "results",
      ].sort(),
    );
    const secondBefore = await (await read("/results?afterResult=100")).json();
    expect(secondBefore.results).toHaveLength(96);
    expect(secondBefore.cursor).toBe(196);
    expect(secondBefore.hasMore).toBe(false);
    expect(
      secondBefore.results.every((r: { round: number }) => r.round < 50),
    ).toBe(true);
    for (const seat of m.seats.slice(1)) submit(m, seat.id, 50, "C", now);
    await save();
    const tail = await (await read("/results?afterResult=196")).json();
    expect(tail.results).toHaveLength(4);
    expect(tail.results.every((r: { round: number }) => r.round === 50)).toBe(
      true,
    );
    const second = await (await read("/results?afterResult=100")).json();
    expect(second.results).toHaveLength(100);
    expect(second.nextAfterResult).toBeNull();
    const all = [...first.results, ...second.results];
    expect(new Set(all.map((r) => r.pairId)).size).toBe(200);
    expect(all).toEqual(m.results);
    const end = await (await read("/results?afterResult=200")).json();
    expect(end.results).toEqual([]);
    expect(end.cursor).toBe(200);
    for (const cursor of ["201", "-1", "1.5", "NaN", "", "01"])
      expect((await read("/results?afterResult=" + cursor)).status).toBe(400);
    // Normal observations retain the full bounded history needed by bots.
    expect((await (await read("/observation")).json()).results).toHaveLength(
      200,
    );
    now += 1000;
    advance(m, now);
    await save();
    await pool.query(
      "UPDATE matches SET terminal_at=now()-interval '91 days' WHERE id=$1",
      [m.id],
    );
    for (let i = 0; i < 100; i++) {
      await retentionBatch();
      if (
        (
          await pool.query(
            "SELECT history_expired_at FROM matches WHERE id=$1",
            [m.id],
          )
        ).rows[0].history_expired_at
      )
        break;
    }
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM round_results WHERE match_id=$1",
            [m.id],
          )
        ).rows[0].n,
      ),
    ).toBe(0);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM balance_entries WHERE match_id=$1",
            [m.id],
          )
        ).rows[0].n,
      ),
    ).toBe(8);
    const archived = await (await read("/results?afterResult=200")).json();
    expect(archived).toEqual({
      results: [],
      historyExpired: true,
      cursor: 0,
      nextAfterResult: null,
      hasMore: false,
      reset: true,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
