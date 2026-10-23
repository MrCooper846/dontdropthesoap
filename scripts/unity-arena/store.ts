import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";

export class UnityStore {
  db: Pool;
  constructor(url: string) {
    const u = new URL(url);
    if (
      !["127.0.0.1", "localhost"].includes(u.hostname) ||
      u.port !== "55436" ||
      u.pathname !== "/soap_unity_restaurant" ||
      u.search ||
      u.hash
    )
      throw Error(
        "Unity arena requires isolated local soap_unity_restaurant on port55436",
      );
    this.db = new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 5000,
    });
  }
  async init() {
    if (
      (await this.db.query("SELECT current_database() AS name")).rows[0]
        .name !== "soap_unity_restaurant"
    )
      throw Error("Wrong database");
    await this.db.query(`CREATE SCHEMA IF NOT EXISTS unity_arena;
      CREATE TABLE IF NOT EXISTS unity_arena.runs(id uuid PRIMARY KEY,scenario text NOT NULL,status text NOT NULL,source jsonb NOT NULL,started_at timestamptz DEFAULT now(),ended_at timestamptz);
      CREATE TABLE IF NOT EXISTS unity_arena.clients(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES unity_arena.runs,name text NOT NULL,claimant text NOT NULL,port integer NOT NULL,pid integer,executable text NOT NULL,profile text NOT NULL,status text NOT NULL DEFAULT 'starting',created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS unity_arena.events(id bigserial PRIMARY KEY,run_id uuid REFERENCES unity_arena.runs,actor uuid REFERENCES unity_arena.clients,kind text NOT NULL,detail jsonb NOT NULL,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS unity_arena.issues(id uuid PRIMARY KEY,fingerprint text UNIQUE NOT NULL,title text NOT NULL,severity text NOT NULL,status text NOT NULL DEFAULT 'open',occurrences integer NOT NULL DEFAULT 1,last_run uuid REFERENCES unity_arena.runs,detail jsonb NOT NULL,first_seen timestamptz DEFAULT now(),last_seen timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS unity_arena.issue_occurrences(id bigserial PRIMARY KEY,issue_id uuid NOT NULL REFERENCES unity_arena.issues,run_id uuid REFERENCES unity_arena.runs,detail jsonb NOT NULL,created_at timestamptz DEFAULT now());`);
    await this.db.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS unity_arena_active_port ON unity_arena.clients(port) WHERE status<>'closed'",
    );
    // A short-lived CLI invocation must never mark other active runs interrupted.
  }
  async run(scenario: string, source: unknown) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO unity_arena.runs(id,scenario,status,source) VALUES($1,$2,'running',$3)",
      [id, scenario, JSON.stringify(source)],
    );
    return id;
  }
  async event(
    run: string,
    actor: string | null,
    kind: string,
    detail: unknown,
  ) {
    await this.db.query(
      "INSERT INTO unity_arena.events(run_id,actor,kind,detail) VALUES($1,$2,$3,$4)",
      [run, actor, kind, JSON.stringify(detail)],
    );
  }
  async issue(
    run: string,
    severity: string,
    fingerprint: string,
    title: string,
    detail: unknown,
  ) {
    const db = await this.db.connect();
    try {
      await db.query("BEGIN");
      const result = await db.query(
        `INSERT INTO unity_arena.issues(id,fingerprint,title,severity,last_run,detail) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(fingerprint) DO UPDATE SET occurrences=unity_arena.issues.occurrences+1,last_run=excluded.last_run,detail=excluded.detail,last_seen=now(),status=CASE WHEN unity_arena.issues.status='resolved' THEN 'open' ELSE unity_arena.issues.status END RETURNING id`,
        [
          randomUUID(),
          createHash("sha256").update(fingerprint).digest("hex"),
          title,
          severity,
          run,
          JSON.stringify(detail),
        ],
      );
      const id = result.rows[0].id as string;
      await db.query(
        "INSERT INTO unity_arena.issue_occurrences(issue_id,run_id,detail) VALUES($1,$2,$3)",
        [id, run, JSON.stringify(detail)],
      );
      await db.query("COMMIT");
      return id;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
}
