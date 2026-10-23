import {
  type Browser,
  type BrowserContext,
  type Page,
  expect,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { origin, evidenceRoot } from "./config";
import { Store } from "./store";
import { enter, walk, pane } from "../../tests/browser/yard/helpers";
import { z } from "zod";
export function labelledSelect(page: Page, label: string) {
  // Restrict label matches to actual form selects; Blockly SVG text also has labels.
  // Wrapped labels can include their option text, so accept the stable label prefix.
  return page.getByRole("combobox").and(page.getByLabel(label));
}
const target = z
  .object({
    role: z.enum(["button", "link", "textbox", "combobox", "heading", "tab"]),
    name: z.string().min(1).max(200),
  })
  .strict();
export const actionSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("circle"),
      name: z.enum([
        "Trust Issues",
        "Machine Therapy",
        "Noodle Exchange",
        "Snake Pit",
      ]),
    })
    .strict(),
  z.object({ op: z.literal("click"), target }).strict(),
  z
    .object({ op: z.literal("clickText"), text: z.string().min(1).max(200) })
    .strict(),
  z
    .object({
      op: z.literal("fill"),
      label: z.string().min(1).max(200),
      value: z.string().max(2000),
    })
    .strict(),
  z
    .object({
      op: z.literal("select"),
      label: z.string().min(1).max(200),
      value: z.string().max(200),
    })
    .strict(),
  z
    .object({
      op: z.literal("press"),
      key: z.enum([
        "Escape",
        "Enter",
        "Tab",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ]),
    })
    .strict(),
  z
    .object({
      op: z.literal("goto"),
      path: z
        .string()
        .regex(
          /^\/(yard|bots(?:\/build)?|play|leagues)(?:\?[a-zA-Z0-9=&_-]*)?$/,
        ),
    })
    .strict(),
  z
    .object({
      op: z.literal("walk"),
      x: z.number().min(48).max(912),
      y: z.number().min(48).max(592),
    })
    .strict(),
  z
    .object({
      op: z.literal("pane"),
      name: z.enum(["Tables", "Chat", "People"]),
    })
    .strict(),
  z.object({ op: z.literal("reload") }).strict(),
  z.object({ op: z.literal("observe") }).strict(),
]);
export class Player {
  id = randomUUID();
  context!: BrowserContext;
  page!: Page;
  private serial: Promise<unknown> = Promise.resolve();
  faults: Promise<unknown>[] = [];
  private closeWork?: Promise<void>;
  constructor(
    public store: Store,
    public run: string,
    public name: string,
    public claimant: string,
  ) {}
  async open(browser: Browser) {
    mkdirSync(`${evidenceRoot}/${this.run}`, { recursive: true });
    this.context = await browser.newContext({
      baseURL: origin,
      ignoreHTTPSErrors: true,
      viewport: { width: 1440, height: 1000 },
    });
    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(15000);
    this.page.on("pageerror", (e) =>
      this.faults.push(
        this.store.issue(
          this.run,
          "Browser page error: " + e.message.slice(0, 180),
          "bug",
          { player: this.id, message: e.message },
          "pageerror:" + e.message,
        ),
      ),
    );
    this.page.on("response", (r) => {
      if (r.status() >= 500 && r.url().startsWith(origin))
        this.faults.push(
          this.store.issue(
            this.run,
            "Game HTTP " + r.status(),
            "bug",
            { player: this.id, path: new URL(r.url()).pathname },
            "http:" + r.status() + ":" + new URL(r.url()).pathname,
          ),
        );
    });
    await this.store.db.query(
      "INSERT INTO arena.players(id,run_id,name,claimant) VALUES($1,$2,$3,$4)",
      [this.id, this.run, this.name, this.claimant],
    );
    await enter(this.page, this.name);
    await this.store.event(this.run, "player.enter", this.id, {
      name: this.name,
      claimant: this.claimant,
    });
  }
  async observe() {
    const file = `${evidenceRoot}/${this.run}/${this.id}-${randomUUID()}.png`;
    await this.page.screenshot({ path: file, fullPage: true });
    const text = (await this.page.locator("body").innerText()).slice(0, 24000);
    const yardResponse = await this.page.request.get("/api/v1/yard");
    if (!yardResponse.ok() && yardResponse.status() !== 403)
      throw Error("Yard observation unavailable: " + yardResponse.status());
    const state =
      yardResponse.status() === 403 ? null : await yardResponse.json();
    const controls = await this.page
      .locator(
        "button:visible,a:visible,select:visible,input:visible,summary:visible",
      )
      .evaluateAll((elements) =>
        elements
          .map((element) => ({
            tag: element.tagName,
            text: element.textContent?.trim().slice(0, 300),
            label:
              element.getAttribute("aria-label") ??
              (element as HTMLInputElement).labels?.[0]?.textContent?.trim(),
            ...(element instanceof HTMLSelectElement
              ? {
                  options: [...element.options].map((o) => ({
                    value: o.value,
                    label: o.label,
                  })),
                  value: element.value,
                }
              : {}),
          }))
          .slice(0, 200),
      );
    return {
      id: this.id,
      name: this.name,
      url: this.page.url(),
      text,
      controls,
      screenshot: file,
      yard: state,
    };
  }
  async act(input: unknown) {
    const action = actionSchema.parse(input);
    const execute = async () => {
      await this.store.event(this.run, "action.begin", this.id, action);
      try {
        if (action.op === "click")
          await this.page
            .getByRole(action.target.role, {
              name: action.target.name,
              exact: true,
            })
            .click();
        if (action.op === "clickText")
          await this.page.getByText(action.text, { exact: true }).click();
        if (action.op === "fill")
          await this.page
            .getByLabel(action.label, { exact: true })
            .fill(action.value);
        if (action.op === "select")
          await labelledSelect(this.page, action.label).selectOption(
            action.value,
          );
        if (action.op === "press") await this.page.keyboard.press(action.key);
        if (action.op === "goto") await this.page.goto(action.path);
        if (action.op === "walk") await walk(this.page, action.x, action.y);
        if (action.op === "pane") await pane(this.page, action.name);
        if (action.op === "circle") {
          await pane(this.page, "Tables");
          await this.page
            .locator(".circle-card")
            .filter({ hasText: action.name })
            .click();
        }
        if (action.op === "reload") await this.page.reload();
        const result = await this.observe();
        await this.store.event(this.run, "action.complete", this.id, {
          action,
          screenshot: result.screenshot,
        });
        return result;
      } catch (e) {
        await this.store.event(this.run, "action.failed", this.id, {
          action,
          error: String(e),
        });
        // A mistaken exploratory instruction is evidence, not automatically a game bug.
        throw e;
      }
    };
    const task = this.serial.then(execute);
    this.serial = task.catch(() => {});
    return task;
  }
  async get(path: string) {
    const response = await this.page.request.get("/api/v1" + path);
    if (!response.ok()) throw Error(`GET ${path}: ${response.status()}`);
    return response.json();
  }
  async post(path: string, data: unknown) {
    const s = await this.get("/session");
    const response = await this.page.request.post("/api/v1" + path, {
      headers: { Origin: origin, "x-csrf-token": s.csrfToken },
      data,
    });
    const result = await response.json();
    await this.store.event(this.run, "api.action", this.id, {
      path,
      status: response.status(),
      ok: result.ok,
      error: result.error?.code,
    });
    if (!response.ok() || result.ok === false)
      throw Error(
        `POST ${path}: ${response.status()} ${result.error?.code ?? ""}`,
      );
    return result;
  }
  async command(
    matchId: string,
    type: string,
    payload: unknown,
    extra: Record<string, unknown> = {},
  ) {
    const s = await this.get("/session");
    const m = await this.get(`/matches/${matchId}/observation`);
    return this.post("/commands", {
      v: 1,
      commandId: randomUUID(),
      controllerEpoch: s.controllerEpoch,
      matchId,
      type,
      seatId: m.ownSeatId,
      matchVersion: m.version,
      payload,
      ...extra,
    });
  }
  async resource(path: string, payload: Record<string, unknown>) {
    const s = await this.get("/session"),
      { key } = await this.post("/command-keys", {});
    return this.post(path, {
      commandId: randomUUID(),
      key,
      controllerEpoch: s.controllerEpoch,
      ...payload,
    });
  }
  async publish(strategy: string, name: string, botId?: string) {
    await this.page.goto("/bots/build" + (botId ? `?bot=${botId}` : ""));
    await this.page.getByLabel("Bot name", { exact: true }).fill(name);
    await this.page.getByLabel("Starter strategy").selectOption(strategy);
    await this.page
      .getByRole("button", { name: "Load starter", exact: true })
      .click();
    await this.page
      .getByRole("button", { name: "Publish strategy", exact: true })
      .click();
    await expect(
      this.page.getByText(/Published revision \d+\. Enter this bot/),
    ).toBeVisible();
    const id = new URL(this.page.url()).searchParams.get("bot");
    if (!id) throw Error("Published bot has no URL identifier");
    const version = await this.get(`/bots/${id}/versions/latest`);
    await this.store.event(this.run, "bot.published", this.id, {
      botId: id,
      versionId: version.version_id,
      strategy,
    });
    return { id, versionId: version.version_id };
  }
  async backToYard() {
    await this.page.goto("/yard");
    const button = this.page.getByRole("button", {
      name: "Enter yard",
      exact: true,
    });
    await expect(button).toBeVisible();
    await button.click();
    await expect(this.page.getByTestId("yard-canvas")).toHaveAttribute(
      "data-player-visible",
      "true",
      { timeout: 30000 },
    );
  }
  close() {
    return (this.closeWork ??= this.doClose());
  }
  private async doClose() {
    await this.serial;
    if (this.context) {
      try {
        const session = await this.get("/session");
        const active = await this.store.db.query(
          "SELECT DISTINCT m.id FROM matches m JOIN match_seats s ON s.match_id=m.id WHERE s.owner_id=$1 AND m.phase IN ('waiting','countdown','collecting','revealing')",
          [session.ownerId],
        );
        for (const row of active.rows)
          await this.command(row.id, "seat.leave", {});
      } catch (error) {
        await this.store.event(this.run, "cleanup.incomplete", this.id, {
          error: String(error),
        });
      }
      const sessionFile = `${evidenceRoot}/${this.run}/${this.id}-session.json`;
      await this.context.storageState({ path: sessionFile });
      chmodSync(sessionFile, 0o600);
      await this.context.tracing
        .stop({ path: `${evidenceRoot}/${this.run}/${this.id}-trace.zip` })
        .catch(() => {});
      await this.context.close();
    }
    await Promise.all(this.faults);
    await this.store.db.query(
      "UPDATE arena.players SET status='closed' WHERE id=$1",
      [this.id],
    );
  }
}
