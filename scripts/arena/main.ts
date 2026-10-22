import { createServer, type IncomingMessage } from "node:http";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, type Browser } from "@playwright/test";
import { z } from "zod";
import { settings, prepare, dashboard, evidenceRoot, origin } from "./config";
import { Store } from "./store";
import { Player } from "./player";
import { suite } from "./scenarios";

const runInput = z
  .object({ cycles: z.number().int().min(1).max(20).default(1) })
  .strict();
const issueInput = z
  .object({
    runId: z.string().uuid().nullable().default(null),
    title: z.string().min(1).max(240),
    severity: z.enum(["bug", "needs-triage", "usability"]),
    detail: z.record(z.string(), z.unknown()),
    fingerprint: z.string().min(1).max(500).optional(),
  })
  .strict();
async function body(req: IncomingMessage) {
  let input = "";
  for await (const chunk of req) {
    input += chunk;
    if (Buffer.byteLength(input) > 65536) throw Error("Request too large");
  }
  return JSON.parse(input || "{}");
}
function revision() {
  return {
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim(),
    node: process.version,
    origin,
  };
}
async function serve() {
  const config = settings(),
    store = new Store(config.database);
  // Keep this connection for the life of the process. A second overseer must not mark the first one's runs interrupted.
  const lock = await store.db.connect();
  if (
    !(await lock.query("SELECT pg_try_advisory_lock(73146022) AS acquired"))
      .rows[0].acquired
  ) {
    lock.release();
    await store.db.end();
    throw Error("Another overseer already owns this arena");
  }
  await store.init();
  mkdirSync(evidenceRoot, { recursive: true });
  let browser: Browser | undefined,
    busy = false,
    stopping = false;
  const players = new Map<string, Player>();
  let launching: Promise<Browser> | undefined;
  const getBrowser = async () => {
    if (!launching)
      launching = chromium
        .launch({ headless: true })
        .then((value) => (browser = value));
    return launching;
  };
  const addPlayer = async (run: string, name: string, claimant: string) => {
    if (players.size >= 12)
      throw Error("Local browser player limit (12) reached");
    const p = new Player(store, run, name, claimant);
    players.set(p.id, p);
    try {
      await p.open(await getBrowser());
      return p;
    } catch (e) {
      await p.close().catch(() => {});
      players.delete(p.id);
      throw e;
    }
  };
  const closePlayers = async (group: Player[]) => {
    await Promise.allSettled(group.map((p) => p.close()));
    group.forEach((p) => players.delete(p.id));
  };
  async function execute(run: string, cycles: number) {
    const group: Player[] = [];
    try {
      for (const name of ["Bot owner A", "Bot owner B", "Human A", "Human B"])
        group.push(await addPlayer(run, name, "scripted-suite"));
      const failures = await suite(store, run, group, cycles);
      await closePlayers(group);
      const faults = await store.db.query(
        "SELECT count(*)::int AS n FROM arena.issue_occurrences WHERE run_id=$1",
        [run],
      );
      await store.finish(
        run,
        stopping
          ? "interrupted"
          : failures || faults.rows[0].n
            ? "failed"
            : "passed",
      );
    } catch (error) {
      await store.issue(run, "Arena execution failed", "needs-triage", {
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      await closePlayers(group);
      await store.finish(run, stopping ? "interrupted" : "failed");
    } finally {
      try {
        const state = await store.state();
        mkdirSync(`${evidenceRoot}/${run}`, { recursive: true });
        writeFileSync(
          `${evidenceRoot}/${run}/report.json`,
          JSON.stringify(
            {
              run: state.runs.find((r) => r.id === run),
              issues: state.issues.filter((i) => i.last_run === run),
              events: (
                await store.db.query(
                  "SELECT * FROM arena.events WHERE run_id=$1 ORDER BY id",
                  [run],
                )
              ).rows,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        await store.issue(run, "Arena evidence write failed", "needs-triage", {
          error: String(error),
        });
        await store.finish(run, stopping ? "interrupted" : "failed");
      } finally {
        busy = false;
      }
    }
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (code: number, value: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.headers.host !== "127.0.0.1:3146")
        return reply(403, { error: "Invalid local host" });
      const url = new URL(req.url!, dashboard);
      if (req.method === "GET" && url.pathname === "/") {
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'",
        );
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(readFileSync("scripts/arena/dashboard.html", "utf8"));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state")
        return reply(200, {
          ...(await store.state()),
          busy,
          livePlayers: [...players.values()].map((p) => ({
            id: p.id,
            runId: p.run,
            name: p.name,
            claimant: p.claimant,
          })),
          game: origin,
        });
      if (req.method === "GET" && url.pathname.startsWith("/evidence/")) {
        const file = resolve(
            evidenceRoot,
            decodeURIComponent(url.pathname.slice(10)),
          ),
          root = resolve(evidenceRoot) + sep;
        if (
          !file.startsWith(root) ||
          file.endsWith("-session.json") ||
          !/\.(png|zip|json)$/.test(file)
        )
          return reply(404, { error: "Evidence not found" });
        if (statSync(file).size > 100 * 1024 * 1024)
          return reply(413, { error: "Use local evidence file" });
        res.writeHead(200, {
          "Content-Type": file.endsWith("png")
            ? "image/png"
            : file.endsWith("json")
              ? "application/json"
              : "application/zip",
        });
        res.end(readFileSync(file));
        return;
      }
      const bearer = req.headers.authorization ?? "";
      const expected = "Bearer " + config.token;
      if (
        bearer.length !== expected.length ||
        !timingSafeEqual(Buffer.from(bearer), Buffer.from(expected))
      )
        return reply(401, {
          error: "Use the local arena CLI or authorised bearer token",
        });
      if (req.headers.origin && req.headers.origin !== dashboard)
        return reply(403, { error: "Foreign origin" });
      if (stopping) return reply(503, { error: "Overseer stopping" });
      const input = await body(req);
      if (req.method === "POST" && url.pathname === "/api/runs") {
        const { cycles } = runInput.parse(input);
        if (busy || players.size)
          return reply(409, {
            error: "Finish the current suite or agent session first",
          });
        busy = true;
        try {
          const run = await store.run(
            "multiplayer-and-deployed-bots",
            revision(),
          );
          void execute(run, cycles).catch((e) =>
            console.error("Arena finalisation failed", String(e)),
          );
          return reply(202, { runId: run });
        } catch (e) {
          busy = false;
          throw e;
        }
      }
      if (req.method === "POST" && url.pathname === "/api/sessions") {
        const value = z
          .object({ name: z.string().min(1).max(100) })
          .strict()
          .parse(input);
        if (busy || players.size)
          return reply(409, { error: "An arena session is already active" });
        const runId = await store.run(
          "agent-session: " + value.name,
          revision(),
        );
        return reply(201, { runId });
      }
      if (req.method === "POST" && url.pathname === "/api/players") {
        const value = z
          .object({
            runId: z.string().uuid(),
            name: z.string().min(1).max(40),
            claimant: z.string().min(1).max(100),
          })
          .strict()
          .parse(input);
        if (busy)
          return reply(409, { error: "Scripted suite owns the players" });
        const run = await store.db.query(
          "SELECT status FROM arena.runs WHERE id=$1",
          [value.runId],
        );
        if (run.rows[0]?.status !== "running")
          return reply(409, { error: "Session is not running" });
        const p = await addPlayer(value.runId, value.name, value.claimant);
        return reply(201, await p.observe());
      }
      const action = url.pathname.match(
        /^\/api\/players\/([a-f0-9-]+)\/actions$/,
      );
      if (req.method === "POST" && action) {
        const value = z
            .object({ claimant: z.string(), action: z.unknown() })
            .strict()
            .parse(input),
          p = players.get(action[1]);
        if (!p || p.claimant !== value.claimant || busy)
          return reply(409, {
            error: "Player belongs to another claimant or suite",
          });
        return reply(200, await p.act(value.action));
      }
      if (req.method === "POST" && url.pathname === "/api/issues") {
        const value = issueInput.parse(input);
        const id = await store.issue(
          value.runId,
          value.title,
          value.severity,
          value.detail,
          value.fingerprint,
        );
        return reply(201, { issueId: id });
      }
      const issue = url.pathname.match(/^\/api\/issues\/([a-f0-9-]+)$/);
      if (req.method === "POST" && issue) {
        const value = z
          .object({
            status: z.enum(["open", "investigating", "resolved", "dismissed"]),
            note: z.string().min(1).max(4000),
          })
          .strict()
          .parse(input);
        const result = await store.db.query(
          "UPDATE arena.issues SET status=$2 WHERE id=$1 RETURNING id",
          [issue[1], value.status],
        );
        if (!result.rowCount) return reply(404, { error: "Issue not found" });
        await store.event(null, "issue.triaged", null, {
          issueId: issue[1],
          ...value,
        });
        return reply(200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions/finish") {
        const value = z
          .object({
            runId: z.string().uuid(),
            outcome: z.enum(["passed", "failed", "interrupted"]),
          })
          .strict()
          .parse(input);
        if (busy) return reply(409, { error: "Suite is running" });
        await closePlayers(
          [...players.values()].filter((p) => p.run === value.runId),
        );
        await store.finish(value.runId, value.outcome);
        return reply(200, { ok: true });
      }
      reply(404, { error: "Unknown arena route" });
    } catch (error) {
      reply(error instanceof z.ZodError ? 400 : 500, { error: String(error) });
    }
  });
  server.requestTimeout = 120000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3146, "127.0.0.1", resolve);
  });
  console.log(
    `Overseer ready: ${dashboard}. Game: ${origin}. Persistent database: soap_arena.`,
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      stopping = true;
      void (async () => {
        server.close();
        await closePlayers([...players.values()]);
        await browser?.close();
        await store.db.query(
          "UPDATE arena.runs SET status='interrupted',ended_at=now() WHERE status='running'",
        );
        lock.release();
        await store.db.end();
        process.exit(0);
      })();
    });
}
async function cli() {
  const command = process.argv[2] ?? "help";
  if (command === "prepare") return prepare();
  if (command === "serve") return serve();
  if (command === "help") {
    console.log(
      "arena prepare | serve | run [cycles] | status | call METHOD /api/path [JSON]",
    );
    return;
  }
  const config = settings();
  const request = async (method: string, path: string, input?: unknown) => {
    if (!path.startsWith("/api/"))
      throw Error("Only local arena API routes allowed");
    const r = await fetch(dashboard + path, {
      method,
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const result = await r.json();
    if (!r.ok) throw Error(JSON.stringify(result));
    return result;
  };
  if (command === "status") {
    console.log(JSON.stringify(await request("GET", "/api/state"), null, 2));
    return;
  }
  if (command === "call") {
    console.log(
      JSON.stringify(
        await request(
          process.argv[3],
          process.argv[4],
          process.argv[5] ? JSON.parse(process.argv[5]) : undefined,
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (command === "run") {
    const { runId } = await request("POST", "/api/runs", {
      cycles: Number(process.argv[3] ?? 1),
    });
    console.log("Run started: " + runId);
    while (true) {
      await new Promise((r) => setTimeout(r, 1000));
      const state = await request("GET", "/api/state"),
        run = state.runs.find((r: any) => r.id === runId);
      if (run && run.status !== "running") {
        console.log(
          JSON.stringify(
            {
              run,
              issues: state.issues.filter((i: any) => i.last_run === runId),
              evidence: `${evidenceRoot}/${runId}`,
            },
            null,
            2,
          ),
        );
        if (run.status !== "passed") process.exitCode = 1;
        return;
      }
    }
  }
  throw Error("Unknown arena command");
}
cli().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
