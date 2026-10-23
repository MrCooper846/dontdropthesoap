import { z } from "zod";
import { UnityStore } from "./store";
import { settings } from "./config";
import { Bridge } from "./bridge";
import { launch, stopOwned, restartOwned, type Client } from "./clients";
import { audit } from "./audit";
import { performTask } from "./task";
const uuid = z.string().uuid();
const action = z
  .object({
    op: z.enum([
      "nickname",
      "create",
      "join",
      "role",
      "ready",
      "start",
      "walkTo",
      "move",
      "stop",
      "interact",
      "screenshot",
      "task",
    ]),
    name: z.string().max(200).optional(),
    value: z.string().max(100).optional(),
    id: uuid.optional(),
    x: z.number().finite().optional(),
    z: z.number().finite().optional(),
    durationSeconds: z
      .union([z.literal(120), z.literal(300), z.literal(600), z.literal(900)])
      .optional(),
    ready: z.boolean().optional(),
  })
  .strict();
async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const store = new UnityStore(settings().database);
  try {
    await store.init();
    let result: unknown;
    if (mode === "start") {
      const run = await store.run(args[0] ?? "native-restaurant-exploration", {
        harness: "unity-native",
        executable: settings().executable,
      });
      const clients = [];
      try {
        for (let i = 0; i < 4; i++)
          clients.push(
            await launch(
              store,
              run,
              i,
              ["Ada", "Bert", "Cora", "Overseer"][i],
              ["ada", "bert", "cora", "root"][i],
            ),
          );
      } catch (error) {
        await store.event(run, null, "session.start-failed", {
          error: String(error),
        });
        const owned = (
          await store.db.query<Client>(
            "SELECT * FROM unity_arena.clients WHERE run_id=$1 AND status<>'closed'",
            [run],
          )
        ).rows;
        for (const client of owned) {
          try {
            await stopOwned(store, client);
          } catch (cleanupError) {
            await store.event(run, client.id, "client.cleanup-failed", {
              error: String(cleanupError),
            });
          }
        }
        await store.db.query(
          "UPDATE unity_arena.runs SET status='failed',ended_at=now() WHERE id=$1",
          [run],
        );
        throw error;
      }
      result = { runId: run, clients };
    } else if (mode === "player") {
      result = await launch(
        store,
        uuid.parse(args[0]),
        z.coerce.number().int().min(0).max(3).parse(args[1]),
        args[2],
        args[3],
      );
    } else if (mode === "observe" || mode === "act" || mode === "reconnect") {
      const id = uuid.parse(args[0]);
      const client = (
        await store.db.query<Client>(
          "SELECT * FROM unity_arena.clients WHERE id=$1 AND claimant=$2 AND status='active'",
          [id, args[1]],
        )
      ).rows[0];
      if (!client) throw Error("Active client/claimant mismatch");
      const bridge = new Bridge(client.port);
      if (mode === "reconnect") result = await restartOwned(store, client);
      else if (mode === "act") {
        const command = action.parse(JSON.parse(args.slice(2).join(" ")));
        await store.event(client.run_id, id, "action.begin", command);
        try {
          result =
            command.op === "task"
              ? await performTask(
                  bridge,
                  z.string().min(1).parse(command.name),
                  (kind, detail) =>
                    store.event(client.run_id, id, kind, detail),
                )
              : await bridge.act({ ...command, op: command.op });
        } catch (error) {
          await store.event(client.run_id, id, "action.failed", {
            command,
            error: String(error),
          });
          throw error;
        }
      } else result = await bridge.observe();
      await store.event(
        client.run_id,
        id,
        mode === "act" ? "action.complete" : "observation",
        result,
      );
    } else if (mode === "issue") {
      result = {
        issueId: await store.issue(
          uuid.parse(args[0]),
          z.enum(["bug", "usability", "needs-triage"]).parse(args[1]),
          args[2],
          args[3],
          { report: args.slice(4).join(" ") },
        ),
      };
    } else if (mode === "triage") {
      const id = uuid.parse(args[0]),
        status = z
          .enum(["open", "investigating", "resolved", "dismissed"])
          .parse(args[1]);
      await store.db.query(
        "UPDATE unity_arena.issues SET status=$2,detail=detail||jsonb_build_object('triageNote',$3::text) WHERE id=$1",
        [id, status, args.slice(2).join(" ")],
      );
      result = { ok: true };
    } else if (mode === "finish") {
      const run = uuid.parse(args[0]),
        outcome = z.enum(["passed", "failed", "interrupted"]).parse(args[1]);
      const clients = (
        await store.db.query<Client>(
          "SELECT * FROM unity_arena.clients WHERE run_id=$1 AND status<>'closed'",
          [run],
        )
      ).rows;
      for (const client of clients) await stopOwned(store, client);
      await store.db.query(
        "UPDATE unity_arena.runs SET status=$2,ended_at=now() WHERE id=$1",
        [run, outcome],
      );
      result = { ok: true };
    } else if (mode === "audit")
      result = await audit(store, args[0] ? uuid.parse(args[0]) : undefined);
    else if (mode === "state")
      result = {
        runs: (
          await store.db.query(
            "SELECT * FROM unity_arena.runs ORDER BY started_at DESC LIMIT20".replace(
              "LIMIT20",
              "LIMIT 20",
            ),
          )
        ).rows,
        clients: (
          await store.db.query(
            "SELECT id,run_id,name,claimant,port,pid,status FROM unity_arena.clients WHERE status<>'closed'",
          )
        ).rows,
        issues: (
          await store.db.query(
            "SELECT * FROM unity_arena.issues WHERE status IN ('open','investigating') ORDER BY last_seen DESC",
          )
        ).rows,
      };
    else
      throw Error(
        "Use start/player/observe/act/reconnect/issue/triage/finish/audit/state",
      );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await store.db.end();
  }
}
main().catch((error) => {
  console.error(String(error));
  process.exitCode = 1;
});
