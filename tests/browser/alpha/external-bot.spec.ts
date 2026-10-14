import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { io } from "socket.io-client";
for (const language of ["typescript", "python"] as const)
  test(
    language +
      " external process plays a human with isolated observations and revocable sockets",
    async ({ browser }) => {
      const a = await browser.newContext(),
        b = await browser.newContext();
      let processHandle: ChildProcess | undefined;
      let wire: ReturnType<typeof io> | undefined;
      try {
        async function owner(context: typeof a, name: string) {
          await context.request.post("/api/v1/session/guest", {
            headers: { Origin: "http://127.0.0.1:3101" },
            data: { name },
          });
          const session = await context.request
            .get("/api/v1/session")
            .then((r) => r.json());
          const control = await context.request
            .post("/api/v1/controller/acquire", {
              headers: {
                Origin: "http://127.0.0.1:3101",
                "x-csrf-token": session.csrfToken,
              },
              data: {},
            })
            .then((r) => r.json());
          return { ...session, controllerEpoch: control.controllerEpoch };
        }
        const human = await owner(a, "Human " + language),
          ownerSession = await owner(b, "Bot owner " + language);
        async function post(
          context: typeof a,
          s: typeof human,
          path: string,
          data: unknown,
          method = "POST",
        ) {
          const r = await context.request.fetch("/api/v1" + path, {
            method,
            headers: {
              Origin: "http://127.0.0.1:3101",
              "x-csrf-token": s.csrfToken,
            },
            data,
          });
          expect(r.ok()).toBe(true);
          const result = await r.json();
          if (result.ok === false) throw new Error(result.error?.code);
          return result;
        }
        async function resource(path: string, payload: unknown) {
          const { key } = await post(b, ownerSession, "/command-keys", {});
          const data = {
            commandId: crypto.randomUUID(),
            key,
            controllerEpoch: ownerSession.controllerEpoch,
            payload,
          };
          const result = await post(b, ownerSession, path, data);
          return { result, data };
        }
        const created = await resource("/bots", { name: "Snake " + language });
        const bot = created.result;
        expect((await post(b, ownerSession, "/bots", created.data)).id).toBe(
          bot.id,
        );
        const minted = await resource("/bots/" + bot.id + "/credentials", {}),
          token = minted.result;
        const replay = await post(
          b,
          ownerSession,
          "/bots/" + bot.id + "/credentials",
          minted.data,
        );
        expect(replay.credentialId).toBe(token.credentialId);
        expect(replay.secret).toBeUndefined();
        expect(replay.secretUnavailable).toBe(true);
        const env = {
          ...globalThis.process.env,
          SOAP_URL: "http://127.0.0.1:3101",
          SOAP_BOT_TOKEN: token.secret,
          SOAP_STRATEGY: "betray",
        };
        processHandle =
          language === "python"
            ? spawn("python3", ["examples/bots/client.py"], {
                env,
                stdio: "ignore",
              })
            : spawn(
                globalThis.process.execPath,
                ["--import", "tsx", "examples/bots/client.ts"],
                { env, stdio: "ignore" },
              );
        await expect
          .poll(
            async () => {
              const { bots } = await b.request
                .get("/api/v1/bots")
                .then((r) => r.json());
              return bots.find((item: { id: string }) => item.id === bot.id)
                ?.online;
            },
            { timeout: 15000 },
          )
          .toBe(true);
        const { key } = await post(a, human, "/command-keys", {}),
          { id } = await post(a, human, "/matches", {
            key,
            commandId: crypto.randomUUID(),
            controllerEpoch: human.controllerEpoch,
            mode: "mixed",
            settings: {
              rounds: 5,
              decisionMs: 10000,
              revealMs: 1000,
              maxSeats: 8,
            },
          });
        const joinKey = await post(b, ownerSession, "/command-keys", {});
        await post(b, ownerSession, "/matches/" + id + "/join", {
          key: joinKey.key,
          commandId: crypto.randomUUID(),
          controllerEpoch: ownerSession.controllerEpoch,
          botId: bot.id,
        });
        const state = () =>
          a.request.get("/api/v1/matches/" + id).then((r) => r.json());
        let current = await state();
        const humanSeat = current.seats.find(
            (s: { kind: string }) => s.kind === "human",
          ).id,
          botSeat = current.seats.find(
            (s: { botId: string }) => s.botId === bot.id,
          ).id;
        const c = (
          s: typeof human,
          type: string,
          seatId: string,
          payload: unknown,
        ) => ({
          v: 1,
          commandId: crypto.randomUUID(),
          controllerEpoch: s.controllerEpoch,
          type,
          matchId: id,
          seatId,
          round: current.round,
          matchVersion: current.version,
          payload,
        });
        await post(
          a,
          human,
          "/commands",
          c(human, "seat.ready", humanSeat, { ready: true }),
        );
        await post(
          b,
          ownerSession,
          "/commands",
          c(ownerSession, "seat.ready", botSeat, { ready: true }),
        );
        current = await state();
        await post(
          a,
          human,
          "/commands",
          c(human, "match.start", humanSeat, {}),
        );
        wire = io("http://127.0.0.1:3101/game-v1", {
          transports: ["websocket"],
          extraHeaders: { Authorization: "Bearer " + token.secret },
          reconnection: false,
        });
        await new Promise<void>((resolve, reject) => {
          wire!.once("connect", resolve);
          wire!.once("connect_error", reject);
        });
        expect(
          (await wire.timeout(5000).emitWithAck("state.sync", { matchId: id }))
            .ok,
        ).toBe(true);
        const unauthorized = await a.request.get("/api/v1/session", {
          headers: { Authorization: "Bearer " + token.secret },
        });
        expect(unauthorized.status()).toBe(403);
        for (let round = 1; round <= 5; round++) {
          await expect
            .poll(async () => {
              current = await state();
              return current.round === round && current.phase === "collecting";
            })
            .toBe(true);
          expect(
            (
              await post(
                a,
                human,
                "/commands",
                c(human, "move.submit", humanSeat, { move: "C" }),
              )
            ).ok,
          ).toBe(true);
          if (round === 1) {
            const observation = await b.request
              .get("/api/v1/matches/" + id, {
                headers: { Authorization: "Bearer " + token.secret },
              })
              .then((r) => r.json());
            if (observation.phase === "collecting") {
              expect(observation.ownSeatId).toBe(botSeat);
              expect(observation).not.toHaveProperty("revealedMoves");
              expect(observation.results).toEqual([]);
            }
          }
        }
        await expect
          .poll(
            async () => {
              current = await state();
              return current.phase;
            },
            { timeout: 15000 },
          )
          .toBe("finished");
        expect(
          current.seats.find((s: { id: string }) => s.id === humanSeat).score,
        ).toBe(-10);
        expect(
          current.seats.find((s: { id: string }) => s.id === botSeat).score,
        ).toBe(15);
        let disconnected = false;
        wire.on("disconnect", () => {
          disconnected = true;
        });
        await post(
          b,
          ownerSession,
          "/bots/" + bot.id + "/credentials/" + token.credentialId,
          { controllerEpoch: ownerSession.controllerEpoch },
          "DELETE",
        );
        await expect.poll(() => disconnected).toBe(true);
        expect(
          (
            await b.request.get("/api/v1/bot/assignments", {
              headers: { Authorization: "Bearer " + token.secret },
            })
          ).status(),
        ).toBe(401);
      } finally {
        wire?.disconnect();
        processHandle?.kill("SIGTERM");
        await a.close();
        await b.close();
      }
    },
  );

test("owner registers a bot, issues and revokes its credential through the browser", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByLabel("Your alias").fill("Studio owner");
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page.getByRole("link", { name: "Manage your bots" }).click();
  await page.getByLabel("Bot name").fill("Studio snake");
  await page.getByRole("button", { name: "Register bot" }).click();
  await expect(
    page.getByRole("heading", { name: "Studio snake" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Issue credential" }).click();
  await expect(page.getByLabel("Bot credential")).toHaveValue(/^[a-f0-9]{64}$/);
  await page.getByRole("button", { name: "Hide credential" }).click();
  await expect(page.getByLabel("Bot credential")).toHaveCount(0);
  await page.getByRole("button", { name: "Manage credentials" }).click();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText(/revoked/)).toBeVisible();
});
