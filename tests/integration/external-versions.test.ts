import { beforeAll, afterAll, it, expect } from "vitest";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest, authenticate, csrf } from "../../server/auth/sessions";
import {
  createExternalBot,
  mintCredential,
  acquireBot,
} from "../../server/bots/identity";
import { createMatch, addSeat, makeSeat } from "../../domain/match/engine";
import { saveMatch } from "../../server/matches/repository";
import { entrant } from "../../server/bots/participation";
import { createBatch, registerEntry } from "../../server/league/service";
import { api } from "../../server/http";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test"))
  throw Error("External version fixture requires soap_test");
beforeAll(migrate);
afterAll(() => pool.end());

it("publishes external declarations over HTTP with retry/concurrency/security and frozen admitted version references", async () => {
  const guest = await createGuest("Revision owner");
  const req = {
    headers: { cookie: "dds_session=" + guest.secret },
  } as IncomingMessage;
  const principal = await authenticate(req);
  const bot = await createExternalBot(req, {
    name: "Revision snake",
    externalLabel: "v1",
    controllerEpoch: 0,
  });
  const token = await mintCredential(req, bot.id, { controllerEpoch: 0 });
  const botReq = {
    headers: { authorization: "Bearer " + token.secret },
  } as IncomingMessage;
  await acquireBot(botReq);
  const match = createMatch(
    randomUUID(),
    guest.ownerId,
    "mixed",
    { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 8 },
    Date.now(),
    1,
  );
  addSeat(
    match,
    makeSeat(
      randomUUID(),
      guest.ownerId,
      bot.name,
      "external",
      bot.id,
      bot.versionId,
    ),
  );
  await transaction((db) => saveMatch(db, match));
  const batch = await transaction((db) =>
    createBatch(req, { name: "Before revision" }, db),
  );
  const ownedBatches = [batch.id];
  const oldEntry = await transaction((db) =>
    registerEntry(req, batch.id, { botId: bot.id }, db),
  );
  const server = createServer((request, response) => {
    void api(
      request,
      response,
      () => true,
      () => {},
    ).catch(() => response.destroy());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const base =
    "http://127.0.0.1:" + address.port + "/api/v1/bots/" + bot.id + "/versions";
  const headers = {
    cookie: req.headers.cookie!,
    Origin: config.PUBLIC_ORIGIN,
    "Content-Type": "application/json",
    "x-csrf-token": csrf(principal),
  };
  async function envelope(label: string) {
    const key = randomUUID();
    await pool.query(
      "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [key, principal.id],
    );
    return {
      key,
      commandId: randomUUID(),
      controllerEpoch: 0,
      payload: { externalLabel: label },
    };
  }
  const post = (input: unknown, supplied = headers) =>
    fetch(base, {
      method: "POST",
      headers: supplied,
      body: JSON.stringify(input),
    });
  try {
    const data = await envelope("v2");
    const response = await post(data);
    expect(response.status).toBe(201);
    const v2 = await response.json();
    expect(v2.revision).toBe(2);
    expect(v2.externalLabel).toBe("v2");
    expect(await (await post(data)).json()).toEqual(v2);
    expect(
      (await post({ ...data, payload: { externalLabel: "changed" } })).status,
    ).toBe(400);
    const old = await (
      await fetch(base + "/" + bot.versionId, { headers })
    ).json();
    expect(old.external_label).toBe("v1");
    expect(Object.keys(old).sort()).toEqual(
      ["bot_id", "external_label", "revision", "version_id"].sort(),
    );
    expect(
      (
        await post(await envelope("bad csrf"), {
          ...headers,
          "x-csrf-token": "wrong",
        })
      ).status,
    ).toBe(403);
    expect(
      (await post({ ...(await envelope("stale")), controllerEpoch: 999 }))
        .status,
    ).toBe(400);
    expect((await post(await envelope(" ".repeat(101)))).status).toBe(400);
    const outsider = await createGuest("Revision outsider");
    const otherReq = {
      headers: { cookie: "dds_session=" + outsider.secret },
    } as IncomingMessage;
    const other = await authenticate(otherReq);
    expect(
      (
        await fetch(base + "/latest", {
          headers: { cookie: otherReq.headers.cookie! },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(data, {
          ...headers,
          cookie: otherReq.headers.cookie!,
          "x-csrf-token": csrf(other),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(base + "/latest", {
          headers: { authorization: "Bearer " + token.secret },
        })
      ).status,
    ).toBe(403);
    const inputs = await Promise.all([envelope("v3"), envelope("v4")]);
    const versions = await Promise.all(
      inputs.map(async (input) => {
        const r = await post(input);
        expect(r.status).toBe(201);
        return r.json();
      }),
    );
    expect(versions.map((v) => v.revision).sort()).toEqual([3, 4]);
    const latest = await (await fetch(base + "/latest", { headers })).json();
    expect(latest.revision).toBe(4);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM bot_versions WHERE bot_id=$1",
            [bot.id],
          )
        ).rows[0].n,
      ),
    ).toBe(4);
    expect(
      (
        await pool.query(
          "SELECT bot_version_id FROM match_seats WHERE match_id=$1",
          [match.id],
        )
      ).rows[0].bot_version_id,
    ).toBe(bot.versionId);
    expect(
      (
        await pool.query(
          "SELECT bot_version_id FROM league_entries WHERE id=$1",
          [oldEntry.id],
        )
      ).rows[0].bot_version_id,
    ).toBe(bot.versionId);
    expect(
      (await transaction((db) => entrant(db, principal, bot.id))).botVersionId,
    ).toBe(latest.version_id);
    const nextBatch = await transaction((db) =>
      createBatch(req, { name: "After revision" }, db),
    );
    ownedBatches.push(nextBatch.id);
    const nextEntry = await transaction((db) =>
      registerEntry(req, nextBatch.id, { botId: bot.id }, db),
    );
    expect(nextEntry.versionId).toBe(latest.version_id);
    await expect(
      pool.query(
        "UPDATE bot_versions SET external_label='rewrite' WHERE id=$1",
        [bot.versionId],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      pool.query("DELETE FROM bot_versions WHERE id=$1", [latest.version_id]),
    ).rejects.toThrow(/immutable/);
  } finally {
    // Exact IDs created by this fixture only; leave no live registration timers.
    await pool.query(
      "UPDATE league_batches SET state='cancelled' WHERE id=ANY($1::uuid[]) AND state='registration'",
      [ownedBatches],
    );
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
