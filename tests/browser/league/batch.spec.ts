import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { starter } from "../../../shared/bots/presets";
test("owners register visual and real Python/TypeScript bots, complete a league and inspect public recorded outcomes", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () => browser.newContext()),
  );
  const processes: ChildProcess[] = [];
  try {
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    for (let i = 0; i < 4; i++) {
      await pages[i].goto("/leagues");
      const created = await pages[i].evaluate(
        async ({ name, workspace, external }) => {
          const post = async (path: string, data: unknown, csrf = "") => {
            const r = await fetch("/api/v1" + path, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-csrf-token": csrf,
              },
              body: JSON.stringify(data),
            });
            const v = await r.json();
            if (!r.ok) throw new Error(v.error?.message ?? "Setup failed");
            return v;
          };
          await post("/session/guest", { name });
          const s = await (await fetch("/api/v1/session")).json();
          const resource = async (path: string, payload: unknown) => {
            const { key } = await post("/command-keys", {}, s.csrfToken);
            return post(
              path,
              {
                commandId: crypto.randomUUID(),
                key,
                controllerEpoch: s.controllerEpoch,
                payload,
              },
              s.csrfToken,
            );
          };
          const bot = await resource(
            external ? "/bots" : "/bots/visual",
            external ? { name } : { name, workspace },
          );
          const credential = external
            ? await resource("/bots/" + bot.id + "/credentials", {})
            : null;
          return { id: bot.id, secret: credential?.secret };
        },
        {
          name: "League entrant " + i,
          workspace: starter("cooperate"),
          external: i >= 2,
        },
      );
      if (i >= 2) {
        const child =
          i === 2
            ? spawn(
                process.execPath,
                ["--import", "tsx", "examples/bots/client.ts"],
                {
                  env: {
                    ...process.env,
                    SOAP_URL: "http://127.0.0.1:3109",
                    SOAP_BOT_TOKEN: created.secret,
                    SOAP_STRATEGY: "cooperate",
                  },
                  stdio: "pipe",
                },
              )
            : spawn("python3", ["examples/bots/client.py"], {
                env: {
                  ...process.env,
                  SOAP_URL: "http://127.0.0.1:3109",
                  SOAP_BOT_TOKEN: created.secret,
                  SOAP_STRATEGY: "cooperate",
                },
                stdio: "pipe",
              });
        processes.push(child);
        child.stdout?.resume();
        child.stderr?.resume();
        await expect
          .poll(async () => {
            const r = await pages[i].request.get("/api/v1/bots");
            return (await r.json()).bots.find(
              (b: { id: string; online: boolean }) => b.id === created.id,
            )?.online;
          })
          .toBe(true);
      }
      await pages[i].reload();
    }
    const host = pages[0];
    await host
      .getByLabel("Batch name", { exact: true })
      .fill("The noodle round robin");
    await host
      .getByRole("button", { name: "Open registration", exact: true })
      .click();
    await expect(
      host.getByRole("region", { name: "Selected batch" }),
    ).toBeVisible();
    const batch = new URL(host.url()).searchParams.get("batch")!;
    expect(batch).toBeTruthy();
    for (const p of pages) {
      await p.goto("/leagues?batch=" + batch);
      await p
        .getByRole("button", { name: "Register entrant", exact: true })
        .click();
      await expect(
        p.getByRole("button", { name: "Withdraw entrant", exact: true }),
      ).toBeVisible();
    }
    await expect(
      host.getByRole("heading", { name: "Entrants (4/16)", exact: true }),
    ).toBeVisible();
    await expect(
      host.getByRole("heading", { name: "Provisional schedule", exact: true }),
    ).toBeVisible();
    await host
      .getByRole("button", {
        name: "Close registration and start",
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () => {
          const r = await host.request.get("/api/v1/leagues/" + batch);
          return (await r.json()).batch.state;
        },
        { timeout: 240000, intervals: [1000, 2000] },
      )
      .toBe("finished");
    for (const child of processes) expect(child.exitCode).toBeNull();
    const publicContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const spectator = await publicContext.newPage();
      await spectator.goto("/leagues?batch=" + batch);
      await expect(
        spectator.getByText("Status: finished", { exact: true }),
      ).toBeVisible();
      const data = await (
        await spectator.request.get("/api/v1/leagues/" + batch)
      ).json();
      expect(data.fixtures).toHaveLength(6);
      expect(
        data.fixtures.every(
          (f: { state: string; attempts: number }) =>
            f.state === "settled" && f.attempts === 1,
        ),
      ).toBe(true);
      expect(
        data.standings.map(
          (r: { rank: number; points: number; played: number }) => [
            r.rank,
            r.points,
            r.played,
          ],
        ),
      ).toEqual(Array(4).fill([1, 60, 3]));
      await spectator
        .getByRole("button", { name: "Inspect fixture 1", exact: true })
        .click();
      const recording = spectator.getByRole("region", {
        name: "Recorded fixture",
        exact: true,
      });
      await expect(
        recording.getByRole("heading", { name: "Round 20", exact: true }),
      ).toBeVisible();
      await expect(
        recording.getByText("finished · 20/20 resolved rounds", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await spectator.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await spectator.screenshot({
        path: "test-results/league-mobile.png",
        fullPage: true,
      });
      expect((await spectator.request.get("/api/v1/session")).status()).toBe(
        401,
      );
    } finally {
      await publicContext.close();
    }
  } finally {
    for (const child of processes)
      if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.all(
      processes.map((child) =>
        child.exitCode !== null
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              child.once("exit", () => resolve());
              const timer = setTimeout(() => {
                child.kill("SIGKILL");
                resolve();
              }, 5000);
              timer.unref();
            }),
      ),
    );
    await Promise.all(contexts.map((c) => c.close()));
  }
});
