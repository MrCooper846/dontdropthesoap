import { expect, type Page, type BrowserContext } from "@playwright/test";
export const origin = "http://127.0.0.1:3104";
export async function enter(page: Page, name: string) {
  await page.goto("/yard");
  await page.getByLabel("Nickname", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save alias" }).click();
  await expect(page.getByRole("button", { name: "Enter yard" })).toBeEnabled();
  await page.getByRole("button", { name: "Enter yard" }).click();
  await expect(
    page.getByRole("img", { name: "Cartoon prison yard" }),
  ).toBeVisible({ timeout: 30000 });
}
export async function own(page: Page) {
  const session = await page.request
      .get("/api/v1/session")
      .then((r) => r.json()),
    view = await page.request.get("/api/v1/yard").then((r) => r.json());
  return {
    session,
    view,
    player: view.players.find(
      (p: { ownerId: string }) => p.ownerId === session.ownerId,
    ),
  };
}
export async function walk(page: Page, x: number, y: number) {
  await page
    .getByRole("img", { name: "Cartoon prison yard" })
    .click({ position: { x: 12, y: 12 } });
  const first = (await own(page)).player;
  const horizontal = first.x > x ? "ArrowLeft" : "ArrowRight";
  if (Math.abs(first.x - x) > 12) {
    await page.keyboard.down(horizontal);
    try {
      await expect
        .poll(async () => Math.abs((await own(page)).player.x - x), {
          timeout: 20000,
          intervals: [100],
        })
        .toBeLessThan(12);
    } finally {
      await page.keyboard.up(horizontal);
    }
  }
  const position = (await own(page)).player;
  const vertical = position.y > y ? "ArrowUp" : "ArrowDown";
  if (Math.abs(position.y - y) > 12) {
    await page.keyboard.down(vertical);
    try {
      await expect
        .poll(async () => Math.abs((await own(page)).player.y - y), {
          timeout: 20000,
          intervals: [100],
        })
        .toBeLessThan(12);
    } finally {
      await page.keyboard.up(vertical);
    }
  }
}
export async function post(
  page: Page,
  path: string,
  data: unknown,
  method = "POST",
) {
  const session = await page.request
    .get("/api/v1/session")
    .then((r) => r.json());
  return page.request.fetch("/api/v1" + path, {
    method,
    headers: { Origin: origin, "x-csrf-token": session.csrfToken },
    data,
  });
}
export async function creation(page: Page, path: string, payload: unknown) {
  const s = await page.request.get("/api/v1/session").then((r) => r.json()),
    { key } = await post(page, "/command-keys", {}).then((r) => r.json());
  return post(page, path, {
    key,
    commandId: crypto.randomUUID(),
    controllerEpoch: s.controllerEpoch,
    payload,
  }).then((r) => r.json());
}
export async function speedReveal(page: Page) {
  await expect
    .poll(
      async () =>
        (await own(page)).view.circles.filter(
          (c: { matchId: string | null }) => c.matchId,
        ).length,
    )
    .toBeGreaterThan(0);
  const { session, view } = await own(page),
    circle = view.circles.find((c: { matchId: string | null }) => c.matchId),
    m = await page.request
      .get("/api/v1/matches/" + circle.matchId)
      .then((r) => r.json());
  const ack = await post(page, "/commands", {
    v: 1,
    type: "match.configure",
    commandId: crypto.randomUUID(),
    controllerEpoch: session.controllerEpoch,
    matchId: m.id,
    matchVersion: m.version,
    payload: { ...m.settings, revealMs: 1000 },
  }).then((r) => r.json());
  expect(ack.ok).toBe(true);
}
