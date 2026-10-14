import { randomUUID, createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { Snapshot } from "../../shared/protocol/commands";
const origin = process.env.SOAP_URL ?? "http://localhost:3000",
  token = process.env.SOAP_BOT_TOKEN,
  strategy = process.env.SOAP_STRATEGY ?? "tit-for-tat",
  seed = process.env.SOAP_RANDOM_SEED ?? "noodles";
if (!token) throw new Error("Set SOAP_BOT_TOKEN to the owned bot credential");
if (!["cooperate", "betray", "tit-for-tat", "random"].includes(strategy))
  throw new Error("Unknown SOAP_STRATEGY");
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
async function api(path: string, data?: unknown) {
  const response = await fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.code ?? "Request failed");
    if (response.status === 401) stopped = true;
    throw error;
  }
  return result;
}
function decide(s: Snapshot): "C" | "D" {
  if (strategy === "cooperate") return "C";
  if (strategy === "betray") return "D";
  if (strategy === "random")
    return createHash("sha256")
      .update(seed + ":" + s.id + ":" + s.round + ":" + s.ownSeatId)
      .digest()[0] < 128
      ? "C"
      : "D";
  const pair = s.pairs.find((p) => p.a === s.ownSeatId || p.b === s.ownSeatId);
  if (!pair) return "C";
  const opponent = pair.a === s.ownSeatId ? pair.b : pair.a;
  const last = [...s.results]
    .reverse()
    .find(
      (r) =>
        (r.a === s.ownSeatId && r.b === opponent) ||
        (r.b === s.ownSeatId && r.a === opponent),
    );
  return last && (last.a === opponent ? last.aMove : last.bMove) === "D"
    ? "D"
    : "C";
}
async function run() {
  let epoch: number | null = null,
    heartbeatAt = 0;
  const pending = new Map<string, Record<string, unknown>>();
  while (!stopped) {
    try {
      if (epoch === null) {
        epoch = (await api("/bot-controller/acquire", {})).controllerEpoch;
        pending.clear();
        console.log("Bot controller acquired");
      }
      if (Date.now() - heartbeatAt >= 5000) {
        await api("/bot-controller/heartbeat", { controllerEpoch: epoch });
        heartbeatAt = Date.now();
      }
      const { assignments } = await api("/bot/assignments");
      for (const s of assignments as Snapshot[]) {
        if (
          s.phase !== "collecting" ||
          !s.ownSeatId ||
          s.ownMove ||
          s.deadline! <= Date.now()
        )
          continue;
        const key = s.id + ":" + s.round;
        let c = pending.get(key);
        if (!c) {
          c = {
            v: 1,
            commandId: randomUUID(),
            controllerEpoch: epoch,
            matchId: s.id,
            seatId: s.ownSeatId,
            round: s.round,
            payload: { move: decide(s) },
          };
          pending.set(key, c);
        }
        const ack = await api("/matches/" + s.id + "/moves", c);
        if (ack.ok) {
          console.log("Decision accepted for round " + s.round);
          pending.delete(key);
        } else if (
          ["CONTROLLER_STALE", "BOT_OFFLINE"].includes(ack.error?.code)
        ) {
          epoch = null;
          break;
        } else if (
          [
            "MOVE_LOCKED",
            "DEADLINE_PASSED",
            "ROUND_MISMATCH",
            "WRONG_PHASE",
          ].includes(ack.error?.code)
        )
          pending.delete(key);
        else throw new Error(ack.error?.code ?? "Move rejected");
      }
      for (const key of pending.keys())
        if (!assignments.some((s: Snapshot) => key === s.id + ":" + s.round))
          pending.delete(key);
    } catch (e) {
      const code = e instanceof Error ? e.message : "Connection failed";
      if (["CONTROLLER_STALE", "BOT_OFFLINE"].includes(code)) epoch = null;
      if (!stopped) console.error("Bot retry: " + code);
    }
    await sleep(1000);
  }
}
run().catch(() => {
  process.exitCode = 1;
});
