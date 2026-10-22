import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { settings, dashboard } from "./config";
import { Store } from "./store";
async function main() {
  const config = settings(),
    store = new Store(config.database);
  const api = async (
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(dashboard + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
        ...headers,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const post = async (path: string, data: unknown) => {
    const response = await api(path, data);
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  const state = async () => (await api("/api/state")).json();
  try {
    if (process.argv[2] === "before") {
      assert.equal(
        (
          await fetch(dashboard + "/api/sessions", {
            method: "POST",
            body: "{}",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await api(
            "/api/sessions",
            { name: "blocked" },
            { Origin: "https://foreign.invalid" },
          )
        ).status,
        403,
      );
      const run = await post("/api/sessions", {
        name: "Harness control validation",
      });
      const players = await Promise.all(
        ["validation-a", "validation-b"].map(async (claimant) => ({
          ...(await post("/api/players", {
            runId: run.runId,
            name: claimant,
            claimant,
          })),
          claimant,
        })),
      );
      assert.notEqual(players[0].id, players[1].id);
      const action = (index: number, action: unknown) =>
        post(`/api/players/${players[index].id}/actions`, {
          claimant: players[index].claimant,
          action,
        });
      const views = await Promise.all([
        action(0, { op: "walk", x: 240, y: 450 }),
        action(1, { op: "walk", x: 720, y: 450 }),
      ]);
      assert.equal(views[0].yard.players.length >= 2, true);
      await Promise.all([
        action(0, { op: "pane", name: "Tables" }),
        action(1, { op: "pane", name: "People" }),
      ]);
      assert.equal(
        (
          await api(`/api/players/${players[0].id}/actions`, {
            claimant: players[1].claimant,
            action: { op: "observe" },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await api(`/api/players/${players[0].id}/actions`, {
            claimant: players[0].claimant,
            action: { op: "goto", path: "https://foreign.invalid" },
          })
        ).status,
        400,
      );
      assert.equal((await api("/api/runs", { cycles: 1 })).status, 409);
      const fingerprint = "harness-ledger-validation:" + randomUUID();
      const input = {
        runId: run.runId,
        title: "Harness self-check: issue persistence (not a game bug)",
        severity: "needs-triage",
        fingerprint,
        detail: {
          purpose: "Validate occurrence history and reopen/triage behaviour",
        },
      };
      const issue = await post("/api/issues", input),
        duplicate = await post("/api/issues", input);
      assert.equal(issue.issueId, duplicate.issueId);
      await post(`/api/issues/${issue.issueId}`, {
        status: "resolved",
        note: "Intentional harness validation",
      });
      await post("/api/issues", input);
      let current = (await state()).issues.find(
        (i: any) => i.id === issue.issueId,
      );
      assert.equal(current.occurrences, 3);
      assert.equal(current.status, "open");
      await post(`/api/issues/${issue.issueId}`, {
        status: "dismissed",
        note: "Intentional harness validation completed; not a game defect",
      });
      await post("/api/sessions/finish", {
        runId: run.runId,
        outcome: "passed",
      });
      const pending = await post("/api/sessions", {
        name: "Harness restart interruption validation",
      });
      const counts = (
        await store.db.query(
          "SELECT (SELECT count(*)::int FROM matches) AS matches,(SELECT count(*)::int FROM round_results) AS results",
        )
      ).rows[0];
      writeFileSync(
        "data/arena/verification.json",
        JSON.stringify({
          issueId: issue.issueId,
          runId: run.runId,
          pendingId: pending.runId,
          counts,
        }),
      );
      console.log(
        JSON.stringify({
          independentAgentPlayers: "PASS",
          concurrentControls: "PASS",
          crossControlRejected: "PASS",
          localApiBoundaries: "PASS",
          issueDedupAndReopen: "PASS",
          restartVerification: "PENDING",
        }),
      );
    } else if (process.argv[2] === "after") {
      const saved = JSON.parse(
          readFileSync("data/arena/verification.json", "utf8"),
        ),
        s = await state();
      assert.equal(
        s.runs.find((r: any) => r.id === saved.pendingId)?.status,
        "interrupted",
      );
      assert.equal(
        s.runs.find((r: any) => r.id === saved.runId)?.status,
        "passed",
      );
      const issue = s.issues.find((i: any) => i.id === saved.issueId);
      assert.equal(issue.occurrences, 3);
      assert.equal(issue.status, "dismissed");
      assert.equal(
        (
          await store.db.query(
            "SELECT count(*)::int AS n FROM arena.issue_occurrences WHERE issue_id=$1",
            [saved.issueId],
          )
        ).rows[0].n,
        3,
      );
      const counts = (
        await store.db.query(
          "SELECT (SELECT count(*)::int FROM matches) AS matches,(SELECT count(*)::int FROM round_results) AS results",
        )
      ).rows[0];
      assert.deepEqual(counts, saved.counts);
      console.log(
        JSON.stringify({
          databaseRestartPersistence: "PASS",
          issueHistoryPersistence: "PASS",
          interruptedRunRecovery: "PASS",
          preservedGameRecords: counts,
        }),
      );
    } else throw Error("Use before or after");
  } finally {
    await store.db.end();
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
