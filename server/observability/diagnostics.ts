import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { commandSchema } from "../../shared/protocol/commands";
import { increment } from "./metrics";

const requests = new WeakMap<
  IncomingMessage,
  { requestId: string; started: number }
>();
// Fixed application codes only; never serialize an arbitrary exception field.
const codes = new Set([
  "ADMISSIONS_PAUSED",
  "ALREADY_REGISTERED",
  "ALREADY_SEATED",
  "AUTH_REQUIRED",
  "BOT_BUSY",
  "BOT_ERROR",
  "BOT_OFFLINE",
  "CAPACITY_FULL",
  "COMMAND_ID_REUSED",
  "CONFLICT",
  "CONTROLLER_STALE",
  "DEADLINE_PASSED",
  "DECISION_EXPIRED",
  "DUPLICATE_ENTRY",
  "DUPLICATE_SETTLEMENT",
  "FORBIDDEN",
  "HISTORY_EXPIRED",
  "INVALID_OBSERVATION",
  "INVALID_PAYLOAD",
  "INVALID_ROSTER",
  "INVALID_SETTLEMENT",
  "INVALID_STATE",
  "INVALID_WORKSPACE",
  "INVITE_EXPIRED",
  "KEY_EXPIRED",
  "MEMORY_LIMIT",
  "MOVE_LOCKED",
  "NOT_FOUND",
  "NOT_READY",
  "NUMERIC_LIMIT",
  "PROGRAM_LIMIT",
  "RATE_LIMITED",
  "REGISTRATION_CLOSED",
  "REQUEST_ABORTED",
  "ROUND_MISMATCH",
  "SERVICE_UNAVAILABLE",
  "STEP_LIMIT",
  "TOO_FAR",
  "VERSION_CONFLICT",
  "VERSION_UNSUPPORTED",
  "WORKER_TIMEOUT",
  "WORKER_UNAVAILABLE",
  "WRONG_PHASE",
]);
const correlation = z.object({
  commandId: z.string().uuid(),
  matchId: z.string().uuid(),
  type: commandSchema.shape.type,
});
const latency = (started: number) =>
  Math.round(Math.max(0, Math.min(86400000, performance.now() - started)));
let windowStarted = performance.now(),
  emitted = 0;
// No queued log records: shed diagnostics under input floods or a blocked stderr.
function emit(record: Record<string, unknown>) {
  const now = performance.now();
  if (now - windowStarted >= 1000) {
    windowStarted = now;
    emitted = 0;
  }
  if (emitted >= 20 || process.stderr.writableLength >= 262144) {
    increment("logging.dropped");
    return;
  }
  emitted++;
  try {
    console.error(JSON.stringify(record));
  } catch {
    increment("logging.dropped");
  }
}
export function beginRequest(req: IncomingMessage, res: ServerResponse) {
  const context = { requestId: randomUUID(), started: performance.now() };
  requests.set(req, context);
  res.setHeader("X-Request-ID", context.requestId);
}
export function httpFailure(req: IncomingMessage, data: unknown) {
  const context = requests.get(req);
  if (!context) return;
  const error = z
    .object({ error: z.object({ code: z.string() }) })
    .safeParse(data);
  emit({
    event: "api.error",
    requestId: context.requestId,
    latencyMs: latency(context.started),
    code:
      error.success && codes.has(error.data.error.code)
        ? error.data.error.code
        : "INTERNAL_ERROR",
  });
}
export function commandFailure(
  req: IncomingMessage,
  input: unknown,
  started: number,
  code: string,
) {
  const parsed = correlation.safeParse(input);
  emit({
    event: "command.rejected",
    requestId: requests.get(req)?.requestId ?? randomUUID(),
    ...(parsed.success
      ? {
          commandId: parsed.data.commandId,
          matchId: parsed.data.matchId,
          action: parsed.data.type,
        }
      : {}),
    latencyMs: latency(started),
    code: codes.has(code) ? code : "INTERNAL_ERROR",
  });
}
