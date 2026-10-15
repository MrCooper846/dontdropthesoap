import { test, expect } from "@playwright/test";
test("authenticated development server ignores the legacy flag", async ({
  request,
}) => {
  const home = await request.get("/", { maxRedirects: 0 });
  expect(home.status()).toBe(307);
  expect(home.headers().location).toBe("/play");
  const oldPage = await request.get("/create?probe=1", { maxRedirects: 0 });
  expect(oldPage.status()).toBe(302);
  expect(oldPage.headers().location).toBe("/play");
  expect((await request.get("/api/leaderboard")).status()).toBe(404);
});
