import { test, expect } from "@playwright/test";

test("current server isolates legacy API and redirects old pages with query strings", async ({
  request,
}) => {
  for (const path of [
    "/api/leaderboard",
    "/api/leaderboard?probe=1",
    "/api/%6ceaderboard",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("leaderboard");
  }
  for (const path of [
    "/create",
    "/join?probe=1",
    "/nickname?probe=1",
    "/lobby/example?probe=1",
    "/%63reate?probe=1",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toBe("/yard");
  }
});
