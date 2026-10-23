import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Pool, Client, type PoolClient } from "pg";
import { z } from "zod";
import {
  createShift,
  restaurantView,
  RuleError,
} from "../../domain/restaurant/model";
import { RESTAURANT_ROLES } from "../../shared/restaurant/types";
import { UNITY_MAP } from "../../shared/unity-restaurant/map";
import {
  createWorld,
  applyNativeAction,
  applyInput,
  advanceNative,
  worldView,
  type NativeShift,
} from "./world";

export function validateDatabase(value: string) {
  const u = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    u.port !== "55436" ||
    u.pathname !== "/soap_unity_restaurant" ||
    u.search !== "" ||
    u.hash !== ""
  )
    throw new Error(
      "Native restaurant requires its dedicated local database on port 55436.",
    );
  return value;
}
const uuid = z.string().uuid();
export const nativeActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join") }).strict(),
  z
    .object({ type: z.literal("role"), role: z.enum(RESTAURANT_ROLES) })
    .strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z.object({ type: z.literal("start") }).strict(),
  z
    .object({
      type: z.literal("begin"),
      kind: z.enum(["cook", "drink", "serve", "wash", "restock"]),
      orderId: z.string().min(1).max(150).optional(),
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
    .object({ type: z.literal("recover"), dropId: z.string().min(1).max(150) })
    .strict(),
  z.object({ type: z.literal("reconcile") }).strict(),
  z.object({ type: z.literal("search"), targetId: uuid }).strict(),
  z.object({ type: z.literal("support") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z
    .object({ type: z.literal("pickup"), orderId: z.string().min(1).max(150) })
    .strict(),
  z.object({ type: z.literal("drop") }).strict(),
]);
export const inputSchema = z
  .object({
    seq: z.number().int().min(0).max(2147483647),
    x: z.number().finite().min(-1).max(1),
    z: z.number().finite().min(-1).max(1),
  })
  .strict();
function digest(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
type Player = { id: string; name: string };
const DDL = `
CREATE TABLE IF NOT EXISTS unity_restaurant_players(id uuid PRIMARY KEY,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS unity_restaurant_sessions(token_hash text PRIMARY KEY,player_id uuid NOT NULL REFERENCES unity_restaurant_players(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS unity_restaurant_shifts(id uuid PRIMARY KEY,host_id uuid NOT NULL REFERENCES unity_restaurant_players(id),state_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS unity_restaurant_members(shift_id uuid NOT NULL REFERENCES unity_restaurant_shifts(id),player_id uuid NOT NULL REFERENCES unity_restaurant_players(id),active boolean NOT NULL,PRIMARY KEY(shift_id,player_id));
CREATE INDEX IF NOT EXISTS unity_restaurant_members_active ON unity_restaurant_members(player_id) WHERE active;
CREATE TABLE IF NOT EXISTS unity_restaurant_wallet(id bigserial PRIMARY KEY,player_id uuid NOT NULL REFERENCES unity_restaurant_players(id),shift_id uuid NOT NULL REFERENCES unity_restaurant_shifts(id),amount integer NOT NULL CHECK(amount>=0),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(player_id,shift_id));
CREATE TABLE IF NOT EXISTS unity_restaurant_commands(player_id uuid NOT NULL REFERENCES unity_restaurant_players(id),command_id uuid NOT NULL,payload_hash text NOT NULL,response_json jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(player_id,command_id));
CREATE OR REPLACE FUNCTION unity_restaurant_immutable_wallet() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Native wallet receipts are immutable'; END $$;
DROP TRIGGER IF EXISTS unity_restaurant_wallet_immutable ON unity_restaurant_wallet;
CREATE TRIGGER unity_restaurant_wallet_immutable BEFORE UPDATE OR DELETE ON unity_restaurant_wallet FOR EACH ROW EXECUTE FUNCTION unity_restaurant_immutable_wallet();`;
export class NativeRestaurantService {
  readonly pool: Pool;
  private readonly applicationName = "soap-unity-" + randomUUID();
  private readonly connectionString: string;
  private closing = false;
  private closePromise: Promise<void> | null = null;
  private activeClients = new Set<PoolClient>();
  private forcedClients = new Set<PoolClient>();
  constructor(url: string) {
    this.connectionString = validateDatabase(url);
    this.pool = new Pool({
      connectionString: this.connectionString,
      application_name: this.applicationName,
      max: 8,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
      idle_in_transaction_session_timeout: 10000,
    });
    const connectionError = () => {
      if (!this.closing)
        console.error(
          "Native database connection interrupted; retrying on the next request.",
        );
    };
    this.pool.on("error", connectionError);
    this.pool.on("connect", (db) => db.on("error", connectionError));
  }
  async transaction<T>(
    fn: (db: PoolClient, now: number) => Promise<T>,
  ): Promise<T> {
    if (this.closing) throw new RuleError("SERVICE_UNAVAILABLE");
    const db = await this.pool.connect();
    this.activeClients.add(db);
    try {
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(3157001)");
      const now = Number(
        (
          await db.query(
            "SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS now",
          )
        ).rows[0].now,
      );
      const value = await fn(db, now);
      await db.query("COMMIT");
      return value;
    } catch (e) {
      if (!this.forcedClients.has(db))
        await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      this.activeClients.delete(db);
      if (!this.forcedClients.has(db)) db.release();
    }
  }
  async initialise() {
    await this.transaction(async (db) => {
      if (
        (await db.query("SELECT current_database() AS name")).rows[0].name !==
        "soap_unity_restaurant"
      )
        throw new Error("Wrong native restaurant database.");
      await db.query(DDL);
    });
  }
  close(graceMs = 1000): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      const timer = setTimeout(() => {
        void (async () => {
          const active = [...this.activeClients];
          const ids = active
            .map((db) => (db as PoolClient & { processID?: number }).processID)
            .filter((id): id is number => Number.isInteger(id));
          const canceller = new Client({
            connectionString: this.connectionString,
            application_name: this.applicationName + "-shutdown",
            connectionTimeoutMillis: 500,
            statement_timeout: 500,
            query_timeout: 750,
          });
          canceller.on("error", () => {});
          try {
            if (ids.length) {
              await canceller.connect();
              await canceller.query(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='soap_unity_restaurant' AND application_name=$1 AND pid=ANY($2::int[])",
                [this.applicationName, ids],
              );
            }
          } catch {
            /* Still force local cleanup if the dedicated database is unavailable. */
          } finally {
            await canceller.end().catch(() => {});
            for (const db of active)
              if (this.activeClients.has(db)) {
                this.forcedClients.add(db);
                db.release(true);
              }
          }
        })();
      }, graceMs);
      timer.unref();
      try {
        await this.pool.end();
      } finally {
        clearTimeout(timer);
      }
    })();
    return this.closePromise;
  }
  async session(raw: unknown) {
    const p = z
      .object({
        name: z.string().trim().min(1).max(40),
        token: z.string().min(32).max(200).optional(),
      })
      .strict()
      .parse(raw);
    return this.transaction(async (db) => {
      if (p.token) {
        const who = await this.authenticate(db, p.token);
        return {
          protocolVersion: 1,
          token: p.token,
          playerId: who.id,
          name: who.name,
        };
      }
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await db.query(
        "INSERT INTO unity_restaurant_players(id,name)VALUES($1,$2)",
        [id, p.name],
      );
      await db.query(
        "INSERT INTO unity_restaurant_sessions(token_hash,player_id)VALUES($1,$2)",
        [digest(token), id],
      );
      return { protocolVersion: 1, token, playerId: id, name: p.name };
    });
  }
  async authenticate(db: PoolClient, token: string): Promise<Player> {
    if (!token || token.length > 200) throw new RuleError("UNAUTHENTICATED");
    const q = await db.query(
      "SELECT p.id,p.name FROM unity_restaurant_sessions s JOIN unity_restaurant_players p ON p.id=s.player_id WHERE s.token_hash=$1",
      [digest(token)],
    );
    if (!q.rowCount) throw new RuleError("UNAUTHENTICATED");
    return q.rows[0];
  }
  async wallet(db: PoolClient, id: string) {
    return Number(
      (
        await db.query(
          "SELECT coalesce(sum(amount),0)::int AS n FROM unity_restaurant_wallet WHERE player_id=$1",
          [id],
        )
      ).rows[0].n,
    );
  }
  async load(db: PoolClient, id: string): Promise<NativeShift> {
    const q = await db.query(
      "SELECT state_json FROM unity_restaurant_shifts WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!q.rowCount) throw new RuleError("NOT_FOUND");
    return q.rows[0].state_json;
  }
  async save(db: PoolClient, e: NativeShift) {
    await db.query(
      "UPDATE unity_restaurant_shifts SET state_json=$2,host_id=$3,updated_at=now() WHERE id=$1",
      [e.state.id, JSON.stringify(e), e.state.hostId],
    );
    for (const c of e.state.crew)
      await db.query(
        "INSERT INTO unity_restaurant_members(shift_id,player_id,active)VALUES($1,$2,$3) ON CONFLICT(shift_id,player_id)DO UPDATE SET active=excluded.active",
        [e.state.id, c.id, c.active && e.state.phase !== "finished"],
      );
    if (e.state.phase === "finished") {
      const receipts = e.state.receipts ?? [];
      if (
        receipts.reduce((n, r) => n + r.total, 0) !==
        e.state.revenue - e.state.spent
      )
        throw new RuleError("ACCOUNTING_FAILURE");
      for (const r of receipts) {
        if (!Number.isSafeInteger(r.total) || r.total < 0)
          throw new RuleError("ACCOUNTING_FAILURE");
        await db.query(
          "INSERT INTO unity_restaurant_wallet(player_id,shift_id,amount)VALUES($1,$2,$3) ON CONFLICT(player_id,shift_id)DO NOTHING",
          [r.ownerId, e.state.id, r.total],
        );
        const saved = await db.query(
          "SELECT amount FROM unity_restaurant_wallet WHERE player_id=$1 AND shift_id=$2",
          [r.ownerId, e.state.id],
        );
        if (saved.rows[0].amount !== r.total)
          throw new RuleError("ACCOUNTING_FAILURE");
      }
    }
  }
  async snapshot(db: PoolClient, e: NativeShift, who: Player, now: number) {
    let shift;
    const own = e.state.crew.some((c) => c.id === who.id);
    if (own) shift = restaurantView(e.state, who.id, now);
    else {
      const {
        me: _me,
        receipts: _receipts,
        ...publicFields
      } = restaurantView(e.state, e.state.crew[0].id, now);
      shift = { ...publicFields, me: null, receipts: null };
    }
    return {
      protocolVersion: 1,
      playerId: who.id,
      wallet: await this.wallet(db, who.id),
      shift,
      world: worldView(e, UNITY_MAP),
    };
  }
  async available(db: PoolClient, id: string, except?: string) {
    const q = await db.query(
      "SELECT shift_id FROM unity_restaurant_members WHERE player_id=$1 AND active AND ($2::uuid IS NULL OR shift_id<>$2)",
      [id, except ?? null],
    );
    for (const row of q.rows) {
      const old = await this.load(db, row.shift_id),
        now = Number(
          (
            await db.query(
              "SELECT floor(extract(epoch from clock_timestamp())*1000)::bigint AS now",
            )
          ).rows[0].now,
        );
      await this.save(db, advanceNative(old, now, UNITY_MAP));
    }
    if (
      (
        await db.query(
          "SELECT 1 FROM unity_restaurant_members WHERE player_id=$1 AND active AND ($2::uuid IS NULL OR shift_id<>$2)",
          [id, except ?? null],
        )
      ).rowCount
    )
      throw new RuleError("ALREADY_IN_SHIFT");
  }
  async receipt(
    db: PoolClient,
    who: Player,
    id: string,
    payload: unknown,
    work: () => Promise<unknown>,
  ) {
    const hash = digest(canonical(payload)),
      old = await db.query(
        "SELECT payload_hash,response_json FROM unity_restaurant_commands WHERE player_id=$1 AND command_id=$2",
        [who.id, id],
      );
    if (old.rowCount) {
      if (old.rows[0].payload_hash !== hash)
        throw new RuleError("COMMAND_CONFLICT");
      return old.rows[0].response_json;
    }
    const result = await work();
    await db.query(
      "INSERT INTO unity_restaurant_commands(player_id,command_id,payload_hash,response_json)VALUES($1,$2,$3,$4)",
      [who.id, id, hash, JSON.stringify(result)],
    );
    return result;
  }
  async lobbies(token: string) {
    return this.transaction(async (db, now) => {
      const who = await this.authenticate(db, token);
      const q = await db.query(
        "SELECT state_json FROM unity_restaurant_shifts WHERE state_json->'state'->>'phase'='waiting' OR EXISTS(SELECT 1 FROM unity_restaurant_members m WHERE m.shift_id=unity_restaurant_shifts.id AND m.player_id=$1) ORDER BY created_at DESC LIMIT 100",
        [who.id],
      );
      const lobbies = [];
      for (const row of q.rows) {
        const e = advanceNative(row.state_json, now, UNITY_MAP);
        await this.save(db, e);
        lobbies.push({
          id: e.state.id,
          hostName:
            e.state.crew.find((c) => c.id === e.state.hostId)?.name ??
            "Prisoner",
          phase: e.state.phase,
          players: e.state.crew.filter((c) => c.active).length,
          durationMs: e.state.durationMs,
          mine: e.state.crew.some((c) => c.id === who.id),
        });
      }
      return {
        protocolVersion: 1,
        playerId: who.id,
        wallet: await this.wallet(db, who.id),
        lobbies,
      };
    });
  }
  async create(token: string, raw: unknown) {
    const body = z
      .object({
        commandId: uuid,
        durationSeconds: z.number().int().min(120).max(900),
      })
      .strict()
      .parse(raw);
    return this.transaction(async (db, now) => {
      const who = await this.authenticate(db, token);
      return this.receipt(
        db,
        who,
        body.commandId,
        { route: "create", durationSeconds: body.durationSeconds },
        async () => {
          await this.available(db, who.id);
          const count = await db.query(
            "SELECT count(*)::int AS n FROM unity_restaurant_shifts WHERE state_json->'state'->>'phase' IN ('waiting','active')",
          );
          if (count.rows[0].n >= 100) throw new RuleError("CAPACITY_FULL");
          const state = createShift(
              randomUUID(),
              who.id,
              who.name,
              now,
              body.durationSeconds * 1000,
            ),
            e = { state, world: createWorld(state, now, UNITY_MAP) };
          await db.query(
            "INSERT INTO unity_restaurant_shifts(id,host_id,state_json)VALUES($1,$2,$3)",
            [state.id, who.id, JSON.stringify(e)],
          );
          await this.save(db, e);
          return this.snapshot(db, e, who, now);
        },
      );
    });
  }
  async get(token: string, id: string) {
    uuid.parse(id);
    return this.transaction(async (db, now) => {
      const who = await this.authenticate(db, token);
      const e = advanceNative(await this.load(db, id), now, UNITY_MAP),
        member = e.state.crew.find((c) => c.id === who.id);
      if (member?.active && e.state.phase !== "finished") member.lastSeen = now;
      await this.save(db, e);
      return this.snapshot(db, e, who, now);
    });
  }
  async command(token: string, id: string, raw: unknown) {
    uuid.parse(id);
    const body = z
      .object({ commandId: uuid, action: nativeActionSchema })
      .strict()
      .parse(raw);
    return this.transaction(async (db, now) => {
      const who = await this.authenticate(db, token);
      return this.receipt(
        db,
        who,
        body.commandId,
        { route: id, action: body.action },
        async () => {
          if (body.action.type === "join") await this.available(db, who.id, id);
          const e = applyNativeAction(
            await this.load(db, id),
            who.id,
            body.action,
            now,
            UNITY_MAP,
            who.name,
            randomBytes(4).readUInt32BE() / 4294967296,
          );
          await this.save(db, e);
          return this.snapshot(db, e, who, now);
        },
      );
    });
  }
  async input(token: string, id: string, raw: unknown) {
    uuid.parse(id);
    const body = inputSchema.parse(raw);
    return this.transaction(async (db, now) => {
      const who = await this.authenticate(db, token);
      const e = applyInput(
        await this.load(db, id),
        who.id,
        body.seq,
        body.x,
        body.z,
        now,
        UNITY_MAP,
      );
      await this.save(db, e);
      return this.snapshot(db, e, who, now);
    });
  }
  async tick() {
    await this.transaction(async (db, now) => {
      const q = await db.query(
        "SELECT state_json FROM unity_restaurant_shifts WHERE state_json->'state'->>'phase' IN ('waiting','active') ORDER BY updated_at LIMIT 100",
      );
      for (const row of q.rows)
        await this.save(db, advanceNative(row.state_json, now, UNITY_MAP));
    });
  }
}
