import { test, expect } from "@playwright/test";
import { enter } from "../yard/helpers";
test("production scripts hydrate with fresh nonces while inline injection, eval and foreign connections are denied", async ({
  page,
}) => {
  const violations: string[] = [];
  await page.exposeFunction("recordPolicyViolation", (directive: string) =>
    violations.push(directive),
  );
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) => {
      void (window as any).recordPolicyViolation(e.effectiveDirective);
    }),
  );
  const first = await page.goto("/yard");
  const policy = first!.headers()["content-security-policy"];
  expect(first!.headers()["cache-control"]).toContain("no-store");
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(first!.headers()["referrer-policy"]).toBe("no-referrer");
  expect(first!.headers()["x-frame-options"]).toBe("DENY");
  const nonce = policy.match(/'nonce-([^']+)'/)![1];
  const scripts = await page
    .locator("script")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLScriptElement).nonce));
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.every((n) => n === nonce)).toBe(true);
  const forged = await page.request.get("/yard", {
    headers: {
      "x-nonce": nonce,
      "content-security-policy": "script-src 'unsafe-inline'",
    },
  });
  expect(forged.headers()["content-security-policy"]).not.toContain(
    "'nonce-" + nonce + "'",
  );
  expect(await forged.text()).not.toContain('nonce="' + nonce + '"');
  await enter(page, "CSP prisoner");
  await expect(
    page.getByRole("img", { name: "Cartoon prison yard" }),
  ).toBeVisible();
  await page
    .getByLabel("Nearby message", { exact: true })
    .fill("Hydration and sockets work");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Nearby messages")).toContainText(
    "Hydration and sockets work",
  );
  await page.getByRole("link", { name: /Your bots/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your bot stable", exact: true }),
  ).toBeVisible();
  expect(violations).toEqual([]);
  await page.evaluate(() => {
    // CDP Runtime.evaluate intentionally bypasses CSP's eval restriction.
    // Run the attempt in a real document script with the legitimate nonce.
    const trusted = document.createElement("script");
    trusted.nonce =
      document.querySelector("script[nonce]")!.getAttribute("nonce") ||
      (document.querySelector("script[nonce]") as HTMLScriptElement).nonce;
    trusted.textContent = `
      setTimeout(async () => {
        const image = document.createElement("img");
        image.setAttribute("onerror", "window.__cspInjected=true");
        await new Promise((resolve) => {
          image.addEventListener("error", resolve, {once: true});
          image.src = "data:image/png;base64,broken";
          document.body.append(image);
        });
        let evalDenied = false, connectDenied = false;
        try { new Function("window.__cspEvaluated=true")(); } catch { evalDenied = true; }
        try { await fetch("https://forbidden-csp.invalid/"); } catch { connectDenied = true; }
        window.__policyResult = {evalDenied, connectDenied, executed: window.__cspInjected === true || window.__cspEvaluated === true};
      }, 0);
    `;
    document.body.append(trusted);
  });
  await page.waitForFunction(() => !!(window as any).__policyResult);
  const denied = await page.evaluate(() => (window as any).__policyResult);
  expect(denied).toEqual({
    evalDenied: true,
    connectDenied: true,
    executed: false,
  });
  await expect.poll(() => violations).toContain("script-src-attr");
  expect(violations).toContain("script-src");
  expect(violations).toContain("connect-src");
});
