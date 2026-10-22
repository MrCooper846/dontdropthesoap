import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
export class Store {
  db: Pool;
  constructor(url: string) {
    const u = new URL(url);
    if (
      u.hostname !== "127.0.0.1" ||
      u.port !== "55435" ||
      u.pathname !== "/soap_arena"
    )
      throw new Error(
        "Overseer requires its isolated local soap_arena database",
      );
    this.db = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
    });
  }
  async init() {
    if (
      (await this.db.query("SELECT current_database() AS name")).rows[0]
        .name !== "soap_arena"
    )
      throw new Error("Wrong database");
    await this.db.query(`CREATE SCHEMA IF NOT EXISTS arena;
      CREATE TABLE IF NOT EXISTS arena.runs(id uuid PRIMARY KEY, scenario text NOT NULL, status text NOT NULL, source jsonb NOT NULL, started_at timestamptz DEFAULT now(), ended_at timestamptz);
      CREATE TABLE IF NOT EXISTS arena.events(id bigserial PRIMARY KEY, run_id uuid REFERENCES arena.runs, kind text NOT NULL, actor text, detail jsonb NOT NULL, created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS arena.issues(id uuid PRIMARY KEY, fingerprint text UNIQUE NOT NULL, title text NOT NULL, severity text NOT NULL, status text NOT NULL DEFAULT 'open', occurrences integer NOT NULL DEFAULT 1, first_seen timestamptz DEFAULT now(), last_seen timestamptz DEFAULT now(), last_run uuid REFERENCES arena.runs, detail jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS arena.issue_occurrences(id bigserial PRIMARY KEY, issue_id uuid NOT NULL REFERENCES arena.issues, run_id uuid REFERENCES arena.runs, detail jsonb NOT NULL, created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS arena.players(id uuid PRIMARY KEY, run_id uuid REFERENCES arena.runs, name text NOT NULL, claimant text NOT NULL, status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now());`);
    // A process restart cannot honestly call unfinished work a pass.
    await this.db.query(
      "UPDATE arena.runs SET status='interrupted',ended_at=now() WHERE status='running'",
    );
    await this.db.query(
      "UPDATE arena.players SET status='disconnected' WHERE status='active'",
    );
  }
  async run(scenario: string, source: unknown) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO arena.runs(id,scenario,status,source) VALUES($1,$2,'running',$3)",
      [id, scenario, JSON.stringify(source)],
    );
    return id;
  }
  async event(
    run: string | null,
    kind: string,
    actor: string | null,
    detail: unknown,
  ) {
    await this.db.query(
      "INSERT INTO arena.events(run_id,kind,actor,detail) VALUES($1,$2,$3,$4)",
      [run, kind, actor, JSON.stringify(detail)],
    );
  }
  async issue(
    run: string | null,
    title: string,
    severity: string,
    detail: unknown,
    key = title,
  ) {
    const fingerprint = createHash("sha256").update(key).digest("hex");
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO arena.issues(id,fingerprint,title,severity,last_run,detail) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(fingerprint) DO UPDATE SET occurrences=arena.issues.occurrences+1,last_seen=now(),last_run=EXCLUDED.last_run,detail=EXCLUDED.detail,status=CASE WHEN arena.issues.status='resolved' THEN 'open' ELSE arena.issues.status END RETURNING id`,
        [
          randomUUID(),
          fingerprint,
          title,
          severity,
          run,
          JSON.stringify(detail),
        ],
      );
      await client.query(
        "INSERT INTO arena.issue_occurrences(issue_id,run_id,detail) VALUES($1,$2,$3)",
        [rows[0].id, run, JSON.stringify(detail)],
      );
      await client.query("COMMIT");
      return rows[0].id;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async finish(id: string, status: string) {
    await this.db.query(
      "UPDATE arena.runs SET status=$2,ended_at=now() WHERE id=$1",
      [id, status],
    );
  }
  async state() {
    const [runs, issues, events, players] = await Promise.all([
      this.db.query(
        "SELECT * FROM arena.runs ORDER BY started_at DESC LIMIT 50",
      ),
      this.db.query(
        "SELECT * FROM arena.issues ORDER BY last_seen DESC LIMIT 200",
      ),
      this.db.query("SELECT * FROM arena.events ORDER BY id DESC LIMIT 200"),
      this.db.query(
        "SELECT * FROM arena.players ORDER BY created_at DESC LIMIT 50",
      ),
    ]);
    return {
      runs: runs.rows,
      issues: issues.rows,
      events: events.rows,
      players: players.rows,
    };
  }
}
