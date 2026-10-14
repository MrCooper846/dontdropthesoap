import { parentPort } from "node:worker_threads";
import { execute } from "../../domain/bots/interpreter";
import type { VisualTask } from "./visual-pool";
parentPort!.on(
  "message",
  ({ id, input }: { id: string; input: VisualTask }) => {
    try {
      const result = execute(input.program, input.observation, input.previous);
      parentPort!.postMessage({ id, ok: true, result });
    } catch (error) {
      const failure = error as { code?: unknown };
      parentPort!.postMessage({
        id,
        ok: false,
        error: {
          code: typeof failure?.code === "string" ? failure.code : "BOT_ERROR",
          message: "Visual decision failed",
        },
      });
    }
  },
);
parentPort!.postMessage({ type: "ready" });
