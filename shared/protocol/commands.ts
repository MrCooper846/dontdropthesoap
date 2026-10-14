import { z } from "zod";
export const settingsSchema = z
  .object({
    rounds: z.number().int().min(5).max(50),
    decisionMs: z.number().int().min(5000).max(60000),
    revealMs: z.number().int().min(1000).max(10000),
    maxSeats: z.number().int().min(2).max(8),
  })
  .strict();
const id = z.string().uuid();
export const commandSchema = z
  .object({
    v: z.literal(1),
    commandId: id,
    type: z.enum([
      "move.submit",
      "seat.ready",
      "seat.leave",
      "match.start",
      "match.configure",
    ]),
    controllerEpoch: z.number().int().nonnegative(),
    matchId: id,
    round: z.number().int().nonnegative().optional(),
    seatId: z.string().min(1).max(100).optional(),
    matchVersion: z.number().int().nonnegative().optional(),
    payload: z.unknown(),
  })
  .strict();
export const moveSchema = z.object({ move: z.enum(["C", "D"]) }).strict();
export const readySchema = z.object({ ready: z.boolean() }).strict();
export type Command = z.infer<typeof commandSchema>;
export type Snapshot = ReturnType<
  typeof import("../../domain/match/engine").project
>;
export type Ack = {
  v: 1;
  commandId: string;
  ok: boolean;
  matchVersion?: number;
  result?: unknown;
  error?: { code: string; message: string; retryable: boolean };
};
