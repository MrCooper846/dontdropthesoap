import { test, expect } from "@playwright/test";
import { starter } from "../../../shared/bots/presets";
test("league HTTP fences mutations and hides private bot state from public visitors", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (let i = 0; i < 2; i++) {
      await pages[i].goto("/leagues");
      await pages[i].evaluate(async (name) => {
        const r = await fetch("/api/v1/session/guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!r.ok) throw Error("Guest setup failed");
      }, "League API " + i);
    }
    const result = await pages[0].evaluate(async (workspace) => {
      const session = await (await fetch("/api/v1/session")).json();
      async function post(
        path: string,
        data: unknown,
        token = session.csrfToken,
      ) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const r = await fetch("/api/v1" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": token,
          },
          body: JSON.stringify(data),
        });
        return { status: r.status, body: await r.json() };
      }
      async function envelope(payload: unknown) {
        return {
          commandId: crypto.randomUUID(),
          key: (await post("/command-keys", {})).body.key,
          controllerEpoch: session.controllerEpoch,
          payload,
        };
      }
      const initial = await envelope({ name: "Security league" });
      const denied = await post("/leagues", initial, "invalid");
      const batch = await post("/leagues", initial);
      const retry = await post("/leagues", initial);
      const forged = await post("/leagues", {
        ...initial,
        payload: { name: "Changed" },
      });
      const bot = await post(
        "/bots/visual",
        await envelope({ name: "Private strategy", workspace }),
      );
      const foreign = await envelope({ botId: bot.body.id });
      const registration = await post(
        "/leagues/" + batch.body.id + "/register",
        foreign,
      );
      const duplicate = await post(
        "/leagues/" + batch.body.id + "/register",
        await envelope({ botId: bot.body.id }),
      );
      const ruleChange = await post(
        "/leagues/" + batch.body.id + "/close",
        await envelope({ rules: { rounds: 1 } }),
      );
      const tooFew = await post(
        "/leagues/" + batch.body.id + "/close",
        await envelope({}),
      );
      await post("/controller/acquire", {});
      const stale = await post(
        "/leagues/" + batch.body.id + "/withdraw",
        await envelope({}),
      );
      return {
        batch,
        denied,
        retry,
        forged,
        bot,
        registration,
        duplicate,
        ruleChange,
        tooFew,
        stale,
      };
    }, starter("tit-for-tat"));
    expect(result.denied.status).toBe(403);
    expect(result.batch.status).toBe(201);
    expect(result.retry.body).toEqual(result.batch.body);
    expect(result.forged.body.error.code).toBe("COMMAND_ID_REUSED");
    expect(result.registration.status).toBe(200);
    expect(result.duplicate.body.error.code).toBe("ALREADY_REGISTERED");
    expect(result.ruleChange.status).toBe(400);
    expect(result.tooFew.body.error.code).toBe("NOT_READY");
    expect(result.stale.body.error.code).toBe("CONTROLLER_STALE");
    const other = await pages[1].evaluate(
      async ({ batchId, botId }) => {
        const s = await (await fetch("/api/v1/session")).json();
        async function action(action: string, payload: unknown) {
          const headers = {
            "Content-Type": "application/json",
            "x-csrf-token": s.csrfToken,
          };
          const k = await (
            await fetch("/api/v1/command-keys", {
              method: "POST",
              headers,
              body: "{}",
            })
          ).json();
          const r = await fetch("/api/v1/leagues/" + batchId + "/" + action, {
            method: "POST",
            headers,
            body: JSON.stringify({
              commandId: crypto.randomUUID(),
              key: k.key,
              controllerEpoch: s.controllerEpoch,
              payload,
            }),
          });
          return { status: r.status, body: await r.json() };
        }
        return {
          close: await action("close", {}),
          register: await action("register", { botId }),
        };
      },
      { batchId: result.batch.body.id, botId: result.bot.body.id },
    );
    expect(other.close.status).toBe(404);
    expect(other.register.status).toBe(404);
    const anonymous = await browser.newContext();
    try {
      const read = await anonymous.request.get(
        "/api/v1/leagues/" + result.batch.body.id,
      );
      expect(read.status()).toBe(200);
      const payload = await read.json();
      expect(payload.entries).toHaveLength(1);
      expect(JSON.stringify(payload)).not.toMatch(
        /workspace_json|program_json|rngState|secret|csrfToken|memory/,
      );
      expect(
        (
          await anonymous.request.post("/api/v1/leagues", { data: {} })
        ).status(),
      ).toBe(401);
      expect(
        (
          await anonymous.request.get(
            "/api/v1/leagues/" + result.batch.body.id + "?after=-1",
          )
        ).status(),
      ).toBe(400);
      expect(
        (
          await anonymous.request.get("/api/v1/leagues?before=invalid")
        ).status(),
      ).toBe(400);
      expect(
        (
          await anonymous.request.get(
            "/api/v1/leagues/fixtures/" +
              crypto.randomUUID() +
              "/replay?beforeAttempt=0",
          )
        ).status(),
      ).toBe(400);
    } finally {
      await anonymous.close();
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
