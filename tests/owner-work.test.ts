import { it, expect } from "vitest";
import { OwnerAdmission, bindOwnerWork } from "../server/lifecycle/owners";
it("binds repeated authentication once, isolates owners and releases their entries on completion", async () => {
  const owners = new OwnerAdmission(1);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = owners.scope(async () => {
    bindOwnerWork("one");
    bindOwnerWork("one");
    await held;
  });
  expect(owners.activeOwners).toBe(1);
  await expect(
    owners.scope(() => {
      throw Error("must not execute");
    }, "one"),
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  expect(await owners.scope(() => 7, "two")).toBe(7);
  expect(owners.activeOwners).toBe(1);
  release();
  await first;
  expect(owners.activeOwners).toBe(0);
  expect(await owners.scope(() => 9, "one")).toBe(9);
});
it("prevents mixed authority within a request and cleans up failed scopes", async () => {
  const owners = new OwnerAdmission(1);
  await expect(
    owners.scope(() => {
      bindOwnerWork("one");
      bindOwnerWork("two");
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(owners.activeOwners).toBe(0);
  await expect(
    owners.scope(() => {
      throw Error("fixture failure");
    }, "one"),
  ).rejects.toThrow("fixture failure");
  expect(owners.activeOwners).toBe(0);
});
