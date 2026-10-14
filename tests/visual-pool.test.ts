import { it, expect } from "vitest";
import { VisualPool } from "../server/bots/visual-pool";
import { validateProgram } from "../domain/bots/program";
const program = validateProgram({
  schemaVersion: 1,
  decision: { op: "return", move: "C" },
});
const observation = {
  round: 1,
  ownScore: 0,
  opponentScore: 0,
  lastOpponentMove: null,
  ownCooperations: 0,
  ownBetrayals: 0,
  opponentCooperations: 0,
  opponentBetrayals: 0,
};
it("real worker threads execute validated programs and isolate their cloned input", async () => {
  const pool = new VisualPool({ size: 2, capacity: 4 });
  try {
    const task = { program, observation: { ...observation } };
    const result = pool.run(task);
    task.observation.round = 9;
    expect((await result).move).toBe("C");
    expect((await pool.run({ program, observation })).steps).toBe(1);
    await expect(
      pool.run({ program, observation: { ...observation, round: 0 } }),
    ).rejects.toMatchObject({ code: "INVALID_OBSERVATION" });
    expect((await pool.run({ program, observation })).move).toBe("C");
  } finally {
    await pool.close();
  }
});
it("terminates an actually hung worker without blocking the game loop, bounds backlog and discards expired jobs", async () => {
  const pool = new VisualPool({
    size: 1,
    capacity: 2,
    executionMs: 80,
    workerURL: new URL("./fixtures/hanging-visual-worker.mjs", import.meta.url),
  });
  let ticks = 0;
  const clock = setInterval(() => ticks++, 5);
  try {
    const hung = pool.run({ program, observation });
    const expired = pool.run({
      program,
      observation,
      deadline: Date.now() + 30,
    });
    await expect(pool.run({ program, observation })).rejects.toMatchObject({
      code: "BOT_BUSY",
    });
    await expect(expired).rejects.toMatchObject({ code: "DECISION_EXPIRED" });
    await expect(hung).rejects.toMatchObject({ code: "WORKER_TIMEOUT" });
    expect(ticks).toBeGreaterThan(3);
    await expect(
      pool.run({ program, observation, deadline: Date.now() - 1 }),
    ).rejects.toMatchObject({ code: "DECISION_EXPIRED" });
  } finally {
    clearInterval(clock);
    await pool.close();
  }
});
it("closing the pool settles queued work and refuses later allocations", async () => {
  const pool = new VisualPool({ size: 1, capacity: 2 });
  const pending = pool.run({ program, observation });
  const assertion = expect(pending).rejects.toMatchObject({
    code: "WORKER_UNAVAILABLE",
  });
  await pool.close();
  await assertion;
  await expect(pool.run({ program, observation })).rejects.toMatchObject({
    code: "WORKER_UNAVAILABLE",
  });
});

it("rejects malformed native worker output without crashing the parent loop", async () => {
  const pool = new VisualPool({
    size: 1,
    workerURL: new URL(
      "./fixtures/malformed-visual-worker.mjs",
      import.meta.url,
    ),
  });
  try {
    await expect(pool.run({ program, observation })).rejects.toMatchObject({
      code: "BOT_ERROR",
    });
  } finally {
    await pool.close();
  }
});
