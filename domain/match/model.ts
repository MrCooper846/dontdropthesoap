export type Move = "C" | "D";
export type Phase =
  | "waiting"
  | "countdown"
  | "collecting"
  | "revealing"
  | "finished"
  | "cancelled"
  | "aborted";
export type Mode = "human" | "mixed" | "challenge" | "league";
export type Settings = {
  rounds: number;
  decisionMs: number;
  revealMs: number;
  maxSeats: number;
};
export type Seat = {
  id: string;
  ownerId: string | null;
  botId: string | null;
  botVersionId: string | null;
  name: string;
  ownerName?: string | null;
  kind: "human" | "external" | "visual" | "system";
  ready: boolean;
  abandoned: boolean;
  score: number;
  botErrorRound?: number;
  cooperations: number;
  timeouts: number;
};
export type Pair = { id: string; a: string; b: string };
export type Decision = {
  move: Move;
  source: "player" | "bot" | "timeout" | "system";
  acceptedAt: number;
};
export type Result = {
  pairId: string;
  round: number;
  a: string;
  b: string;
  aMove: Move;
  bMove: Move;
  aNet: number;
  bNet: number;
  message: string;
};
export type Match = {
  id: string;
  circleId: string | null;
  hostOwnerId: string;
  mode: Mode;
  rulesetVersion: 1;
  settings: Settings;
  phase: Phase;
  version: number;
  round: number;
  deadline: number | null;
  seats: Seat[];
  pairs: Pair[];
  moves: Record<string, Decision>;
  results: Result[];
  rngState: number;
  clankerMemory: Move;
  interruptions: number;
  abortReason?: "infrastructure";
  createdAt: number;
};
export class RuleError extends Error {
  constructor(
    public code: string,
    message = code,
  ) {
    super(message);
  }
}
export type Clock = () => number;
