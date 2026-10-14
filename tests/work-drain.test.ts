import { it, expect } from "vitest";
import { WorkDrain } from "../server/lifecycle/work";
it("finishes admitted work while fencing later arrivals and waits through acknowledgement work", async () => {
  const drain = new WorkDrain();
  let release!: () => void,
    ack = false,
    done = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = drain.run(async () => {
    await held;
    ack = true;
    return 7;
  });
  drain.begin();
  drain.begin();
  const waiting = drain.wait().then(() => {
    done = true;
  });
  await expect(
    drain.run(() => {
      throw Error("must not run");
    }),
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  expect(done).toBe(false);
  expect(ack).toBe(false);
  release();
  expect(await request).toBe(7);
  await waiting;
  expect(ack).toBe(true);
  expect(done).toBe(true);
  expect(drain.pendingCount).toBe(0);
});
it("a failed admitted operation settles the drain without swallowing its error", async () => {
  const drain = new WorkDrain();
  const request = drain.run(() => {
    throw Error("fixture failure");
  });
  drain.begin();
  await expect(request).rejects.toThrow("fixture failure");
  await drain.wait();
  expect(drain.pendingCount).toBe(0);
});
