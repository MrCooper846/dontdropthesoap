import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import { createMatch, makeSeat, addSeat } from "../../domain/match/engine";
import { saveMatch } from "../../server/matches/repository";
import { syncObservation } from "../../server/matches/observations";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw new Error("Observation tests require soap_test");
beforeAll(migrate);
afterAll(() => pool.end());
it("filters private events and advances cursors across invisible entries", async () => {
  const g = await createGuest("Cursor owner"),
    req = { headers: { cookie: "dds_session=" + g.secret } } as IncomingMessage,
    p = await authenticate(req);
  const other = await createGuest("Unrelated observer"),
    observer = {
      headers: { cookie: "dds_session=" + other.secret },
    } as IncomingMessage;
  const id = randomUUID(),
    seat = randomUUID(),
    m = createMatch(
      id,
      p.ownerId,
      "human",
      { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
      Date.now(),
      1,
    );
  addSeat(m, makeSeat(seat, p.ownerId, p.name));
  await transaction(async (db) => {
    await saveMatch(db, m);
    await db.query(
      "INSERT INTO match_events(match_id,sequence,type,visibility,recipient_seat_id,payload) VALUES($1,2,'move.accepted','private',$2,$3)",
      [
        id,
        seat,
        JSON.stringify({ privateSentinel: "must-not-leak", move: "D" }),
      ],
    );
  });
  const privateView = await syncObservation(req, id, 1);
  expect(privateView.events).toHaveLength(1);
  expect(privateView.events[0].payload.privateSentinel).toBe("must-not-leak");
  const publicView = await syncObservation(observer, id, 1);
  expect(publicView.events).toEqual([]);
  expect(publicView.cursor).toBe(2);
  expect(JSON.stringify(publicView)).not.toContain("must-not-leak");
  const reset = await syncObservation(req, id, 999999);
  expect(reset.reset).toBe(true);
  expect(reset.cursor).toBe(2);
  expect(reset.snapshot.id).toBe(id);
});
