import { test, expect } from "@playwright/test";
import { starter } from "../../../shared/bots/presets";
test("visual HTTP enforces CSRF, ownership, workspace limits and idempotent immutable publication", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [owner, other] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    for (const [i, p] of [owner, other].entries()) {
      await p.goto("/yard");
      await p.evaluate(async (name) => {
        await fetch("/api/v1/session/guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }, "Visual API " + i);
    }
    const workspace = starter("tit-for-tat");
    const publication = await owner.evaluate(async (workspace) => {
      const s = await (await fetch("/api/v1/session")).json();
      const post = async (path: string, data: unknown, token = s.csrfToken) => {
        const response = await fetch("/api/v1" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": token,
          },
          body: JSON.stringify(data),
        });
        return { status: response.status, body: await response.json() };
      };
      const noCsrf = await post(
        "/bots/preview",
        { controllerEpoch: s.controllerEpoch, workspace, observation: {} },
        "wrong",
      );
      const key = (await post("/command-keys", {})).body.key;
      const input = {
        commandId: crypto.randomUUID(),
        key,
        controllerEpoch: s.controllerEpoch,
        payload: { name: "API strategy", workspace },
      };
      const initial = await post("/bots/visual", input),
        retry = await post("/bots/visual", input);
      const invalidWorkspace = {
        blocks: {
          languageVersion: 0,
          blocks: [{ type: "javascript_eval", fields: { CODE: "return 'D'" } }],
        },
      };
      const invalid = await post("/bots/preview", {
        controllerEpoch: s.controllerEpoch,
        workspace: invalidWorkspace,
        observation: {},
      });
      const oversized = await post("/bots/preview", {
        controllerEpoch: s.controllerEpoch,
        workspace: { ...workspace, extra: "x".repeat(65537) },
        observation: {},
      });
      return { noCsrf, initial, retry, invalid, oversized };
    }, workspace);
    expect(publication.noCsrf.status).toBe(403);
    expect(publication.initial.status).toBe(201);
    expect(publication.retry.body).toEqual(publication.initial.body);
    expect(publication.invalid.status).toBe(400);
    expect(publication.oversized.status).toBe(400);
    const id = publication.initial.body.id,
      version = publication.initial.body.versionId;
    expect(
      (
        await other.request.get("/api/v1/bots/" + id + "/versions/latest")
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.request.get("/api/v1/bots/" + id + "/versions/" + version)
      ).status(),
    ).toBe(200);
    const missing = await other.request.get(
      "/api/v1/matches/" +
        crypto.randomUUID() +
        "/seats/no-seat/visual-feedback",
    );
    expect(missing.status()).toBe(404);
    const forged = await other.evaluate(
      async ({ id, workspace }) => {
        const s = await (await fetch("/api/v1/session")).json();
        const headers = {
          "Content-Type": "application/json",
          "x-csrf-token": s.csrfToken,
        };
        const key = (
          await (
            await fetch("/api/v1/command-keys", {
              method: "POST",
              headers,
              body: "{}",
            })
          ).json()
        ).key;
        const response = await fetch("/api/v1/bots/" + id + "/versions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            key,
            controllerEpoch: s.controllerEpoch,
            commandId: crypto.randomUUID(),
            payload: { name: "Stolen", workspace },
          }),
        });
        return response.status;
      },
      { id, workspace },
    );
    expect(forged).toBe(404);
  } finally {
    for (const c of contexts) await c.close();
  }
});
