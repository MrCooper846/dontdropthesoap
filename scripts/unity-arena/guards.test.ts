import { expect, it } from "vitest";
import { UnityStore } from "./store";
import { reconnectReady } from "./clients";
it("rejects database URL option overrides outside the isolated local Unity database", async () => {
  const base =
    "postgresql://soap:fixture@127.0.0.1:55436/soap_unity_restaurant";
  for (const suffix of ["?host=remote.example", "?port=5432", "#override"])
    expect(() => new UnityStore(base + suffix)).toThrow("isolated local");
  expect(() => new UnityStore(base.replace("55436", "55435"))).toThrow(
    "isolated local",
  );
  const accepted = new UnityStore(base);
  await accepted.db.end();
});
it("requires a connected same-profile session instead of an initial empty native cache", () => {
  const previous = { screen: "active", playerId: "original", shiftId: "shift" };
  expect(reconnectReady({} as never, previous)).toBe(false);
  expect(
    reconnectReady(
      { screen: "lobby", connected: true, playerId: "other" },
      previous,
    ),
  ).toBe(false);
  expect(
    reconnectReady(
      { screen: "lobby", connected: true, playerId: "original" },
      previous,
    ),
  ).toBe(false);
  expect(
    reconnectReady(
      {
        screen: "finished",
        connected: true,
        playerId: "original",
        shiftId: "shift",
        shift: { phase: "finished" },
      },
      previous,
    ),
  ).toBe(true);
});
