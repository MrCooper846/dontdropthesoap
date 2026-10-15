import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import {
  retentionBatch,
  startRetention,
} from "../../server/persistence/retention";
import { createGuest } from "../../server/auth/sessions";
import { createExternalBot, mintCredential } from "../../server/bots/identity";
import { resource } from "../../server/commands/resources";
import { applyOperator } from "../../server/operators/service";
import {
  createMatch,
  addSeat,
  makeSeat,
  ready,
  requestStart,
  advance,
  submit,
  recover,
  project,
} from "../../domain/match/engine";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { config } from "../../server/config";
const url = new URL(config.DATABASE_URL);
if (
  url.pathname !== "/soap_test" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.port !== "55432"
)
  throw Error("Retention fixtures require local soap_test on 55432");
beforeAll(async () => {
  await migrate();
  // These exact fault-injection names belong only to this isolated fixture.
  await pool.query("DROP TRIGGER IF EXISTS retention_fixture_fail ON matches");
  await pool.query("DROP FUNCTION IF EXISTS retention_fixture_fail()");
  for (let i = 0; i < 100; i++) {
    const counts = await retentionBatch();
    if (!counts.histories && !Object.values(counts).some((n) => n === 100))
      break;
  }
});
afterAll(() => pool.end());
async function owner(name: string) {
  const g = await createGuest(name);
  return {
    ...g,
    req: { headers: { cookie: "dds_session=" + g.secret } } as IncomingMessage,
  };
}
async function game(finish = true) {
  const a = await owner("Retention A"),
    b = await owner("Retention B");
  const now = Date.now(),
    m = createMatch(
      randomUUID(),
      a.ownerId,
      "human",
      { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
      now,
      123,
    );
  for (const o of [a, b])
    addSeat(m, makeSeat(randomUUID(), o.ownerId, "Retention seat"));
  for (const seat of m.seats) ready(m, seat.id, true);
  requestStart(m, now - 3000);
  advance(m, now);
  await transaction((db) => saveMatch(db, m));
  if (finish)
    for (let round = 1; round <= 5; round++) {
      for (const seat of m.seats)
        submit(m, seat.id, round, "C", m.deadline! - 1);
      await transaction((db) => saveMatch(db, m));
      advance(m, m.deadline! + 1);
      await transaction((db) => saveMatch(db, m));
    }
  return { m, a, b };
}
async function markOld(id: string) {
  await pool.query(
    "UPDATE matches SET terminal_at=now()-interval '91 days' WHERE id=$1",
    [id],
  );
}
async function archived(id: string) {
  for (let i = 0; i < 100; i++) {
    await retentionBatch();
    if (
      (
        await pool.query(
          "SELECT history_expired_at IS NOT NULL AS expired FROM matches WHERE id=$1",
          [id],
        )
      ).rows[0].expired
    )
      return;
  }
  throw Error("Retention candidate did not expire");
}
it("expires old metadata at its own cutoff and rejects an old creation retry after receipt/key cleanup", async () => {
  const old = await owner("Expired retention session"),
    recent = await owner("Recent retention session"),
    caller = await owner("Valid retention caller");
  const bot = await createExternalBot(caller.req, {
    name: "Retention credential",
    controllerEpoch: 0,
  });
  const expired = await mintCredential(caller.req, bot.id, {
    controllerEpoch: 0,
  });
  const kept = await mintCredential(caller.req, bot.id, { controllerEpoch: 0 });
  await pool.query(
    "UPDATE sessions SET expires_at=now()-interval '8 days' WHERE owner_id=$1",
    [old.ownerId],
  );
  await pool.query(
    "UPDATE sessions SET expires_at=now()-interval '6 days' WHERE owner_id=$1",
    [recent.ownerId],
  );
  await pool.query(
    "UPDATE bot_credentials SET expires_at=now()-interval '8 days',revoked_at=now()-interval '9 days' WHERE id=$1",
    [expired.credentialId],
  );
  await pool.query(
    "UPDATE bot_credentials SET expires_at=now()-interval '6 days' WHERE id=$1",
    [kept.credentialId],
  );
  const commandId = randomUUID(),
    key = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [key, caller.ownerId],
  );
  const input = { commandId, key, controllerEpoch: 0, payload: {} };
  let created = 0;
  const work = async () => {
    created++;
    return { id: randomUUID() };
  };
  const result = await resource(caller.req, input, "retention.synthetic", work);
  expect(
    await resource(caller.req, input, "retention.synthetic", work),
  ).toEqual(result);
  await pool.query(
    "UPDATE creation_keys SET expires_at=now()-interval '8 days' WHERE id=$1",
    [key],
  );
  await pool.query(
    "UPDATE command_receipts SET created_at=now()-interval '8 days' WHERE command_id=$1",
    [commandId],
  );
  const freshReceipt = randomUUID();
  await pool.query(
    "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response,created_at) VALUES($1,$2,$3,'{}',now()-interval '6 days')",
    [caller.ownerId, freshReceipt, "a".repeat(64)],
  );
  const oldReport = randomUUID(),
    newReport = randomUUID();
  for (const [id, days] of [
    [oldReport, 31],
    [newReport, 29],
  ] as const)
    await pool.query(
      "INSERT INTO reports(id,reporter_id,subject_owner_id,reason,created_at) VALUES($1,$2,$3,'private report sentinel',now()-make_interval(days=>$4))",
      [id, caller.ownerId, recent.ownerId, days],
    );
  const auditId = randomUUID();
  await applyOperator("retention-fixture", {
    commandId: auditId,
    action: "report.review",
    targetId: oldReport,
    reason: "Synthetic review metadata",
    status: "reviewed",
  });
  const oldInvite = randomUUID(),
    newInvite = randomUUID();
  for (const [id, days] of [
    [oldInvite, 8],
    [newInvite, 6],
  ] as const)
    await pool.query(
      "INSERT INTO challenge_invites(id,creator_id,target_id,circle_id,settings_json,expires_at) VALUES($1,$2,$3,'yard-circle-1','{}',now()-make_interval(days=>$4))",
      [id, caller.ownerId, recent.ownerId, days],
    );
  await retentionBatch();
  expect(
    (
      await pool.query("SELECT 1 FROM sessions WHERE owner_id=$1", [
        old.ownerId,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query("SELECT 1 FROM sessions WHERE owner_id=$1", [
        recent.ownerId,
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query("SELECT 1 FROM bot_credentials WHERE id=$1", [
        expired.credentialId,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query("SELECT 1 FROM bot_credentials WHERE id=$1", [
        kept.credentialId,
      ])
    ).rowCount,
  ).toBe(1);
  expect(
    (
      await pool.query("SELECT id FROM reports WHERE id=ANY($1::uuid[])", [
        [oldReport, newReport],
      ])
    ).rows.map((r) => r.id),
  ).toEqual([newReport]);
  expect(
    (
      await pool.query(
        "SELECT id FROM challenge_invites WHERE id=ANY($1::uuid[])",
        [[oldInvite, newInvite]],
      )
    ).rows.map((r) => r.id),
  ).toEqual([newInvite]);
  const audit = (
    await pool.query("SELECT response FROM operator_actions WHERE id=$1", [
      auditId,
    ])
  ).rows[0];
  expect(audit).toBeDefined();
  expect(JSON.stringify(audit)).not.toContain("private report sentinel");
  expect(
    (
      await pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
        freshReceipt,
      ])
    ).rowCount,
  ).toBe(1);
  await expect(
    resource(caller.req, input, "retention.synthetic", work),
  ).rejects.toThrow("KEY_EXPIRED");
  expect(created).toBe(1);
});
it("ages from terminal time, never purges an active match, and clears unrevealed aborted decisions without credit", async () => {
  const current = await game(),
    active = await game(false),
    hidden = await game(false);
  await pool.query(
    "UPDATE matches SET created_at=now()-interval '200 days' WHERE id=ANY($1::uuid[])",
    [[current.m.id, active.m.id]],
  );
  await pool.query(
    "UPDATE matches SET terminal_at=now()-interval '89 days' WHERE id=$1",
    [current.m.id],
  );
  await retentionBatch();
  expect(
    (
      await pool.query("SELECT history_expired_at FROM matches WHERE id=$1", [
        current.m.id,
      ])
    ).rows[0].history_expired_at,
  ).toBeNull();
  expect(
    (
      await pool.query(
        "SELECT terminal_at,history_expired_at FROM matches WHERE id=$1",
        [active.m.id],
      )
    ).rows[0],
  ).toEqual({ terminal_at: null, history_expired_at: null });
  submit(hidden.m, hidden.m.seats[0].id, 1, "D", Date.now());
  recover(hidden.m, Date.now());
  recover(hidden.m, Date.now());
  await transaction((db) => saveMatch(db, hidden.m));
  expect(project(hidden.m, null)).not.toHaveProperty("revealedMoves");
  await markOld(hidden.m.id);
  await archived(hidden.m.id);
  const m = await transaction((db) => loadMatch(db, hidden.m.id));
  expect(m.phase).toBe("aborted");
  expect(m.moves).toEqual({});
  expect(project(m, hidden.a.ownerId).ownMove).toBeNull();
  expect(
    (
      await pool.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
        m.id,
      ])
    ).rowCount,
  ).toBe(0);
});
it("rolls back metadata and all history deletion if the final checkpoint update fails", async () => {
  const f = await game();
  await pool.query("UPDATE matches SET terminal_at='-infinity' WHERE id=$1", [
    f.m.id,
  ]);
  const receipt = randomUUID();
  await pool.query(
    "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response,created_at) VALUES($1,$2,$3,'{}',now()-interval '8 days')",
    [f.a.ownerId, receipt, "a".repeat(64)],
  );
  try {
    await pool.query(
      "CREATE FUNCTION retention_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.history_expired_at IS NOT NULL THEN RAISE EXCEPTION 'Injected retention failure'; END IF; RETURN NEW; END$$",
    );
    await pool.query(
      "CREATE TRIGGER retention_fixture_fail BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION retention_fixture_fail()",
    );
    await expect(retentionBatch()).rejects.toThrow(
      "Injected retention failure",
    );
    expect(
      (await pool.query("SELECT 1 FROM moves WHERE match_id=$1", [f.m.id]))
        .rowCount,
    ).toBe(10);
    expect(
      (
        await pool.query("SELECT 1 FROM round_results WHERE match_id=$1", [
          f.m.id,
        ])
      ).rowCount,
    ).toBe(5);
    expect(
      (
        await pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
          receipt,
        ])
      ).rowCount,
    ).toBe(1);
    expect((await transaction((db) => loadMatch(db, f.m.id))).results).toEqual(
      f.m.results,
    );
  } finally {
    await pool.query(
      "DROP TRIGGER IF EXISTS retention_fixture_fail ON matches",
    );
    await pool.query("DROP FUNCTION IF EXISTS retention_fixture_fail()");
  }
  await archived(f.m.id);
});
it("bounds metadata pages and skips an actually locked receipt without blocking other cleanup", async () => {
  const o = await owner("Retention page owner"),
    ids = Array.from({ length: 105 }, () => randomUUID());
  await pool.query(
    "INSERT INTO command_receipts(principal_id,command_id,payload_hash,response,created_at) SELECT $1,id,$3,'{}'::jsonb,now()-interval '8 days' FROM unnest($2::uuid[]) AS id",
    [o.ownerId, ids, "a".repeat(64)],
  );
  const locker = await pool.connect();
  try {
    await locker.query("BEGIN");
    await locker.query(
      "SELECT 1 FROM command_receipts WHERE principal_id=$1 AND command_id=$2 FOR UPDATE",
      [o.ownerId, ids[0]],
    );
    expect((await retentionBatch()).receipts).toBe(100);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM command_receipts WHERE principal_id=$1",
          [o.ownerId],
        )
      ).rowCount,
    ).toBe(5);
    expect(
      (
        await pool.query("SELECT 1 FROM command_receipts WHERE command_id=$1", [
          ids[0],
        ])
      ).rowCount,
    ).toBe(1);
    await locker.query("COMMIT");
    expect((await retentionBatch()).receipts).toBe(5);
  } finally {
    await locker.query("ROLLBACK");
    locker.release();
  }
});
it("the actual background producer cleans a backlog and stops without leaving in-flight work", async () => {
  const f = await game();
  await markOld(f.m.id);
  const stop = startRetention();
  try {
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT history_expired_at IS NOT NULL AS expired FROM matches WHERE id=$1",
              [f.m.id],
            )
          ).rows[0].expired,
        { timeout: 3000, interval: 20 },
      )
      .toBe(true);
  } finally {
    await stop();
  }
  expect(
    (await transaction((db) => loadMatch(db, f.m.id))).historyExpired,
  ).toBe(true);
});

it("drains admitted cleanup during stop and does not start another backlog batch", async () => {
  const first = await game(),
    second = await game();
  await markOld(first.m.id);
  await markOld(second.m.id);
  const blockers = await Promise.all(
    Array.from({ length: 12 }, () => pool.connect()),
  );
  const stop = startRetention();
  let stopped = false;
  const done = stop().then(() => {
    stopped = true;
  });
  try {
    expect(pool.waitingCount).toBe(1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    blockers.pop()!.release();
    await done;
  } finally {
    for (const blocker of blockers) blocker.release();
    await stop();
  }
  const count = async () =>
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM matches WHERE id=ANY($1::uuid[]) AND history_expired_at IS NOT NULL",
          [[first.m.id, second.m.id]],
        )
      ).rows[0].n,
    );
  expect(await count()).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(await count()).toBe(1);
  await archived(first.m.id);
  await archived(second.m.id);
});
