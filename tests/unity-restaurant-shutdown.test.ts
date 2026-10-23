import { it, expect } from "vitest";
import { createServer, get } from "node:http";
import {
  closeNativeListener,
  nativeHandler,
} from "../server/unity-restaurant/main";
import { NativeRestaurantService } from "../server/unity-restaurant/service";

it("bounds native shutdown when a client holds an unfinished HTTP request", async () => {
  let received!: () => void;
  const started = new Promise<void>((r) => (received = r));
  const server = createServer(() => received());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const req = get(
    "http://127.0.0.1:" + (server.address() as { port: number }).port + "/poll",
  );
  req.on("error", () => {});
  await started;
  let finished = false;
  const at = Date.now();
  await closeNativeListener(
    server,
    async () => {
      finished = true;
    },
    40,
  );
  expect(Date.now() - at).toBeLessThan(1500);
  expect(finished).toBe(true);
  expect(server.listening).toBe(false);
  req.destroy();
});
it("rejects new native work during shutdown before touching authentication or database", async () => {
  const server = createServer(
    nativeHandler({} as NativeRestaurantService, () => false),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const r = await fetch(
      "http://127.0.0.1:" +
        (server.address() as { port: number }).port +
        "/lobbies",
    );
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe("SERVICE_UNAVAILABLE");
  } finally {
    await closeNativeListener(server, async () => {}, 40);
  }
});
it.skipIf(!process.env.UNITY_TEST_DATABASE_URL)(
  "bounds database shutdown by aborting a stalled transaction without double release",
  async () => {
    const service = new NativeRestaurantService(
      process.env.UNITY_TEST_DATABASE_URL!,
    );
    let entered!: () => void;
    const started = new Promise<void>((r) => (entered = r));
    const work = service.transaction(async (db) => {
      entered();
      await db.query("SELECT pg_sleep(10)");
    });
    void work.catch(() => {});
    await started;
    const queued = service.transaction(
      async () => "unexpected queued completion",
    );
    void queued.catch(() => {});
    const at = Date.now();
    await service.close(40);
    expect(Date.now() - at).toBeLessThan(1500);
    await expect(work).rejects.toThrow();
    await expect(queued).rejects.toThrow();
    const probe = new NativeRestaurantService(
      process.env.UNITY_TEST_DATABASE_URL!,
    );
    try {
      const lockAt = Date.now();
      expect(await probe.transaction(async () => 1)).toBe(1);
      expect(Date.now() - lockAt).toBeLessThan(1500);
    } finally {
      await probe.close();
    }
    await service.close();
    await expect(service.transaction(async () => 1)).rejects.toThrow();
  },
);
