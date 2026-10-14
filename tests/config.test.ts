import { expect, it } from "vitest";
import { readConfig } from "../server/config";
it("rejects invalid ports, flags and incompatible voice settings", () => {
  expect(() => readConfig({ PORT: "0" })).toThrow();
  expect(() =>
    readConfig({ VOICE_MIN_PORT: "19000", VOICE_MAX_PORT: "18000" }),
  ).toThrow();
  expect(readConfig({ FEATURE_VOICE: "true" }).FEATURE_VOICE).toBe(true);
  expect(() => readConfig({ FEATURE_YARD: "yes" })).toThrow();
  expect(() =>
    readConfig({ FEATURE_VOICE: "true", FEATURE_YARD: "false" }),
  ).toThrow();
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
