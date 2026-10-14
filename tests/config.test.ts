import { expect, it } from "vitest";
import { readConfig } from "../server/config";
it("rejects invalid ports, flags and missing voice credentials", () => {
  expect(() => readConfig({ PORT: "0" })).toThrow();
  expect(() => readConfig({ FEATURE_YARD: "yes" })).toThrow();
  expect(() => readConfig({ FEATURE_VOICE: "true" })).toThrow();
});
it("rejects insecure production defaults", () => {
  expect(() => readConfig({ NODE_ENV: "production" })).toThrow();
  expect(() =>
    readConfig({
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://soap.example",
    }),
  ).toThrow();
});
