import { setTimeout as delay } from "node:timers/promises";
import { existsSync, statSync } from "node:fs";
export type NativeObservation = {
  screen: string;
  playerId?: string;
  profile?: string;
  shiftId?: string;
  wallet?: number;
  shift?: Record<string, unknown>;
  world?: Record<string, unknown>;
  position?: { x: number; z: number };
  nearby?: {
    id: string;
    name: string;
    x: number;
    z: number;
    zone: string;
    kind: string;
    table?: number;
  }[];
  controls?: { name: string; enabled: boolean }[];
  error?: string;
  busy?: boolean;
  connected?: boolean;
  walking?: boolean;
  completedActionId?: number;
  pendingActions?: number;
  screenshotPath?: string;
};
export type NativeAction = {
  op:
    | "nickname"
    | "create"
    | "join"
    | "role"
    | "ready"
    | "start"
    | "walkTo"
    | "move"
    | "stop"
    | "interact"
    | "screenshot";
  name?: string;
  value?: string;
  id?: string;
  x?: number;
  z?: number;
  durationSeconds?: number;
  ready?: boolean;
};
export class Bridge {
  readonly base: string;
  constructor(readonly port: number) {
    if (!Number.isInteger(port) || port < 21101 || port > 21104)
      throw Error("Bridge port must be21101..21104");
    this.base = "http://127.0.0.1:" + port;
  }
  async observe(): Promise<NativeObservation> {
    const response = await fetch(this.base + "/observe", {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("Unity observation HTTP" + response.status);
    return response.json();
  }
  async act(action: NativeAction) {
    // Deliberately no raw API command/action escape hatch: interact only invokes
    // controls the native human-facing interface currently offers.
    if (action.op === "interact") {
      const before = await this.observe();
      if (!before.controls?.some((c) => c.name === action.name && c.enabled))
        throw Error("Native control is not available: " + action.name);
    }
    const response = await fetch(this.base + "/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw Error(
        "Native control rejected HTTP" +
          response.status +
          ":" +
          (await response.text()).slice(0, 300),
      );
    const acknowledgement = (await response.json()) as {
      accepted?: boolean;
      actionId?: number;
    };
    if (
      acknowledgement.accepted !== true ||
      !Number.isSafeInteger(acknowledgement.actionId)
    )
      throw Error("Native main-thread action was not acknowledged");
    const settled = (state: NativeObservation) => {
      const me = state.shift?.me as Record<string, unknown> | undefined;
      if (
        state.busy ||
        (state.pendingActions ?? 0) > 0 ||
        (state.completedActionId ?? -1) < acknowledgement.actionId!
      )
        return false;
      switch (action.op) {
        case "screenshot":
          return (
            !!state.screenshotPath &&
            existsSync(state.screenshotPath) &&
            statSync(state.screenshotPath).size > 0
          );
        case "nickname":
          return state.connected === true && !!state.playerId;
        case "create":
          return (
            !!state.shiftId && state.shift?.phase === "waiting" && !!me?.active
          );
        case "join":
          return state.shiftId === action.id && !!me?.active;
        case "role":
          return me?.role === action.value;
        case "ready":
          return me?.ready === action.ready;
        case "start":
          return state.shift?.phase === "active";
        default:
          return true;
      }
    };
    await delay(150);
    let state = await this.observe();
    const end = Date.now() + 15000;
    while (!settled(state)) {
      if (Date.now() > end)
        throw Error(
          "Native action did not settle: " + (state.error || action.op),
        );
      await delay(100);
      state = await this.observe();
    }
    return state;
  }
}
