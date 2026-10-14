import { parentPort } from "node:worker_threads";
parentPort.on("message", () => {
  while (true) {}
});
parentPort.postMessage({ type: "ready" });
