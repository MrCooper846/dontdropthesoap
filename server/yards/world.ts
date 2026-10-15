import { Yard } from "../../domain/yard/yard";
import { YARD_MAP, distance } from "../../shared/yard/map";
import type {
  YardView,
  ChatMessage,
  CircleView,
} from "../../shared/yard/types";
import type { Match } from "../../domain/match/model";
import { RuleError } from "../../domain/match/model";
import { config } from "../config";
import { pool } from "../persistence/db";
export const yard = new Yard(config.MAX_YARD_PLAYERS);
let circles: CircleView[] = YARD_MAP.circles.map((c) => ({
  ...c,
  matchId: null,
  phase: "empty",
  seatCount: 0,
  settings: { rounds: 10, decisionMs: 20000, revealMs: 5000, maxSeats: 8 },
}));
let blocks = new Set<string>();
const chats: {
  message: ChatMessage;
  recipients: Set<string>;
  retainedAt: number;
}[] = [];
export function pruneChat() {
  const now = performance.now();
  while (chats.length && now - chats[0].retainedAt >= 30000) chats.shift();
}
export function blocked(a: string, b: string) {
  return blocks.has(a + ":" + b) || blocks.has(b + ":" + a);
}
export async function refreshBlocks() {
  blocks = new Set(
    (
      await pool.query("SELECT owner_id,blocked_owner_id FROM owner_blocks")
    ).rows.map((r) => r.owner_id + ":" + r.blocked_owner_id),
  );
}
export function requireYard(ownerId: string) {
  if (!yard.active(ownerId))
    throw new RuleError("FORBIDDEN", "Enter the yard first");
}
export function requireNear(ownerId: string, circleId: string) {
  requireYard(ownerId);
  return yard.circle(ownerId, circleId);
}
export function requireNearby(a: string, b: string) {
  requireYard(a);
  requireYard(b);
  const players = yard.snapshot().players;
  const pa = players.find((p) => p.ownerId === a)!,
    pb = players.find((p) => p.ownerId === b)!;
  if (distance(pa, pb) > 256)
    throw new RuleError("TOO_FAR", "Move nearer to this player");
}
export function snapshot(): YardView {
  return {
    ...yard.snapshot(),
    serverTime: Date.now(),
    circles: circles.map((c) => ({ ...c, settings: { ...c.settings } })),
  };
}
export function chatHistory(ownerId: string) {
  pruneChat();
  return chats
    .filter(
      (c) => c.recipients.has(ownerId) && !blocked(c.message.ownerId, ownerId),
    )
    .map((c) => ({ ...c.message }));
}
export function retainChat(message: ChatMessage, recipients: string[]) {
  pruneChat();
  chats.push({
    message,
    recipients: new Set(recipients),
    retainedAt: performance.now(),
  });
  while (chats.length > 256) chats.shift();
}
export async function refreshWorld() {
  const q = await pool.query(
    "SELECT c.*,m.id AS match_id,m.state_json FROM circles c LEFT JOIN matches m ON m.circle_id=c.id AND m.phase NOT IN ('finished','cancelled','aborted') ORDER BY c.id",
  );
  circles = q.rows.map((row) => {
    const m: Match | undefined = row.state_json;
    return {
      id: row.id,
      name: row.name,
      x: row.x,
      y: row.y,
      radius: row.radius,
      mode: m?.mode ?? row.mode,
      matchId: row.match_id ?? null,
      phase: m?.phase ?? "empty",
      seatCount: m?.seats.filter((s) => s.kind !== "system").length ?? 0,
      settings: m?.settings ?? row.settings_json,
    };
  });
  const seated = new Map<string, { x: number; y: number }>();
  for (const row of q.rows) {
    const m: Match | undefined = row.state_json;
    if (!m) continue;
    m.seats.forEach((s, index) => {
      if (s.kind === "human" && s.ownerId && !s.abandoned) {
        const angle = (index / m.seats.length) * Math.PI * 2;
        seated.set(s.ownerId, {
          x: row.x + Math.cos(angle) * 34,
          y: row.y + Math.sin(angle) * 34,
        });
      }
    });
  }
  for (const p of yard.snapshot().players)
    yard.anchor(p.ownerId, seated.get(p.ownerId) ?? null);
}
