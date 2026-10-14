import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate } from "../../server/persistence/db";
import {
  createGuest,
  authenticate,
  hashSecret,
} from "../../server/auth/sessions";
import {
  createExternalBot,
  mintCredential,
  botPrincipal,
  acquireBot,
  isBotOnline,
  dropCredentialLease,
} from "../../server/bots/identity";
import {
  applyOperator,
  listReports,
  listAudit,
} from "../../server/operators/service";
import { processOperatorEffects } from "../../server/operators/effects";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("Operator tests require isolated soap_test");
const label = "integration-operator";
beforeAll(async () => {
  await migrate();
  await pool.query("TRUNCATE operator_actions CASCADE");
  await pool.query("TRUNCATE reports");
});
afterAll(() => pool.end());
async function owner(name: string) {
  const g = await createGuest(name);
  return {
    req: { headers: { cookie: "dds_session=" + g.secret } } as IncomingMessage,
    id: g.ownerId,
  };
}
function action(kind: string, targetId: string, extra: object = {}) {
  return {
    commandId: randomUUID(),
    action: kind,
    targetId,
    reason: "Synthetic moderation fixture",
    ...extra,
  };
}
it("owner disable/enable is atomic, idempotent and fences both browser and bot access without modifying games", async () => {
  const a = await owner("Moderated owner"),
    b = await createExternalBot(a.req, {
      name: "Owned bot",
      controllerEpoch: 0,
    });
  const token = await mintCredential(a.req, b.id, { controllerEpoch: 0 });
  const ext = {
    headers: { authorization: "Bearer " + token.secret },
  } as IncomingMessage;
  const input = action("owner.disable", a.id);
  expect((await authenticate(a.req)).ownerId).toBe(a.id);
  expect((await botPrincipal(ext)).id).toBe(b.id);
  const first = await applyOperator(label, input);
  expect(await applyOperator(label, input)).toEqual(first);
  await expect(
    applyOperator(label, { ...input, reason: "Changed command" }),
  ).rejects.toThrow("COMMAND_ID_REUSED");
  await expect(authenticate(a.req)).rejects.toThrow("AUTH_REQUIRED");
  await expect(botPrincipal(ext)).rejects.toThrow("AUTH_REQUIRED");
  expect(
    (
      await pool.query("SELECT count(*) FROM operator_actions WHERE id=$1", [
        input.commandId,
      ])
    ).rows[0].count,
  ).toBe("1");
  await expect(
    pool.query("UPDATE operator_actions SET reason='rewrite' WHERE id=$1", [
      input.commandId,
    ]),
  ).rejects.toThrow("immutable");
  await expect(
    pool.query("DELETE FROM operator_actions WHERE id=$1", [input.commandId]),
  ).rejects.toThrow("immutable");
  await applyOperator(label, action("owner.enable", a.id));
  expect((await authenticate(a.req)).epoch).toBe(2);
  expect((await botPrincipal(ext)).id).toBe(b.id);
  const delivered: unknown[] = [];
  await processOperatorEffects((e) => {
    delivered.push(e);
  });
  expect(delivered).not.toContainEqual({
    action: "owner.disable",
    targetId: a.id,
  });
  expect(delivered).toContainEqual({
    action: "owner.enable",
    targetId: a.id,
    epoch: 2,
  });
  const audits = await listAudit(label);
  const privateHash = hashSecret(token.secret);
  expect(JSON.stringify(audits)).not.toContain(token.secret);
  expect(JSON.stringify(audits)).not.toContain(privateHash);
});
it("revocation targets one credential/session and a delayed effect preserves a freshly acquired different credential", async () => {
  const a = await owner("Scoped revocation"),
    b = await createExternalBot(a.req, {
      name: "Two credentials",
      controllerEpoch: 0,
    });
  const one = await mintCredential(a.req, b.id, { controllerEpoch: 0 }),
    two = await mintCredential(a.req, b.id, { controllerEpoch: 0 });
  const req1 = {
    headers: { authorization: "Bearer " + one.secret },
  } as IncomingMessage;
  const req2 = {
    headers: { authorization: "Bearer " + two.secret },
  } as IncomingMessage;
  await acquireBot(req1);
  await applyOperator(label, action("credential.revoke", one.credentialId));
  await expect(botPrincipal(req1)).rejects.toThrow("AUTH_REQUIRED");
  await acquireBot(req2);
  await processOperatorEffects((e) => {
    if (e.action === "credential.revoke") dropCredentialLease(e.targetId);
  });
  expect(isBotOnline(b.id)).toBe(true);
  const session = (await authenticate(a.req)).sessionId;
  await applyOperator(label, action("session.revoke", session));
  await expect(authenticate(a.req)).rejects.toThrow("AUTH_REQUIRED");
  expect((await botPrincipal(req2)).id).toBe(b.id);
});
it("a failed audit insert rolls back the authority change and leaves no delivery marker", async () => {
  const a = await owner("Rollback audit");
  const input = action("owner.disable", a.id);
  await pool.query(
    "CREATE OR REPLACE FUNCTION test_operator_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='" +
      input.commandId +
      "'::uuid THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$",
  );
  await pool.query(
    "CREATE TRIGGER test_operator_audit_failure BEFORE INSERT ON operator_actions FOR EACH ROW EXECUTE FUNCTION test_operator_audit_failure()",
  );
  try {
    await expect(applyOperator(label, input)).rejects.toThrow(
      "forced audit failure",
    );
    expect((await authenticate(a.req)).epoch).toBe(0);
    expect(
      (
        await pool.query("SELECT 1 FROM operator_actions WHERE id=$1", [
          input.commandId,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await pool.query(
      "DROP TRIGGER test_operator_audit_failure ON operator_actions",
    );
    await pool.query("DROP FUNCTION test_operator_audit_failure()");
  }
});
it("reviews preserve original report text and report/audit pages stay bounded with lossless microsecond cursors", async () => {
  const a = await owner("Reporter"),
    b = await owner("Subject");
  const ids = Array.from({ length: 102 }, () => randomUUID());
  await pool.query(
    "INSERT INTO reports(id,reporter_id,subject_owner_id,reason,created_at) SELECT id,$2,$3,'<fixture> report text',clock_timestamp() FROM unnest($1::uuid[]) AS id",
    [ids, a.id, b.id],
  );
  const first = await listReports(label);
  expect(first.reports).toHaveLength(100);
  expect(first.next).not.toBeNull();
  const second = await listReports(label, "open", first.next!);
  expect(second.reports).toHaveLength(2);
  expect(
    new Set([...first.reports, ...second.reports].map((r) => r.id)).size,
  ).toBe(102);
  const change = action("report.review", ids[0], { status: "reviewed" });
  await applyOperator(label, change);
  const row = (
    await pool.query("SELECT reason,status FROM reports WHERE id=$1", [ids[0]])
  ).rows[0];
  expect(row).toEqual({ reason: "<fixture> report text", status: "reviewed" });
  await expect(
    applyOperator("", action("voice.remove", b.id)),
  ).rejects.toThrow();
  await expect(
    applyOperator(label, {
      ...action("voice.remove", b.id),
      secret: "not accepted",
    }),
  ).rejects.toThrow();
  await expect(listReports(label, "open", "invalid")).rejects.toThrow(
    "Invalid report cursor",
  );
  await expect(listAudit(label, "-1")).rejects.toThrow();
});

it("failed asynchronous live delivery remains pending and is retried before its durable marker", async () => {
  const a = await owner("Delivery retry");
  const request = action("voice.remove", a.id);
  await applyOperator(label, request);
  await expect(
    processOperatorEffects(async () => {
      await Promise.resolve();
      throw new Error("synthetic delivery failure");
    }),
  ).rejects.toThrow("synthetic delivery failure");
  expect(
    (
      await pool.query("SELECT 1 FROM operator_effects WHERE action_id=$1", [
        request.commandId,
      ])
    ).rowCount,
  ).toBe(0);
  const delivered: string[] = [];
  await processOperatorEffects(async (e) => {
    await Promise.resolve();
    delivered.push(e.targetId);
  });
  expect(delivered).toContain(a.id);
  expect(
    (
      await pool.query("SELECT 1 FROM operator_effects WHERE action_id=$1", [
        request.commandId,
      ])
    ).rowCount,
  ).toBe(1);
  const again: string[] = [];
  await processOperatorEffects((e) => {
    again.push(e.targetId);
  });
  expect(again).not.toContain(a.id);
});
