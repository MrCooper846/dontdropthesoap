import { setTimeout as delay } from "node:timers/promises";
import { Bridge, type NativeObservation } from "./bridge";
export async function performTask(
  bridge: Bridge,
  name: string,
  record: (kind: string, detail: unknown) => Promise<void>,
) {
  let state = await bridge.act({ op: "interact", name });
  const contribution = Number(
    (state.shift?.me as { contribution?: number })?.contribution ?? 0,
  );
  await record("task.begin", { name, observation: state });
  const end = Date.now() + 30000;
  let sawTask = false;
  while (true) {
    const me = state.shift?.me as
      | {
          task?: {
            kind?: string;
            steps?: string[];
            index: number;
            nextAt: number;
            expiresAt: number;
          };
        }
      | undefined;
    const task = me?.task;
    if (!task?.kind || !task.steps?.length) {
      if (sawTask) {
        const completed =
          Number(
            (state.shift?.me as { contribution?: number })?.contribution ?? 0,
          ) > contribution;
        if (!completed)
          throw Error("Native task ended without a completed contribution");
        await record("task.complete", state);
        return state;
      }
    } else {
      sawTask = true;
      const token = task.steps[task.index];
      const serverTime = Number(state.shift?.serverTime);
      if (serverTime >= task.expiresAt)
        throw Error("Native task expired before next visible step");
      if (
        token &&
        serverTime >= task.nextAt &&
        state.controls?.some((c) => c.name === token && c.enabled)
      ) {
        state = await bridge.act({ op: "interact", name: token });
        await record("task.step", { token, observation: state });
        continue;
      }
    }
    if (Date.now() > end)
      throw Error("Native visible-button task did not complete");
    await delay(100);
    state = await bridge.observe();
  }
}
