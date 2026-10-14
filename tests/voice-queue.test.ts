import { expect, it } from "vitest";
import { VoiceQueue } from "../server/voice/queue";
it("orders leave/rejoin through delayed work, bounds backlog and continues after rejection", async () => {
  const queue = new VoiceQueue(2),
    order: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const leave = queue.run(async () => {
    await held;
    order.push("leave");
    throw new Error("lost authority");
  });
  const join = queue.run(async () => {
    order.push("join");
    return "new session";
  });
  await expect(queue.run(async () => {})).rejects.toMatchObject({
    code: "RATE_LIMITED",
  });
  release();
  await expect(leave).rejects.toThrow("lost authority");
  await expect(join).resolves.toBe("new session");
  expect(order).toEqual(["leave", "join"]);
  await expect(queue.run(async () => "after")).resolves.toBe("after");
});
