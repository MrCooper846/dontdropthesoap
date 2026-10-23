import { randomInt, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PoolClient } from "pg";
import { z } from "zod";
import { authenticate, type Principal } from "../auth/sessions";
import { resource } from "../commands/resources";
import { transaction, dbTime } from "../persistence/db";
import { body, json } from "../http";
import { matchesOpen } from "../operators/maintenance";
import { RuleError } from "../../domain/match/model";
import {
  createShift,
  advance,
  applyAction,
  restaurantView,
  type RestaurantState,
} from "../../domain/restaurant/model";
import {
  RESTAURANT_ROLES,
  RESTAURANT_ZONES,
  type RestaurantAction,
  type RestaurantObservation,
} from "../../shared/restaurant/types";

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join") }).strict(),
  z
    .object({ type: z.literal("role"), role: z.enum(RESTAURANT_ROLES) })
    .strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z
    .object({ type: z.literal("move"), zone: z.enum(RESTAURANT_ZONES) })
    .strict(),
  z
    .object({
      type: z.literal("begin"),
      kind: z.enum(["cook", "drink", "serve", "wash", "restock"]),
      orderId: z.string().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("step"), value: z.string().min(1).max(40) })
    .strict(),
  z.object({ type: z.literal("cancel") }).strict(),
  z.object({ type: z.literal("deposit") }).strict(),
  z
    .object({
      type: z.literal("steal"),
      amount: z.number().int().min(1).max(5),
    })
    .strict(),
  z.object({ type: z.literal("take") }).strict(),
  z
    .object({
      type: z.literal("return"),
      amount: z.number().int().min(1).max(15),
    })
    .strict(),
  z
    .object({ type: z.literal("recover"), dropId: z.string().min(1).max(100) })
    .strict(),
  z.object({ type: z.literal("reconcile") }).strict(),
  z.object({ type: z.literal("search"), targetId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("support") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
]);
const messages: Record<string, string> = {
  NOT_PARTICIPATING: "Join this shift before using its controls.",
  ALREADY_IN_SHIFT:
    "You already have an active restaurant shift. Return to it or leave before joining another.",
  ALREADY_JOINED: "You are already in this crew.",
  WRONG_ROLE:
    "That job belongs to another role. Change roles before the shift starts.",
  WRONG_ZONE: "Move to the appropriate room before doing that.",
  WRONG_PHASE: "That action is not available at this stage of the shift.",
  SHIFT_FINISHED: "This shift has finished. Your payout receipt is ready.",
  NOT_HOST: "Only the shift host can start service.",
  CREW_NOT_READY:
    "Service needs four to eight ready prisoners covering chef, waiter, barman and runner.",
  NOT_READY: "All crew members must be ready before service starts.",
  MISSING_ROLES: "A chef, waiter, barman and runner are needed to start.",
  INVALID_CREW: "Service needs four to eight prisoners and all four roles.",
  TOO_FAST: "Wait for the task's timing window before the next step.",
  NO_TASK: "Start a job before choosing a task step.",
  ALREADY_BUSY: "Finish or cancel your current task first.",
  ORDER_NOT_READY:
    "The chef and barman must finish this order before it can be served.",
  ORDER_UNAVAILABLE: "That customer order is no longer available.",
  ALREADY_PREPARED: "That part of the order is already prepared.",
  TASK_RESERVED: "Someone is already working on that job.",
  NO_PLATES: "No clean plates remain. Ask the runner to wash some.",
  NO_DIRTY_PLATES: "There are no dirty plates to wash yet.",
  STOCK_FULL: "Enough supplies remain. Restock when stock is eight or lower.",
  NO_STOCK: "Supplies are empty. Ask the runner to restock.",
  VAULT_EMPTY: "The vault does not contain enough noodles for that action.",
  THEFT_CLOSED:
    "Theft is unavailable: you may be caught, searched, at the carrying limit or near closing.",
  SEARCH_IN_PROGRESS: "An approved search is in progress. Wait for its result.",
  SEARCH_COOLDOWN:
    "Wait for the search cooldown before calling another search.",
  CANNOT_SUPPORT:
    "You cannot support this search. Be nearby and do not search yourself.",
  SUPPORTERS_UNAVAILABLE:
    "Search supporters must remain present with the target.",
};
async function locked(db: PoolClient) {
  await db.query("SELECT pg_advisory_xact_lock(724107)");
}
async function wallet(db: PoolClient, id: string) {
  const q = await db.query(
    "SELECT coalesce(sum(amount),0)::text AS balance FROM restaurant_wallet_entries WHERE owner_id=$1",
    [id],
  );
  const balance = Number(q.rows[0].balance);
  if (!Number.isSafeInteger(balance))
    throw new RuleError("SERVICE_UNAVAILABLE");
  return balance;
}
async function load(db: PoolClient, id: string) {
  const q = await db.query(
    "SELECT state_json FROM restaurant_shifts WHERE id=$1 FOR UPDATE",
    [id],
  );
  if (!q.rowCount)
    throw new RuleError("NOT_FOUND", "That restaurant shift does not exist.");
  return q.rows[0].state_json as RestaurantState;
}
async function save(db: PoolClient, s: RestaurantState) {
  await db.query(
    "UPDATE restaurant_shifts SET state_json=$2,host_id=$3,updated_at=now() WHERE id=$1",
    [s.id, JSON.stringify(s), s.hostId],
  );
  for (const c of s.crew)
    await db.query(
      `INSERT INTO restaurant_members(shift_id,owner_id,active) VALUES($1,$2,$3)
  ON CONFLICT(shift_id,owner_id) DO UPDATE SET active=excluded.active`,
      [s.id, c.id, s.phase !== "finished" && c.active],
    );
  if (s.phase === "finished") {
    const total = s.receipts?.reduce((n, r) => n + r.total, 0);
    if (total !== s.revenue - s.spent)
      throw new RuleError(
        "SERVICE_UNAVAILABLE",
        "Payout accounting requires review.",
      );
    for (const r of s.receipts ?? []) {
      if (!Number.isSafeInteger(r.total) || r.total < 0)
        throw new RuleError("SERVICE_UNAVAILABLE");
      await db.query(
        "INSERT INTO restaurant_wallet_entries(owner_id,shift_id,amount) VALUES($1,$2,$3) ON CONFLICT(shift_id,owner_id) DO NOTHING",
        [r.ownerId, s.id, r.total],
      );
      const entry = await db.query(
        "SELECT amount FROM restaurant_wallet_entries WHERE shift_id=$1 AND owner_id=$2",
        [s.id, r.ownerId],
      );
      if (entry.rows[0]?.amount !== r.total)
        throw new RuleError("SERVICE_UNAVAILABLE");
    }
  }
}
function observation(
  s: RestaurantState,
  p: Principal,
  now: number,
): RestaurantObservation {
  const own = s.crew.find((c) => c.id === p.ownerId);
  if (own) return restaurantView(s, p.ownerId, now);
  // Outsiders can inspect a lobby; never send a different member's private projection.
  const {
    me: _me,
    receipts: _receipts,
    ...publicState
  } = restaurantView(s, s.crew[0].id, now);
  return { ...publicState, me: null, receipts: null };
}
async function available(db: PoolClient, ownerId: string, except?: string) {
  const q = await db.query(
    "SELECT shift_id FROM restaurant_members WHERE owner_id=$1 AND active AND ($2::uuid IS NULL OR shift_id<>$2)",
    [ownerId, except ?? null],
  );
  for (const row of q.rows) {
    const s = advance(await load(db, row.shift_id), await dbTime(db));
    await save(db, s);
  }
  const remaining = await db.query(
    "SELECT 1 FROM restaurant_members WHERE owner_id=$1 AND active AND ($2::uuid IS NULL OR shift_id<>$2)",
    [ownerId, except ?? null],
  );
  if (remaining.rowCount)
    throw new RuleError("ALREADY_IN_SHIFT", messages.ALREADY_IN_SHIFT);
}
export async function tickRestaurants() {
  await transaction(async (db) => {
    await locked(db);
    const now = await dbTime(db);
    const q = await db.query(
      "SELECT id FROM restaurant_shifts WHERE state_json->>'phase' IN ('waiting','active') ORDER BY updated_at",
    );
    for (const row of q.rows) {
      const old = await load(db, row.id);
      const s = advance(old, now);
      if (s.version !== old.version) await save(db, s);
    }
  });
}
export async function restaurantHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  if (path !== "/restaurant" && !path.startsWith("/restaurant/")) return false;
  const p = await authenticate(req);
  try {
    if (path === "/restaurant" && method === "GET") {
      const result = await transaction(async (db) => {
        const q = await db.query(
          `SELECT r.id,r.state_json->>'phase' AS phase,r.state_json->'durationMs' AS duration,
      o.display_name AS host_name,(SELECT count(*)::int FROM restaurant_members m WHERE m.shift_id=r.id AND m.active) AS players,
      EXISTS(SELECT 1 FROM restaurant_members m WHERE m.shift_id=r.id AND m.owner_id=$1) AS mine
      FROM restaurant_shifts r JOIN owners o ON o.id=r.host_id
      WHERE (r.state_json->>'phase'='waiting' AND EXISTS(SELECT 1 FROM restaurant_members m WHERE m.shift_id=r.id AND m.active))
      OR EXISTS(SELECT 1 FROM restaurant_members m WHERE m.shift_id=r.id AND m.owner_id=$1)
      ORDER BY r.created_at DESC LIMIT 50`,
          [p.ownerId],
        );
        return {
          wallet: await wallet(db, p.ownerId),
          shifts: q.rows.map((r) => ({
            id: r.id,
            hostName: r.host_name,
            phase: r.phase,
            players: r.players,
            durationMs: Number(r.duration),
            mine: r.mine,
          })),
        };
      });
      json(res, 200, result);
      return true;
    }
    if (path === "/restaurant" && method === "POST") {
      const result = await resource(
        req,
        await body(req),
        "restaurant.create",
        async (db, payload) => {
          const options = z
            .object({
              durationSeconds: z
                .union([
                  z.literal(120),
                  z.literal(300),
                  z.literal(600),
                  z.literal(900),
                ])
                .default(600),
            })
            .strict()
            .parse(payload);
          await locked(db);
          if (!(await matchesOpen(db, true)))
            throw new RuleError("ADMISSIONS_PAUSED");
          await available(db, p.ownerId);
          const now = await dbTime(db);
          const count = await db.query(
            "SELECT count(*)::int AS n FROM restaurant_shifts WHERE state_json->>'phase' IN ('waiting','active') AND EXISTS(SELECT 1 FROM restaurant_members m WHERE m.shift_id=restaurant_shifts.id AND m.active)",
          );
          if (count.rows[0].n >= 100)
            throw new RuleError(
              "CAPACITY_FULL",
              "All restaurant shift slots are occupied. Try again later.",
            );
          const s = createShift(
            randomUUID(),
            p.ownerId,
            p.name,
            now,
            options.durationSeconds * 1000,
          );
          await db.query(
            "INSERT INTO restaurant_shifts(id,host_id,state_json) VALUES($1,$2,$3)",
            [s.id, p.ownerId, JSON.stringify(s)],
          );
          await save(db, s);
          return {
            shift: observation(s, p, now),
            wallet: await wallet(db, p.ownerId),
          };
        },
      );
      json(res, 201, result);
      return true;
    }
    const route = path.match(/^\/restaurant\/([^/]+)(?:\/(commands))?$/);
    if (!route) throw new RuleError("NOT_FOUND");
    const id = z.string().uuid().parse(route[1]);
    if (method === "GET" && !route[2]) {
      const result = await transaction(async (db) => {
        await locked(db);
        const now = await dbTime(db);
        let s = await load(db, id);
        const member = s.crew.find((c) => c.id === p.ownerId);
        // Advance first so a late poll cannot erase an already elapsed disconnect grace.
        s = advance(s, now);
        const current = s.crew.find((c) => c.id === p.ownerId);
        if (member && current?.active && s.phase !== "finished")
          current.lastSeen = now;
        await save(db, s);
        return {
          shift: observation(s, p, now),
          wallet: await wallet(db, p.ownerId),
        };
      });
      json(res, 200, result);
      return true;
    }
    if (method === "POST" && route[2] === "commands") {
      const result = await resource(
        req,
        await body(req),
        "restaurant.command:" + id,
        async (db, payload) => {
          const action = actionSchema.parse(payload) as RestaurantAction;
          await locked(db);
          if (action.type === "join" && !(await matchesOpen(db, true)))
            throw new RuleError("ADMISSIONS_PAUSED");
          if (action.type === "join") await available(db, p.ownerId, id);
          const now = await dbTime(db),
            s = applyAction(
              await load(db, id),
              p.ownerId,
              action,
              now,
              randomInt(0, 1000000) / 1000000,
              p.name,
            );
          await save(db, s);
          return {
            shift: observation(s, p, now),
            wallet: await wallet(db, p.ownerId),
          };
        },
      );
      json(res, 200, result);
      return true;
    }
    throw new RuleError("NOT_FOUND");
  } catch (e) {
    if (e instanceof RuleError && e.message === e.code && messages[e.code])
      throw new RuleError(e.code, messages[e.code]);
    throw e;
  }
}
