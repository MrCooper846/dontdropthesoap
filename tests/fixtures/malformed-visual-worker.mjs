import { parentPort } from "node:worker_threads";
parentPort.on("message", ({ id }) =>
  parentPort.postMessage({ id, ok: true, result: { move: "C", steps: 1 } }),
);
parentPort.postMessage({ type: "ready" });
