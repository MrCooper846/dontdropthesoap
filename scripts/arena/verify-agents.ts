import assert from "node:assert/strict";
import { settings, dashboard } from "./config";
import { Store } from "./store";
import { setTimeout as delay } from "node:timers/promises";
async function main() {
  const config = settings(),
    store = new Store(config.database);
  const post = async (path: string, data: unknown) => {
    const r = await fetch(dashboard + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    const value = await r.json();
    if (!r.ok) throw Error(JSON.stringify(value));
    return value;
  };
  const { runId } = await post("/api/sessions", {
    name: "Agent interface bot deployment validation",
  });
  let passed = false;
  try {
    const players = await Promise.all(
      ["agent-builder-a", "agent-builder-b"].map(async (claimant) => ({
        ...(await post("/api/players", { runId, name: claimant, claimant })),
        claimant,
      })),
    );
    const action = (index: number, action: unknown) =>
      post(`/api/players/${players[index].id}/actions`, {
        claimant: players[index].claimant,
        action,
      });
    const click = (index: number, name: string) =>
      action(index, { op: "click", target: { role: "button", name } });
    const bots = await Promise.all(
      players.map(async (_, i) => {
        await action(i, { op: "goto", path: "/bots/build" });
        await action(i, {
          op: "fill",
          label: "Bot name",
          value: "Agent API bot " + i,
        });
        await action(i, {
          op: "select",
          label: "Starter strategy",
          value: i ? "betray" : "cooperate",
        });
        await click(i, "Load starter");
        const result = await click(i, "Publish strategy");
        const id = new URL(result.url).searchParams.get("bot");
        assert.ok(id, "Agent publication must return saved bot identity");
        return id;
      }),
    );
    await Promise.all(
      players.map(async (_, i) => {
        await action(i, { op: "goto", path: "/yard?bot=" + bots[i] });
        await click(i, "Enter yard");
        await action(i, { op: "walk", x: 240, y: 450 });
        await action(i, { op: "pane", name: "Tables" });
        await action(i, { op: "circle", name: "Noodle Exchange" });
        await action(i, { op: "select", label: "Enter as", value: bots[i] });
      }),
    );
    await action(0, { op: "clickText", text: "Match settings" });
    for (const [label, value] of [
      ["Rounds", "5"],
      ["Decision seconds", "5"],
      ["Seats", "2"],
    ])
      await action(0, { op: "fill", label, value });
    await action(0, { op: "clickText", text: "Match settings" });
    await click(0, "Create circle match");
    await click(1, "Join circle");
    await Promise.all(players.map((_, i) => click(i, "Ready up")));
    await click(0, "Start game");
    const match = (
      await store.db.query(
        "SELECT id FROM matches WHERE circle_id='yard-circle-3' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0].id;
    const end = performance.now() + 60000;
    let state: any;
    while (performance.now() < end) {
      state = (
        await store.db.query("SELECT state_json FROM matches WHERE id=$1", [
          match,
        ])
      ).rows[0].state_json;
      if (state.phase === "finished") break;
      await delay(500);
    }
    assert.equal(state.phase, "finished");
    assert.equal(state.seats.length, 2);
    for (let i = 0; i < 2; i++) {
      const seat = state.seats.find((s: any) => s.botId === bots[i]);
      assert.equal(seat.kind, "visual");
      assert.equal(seat.score, i ? 15 : -10);
      assert.equal(seat.timeouts, 0);
    }
    const views = await Promise.all(
      players.map((_, i) => action(i, { op: "observe" })),
    );
    for (const view of views)
      assert.ok(
        view.text.includes("Final results"),
        "Both agents must see completed game results",
      );
    await store.event(runId, "agent-interface.verified", null, {
      matchId: match,
      bots,
      expected: [-10, 15],
    });
    passed = true;
    console.log(
      JSON.stringify({
        independentAgentBotPublication: "PASS",
        agentUiDeployment: "PASS",
        agentBotVersusBot: "PASS",
        expectedScores: "PASS",
        runId,
        matchId: match,
      }),
    );
  } catch (error) {
    await store.issue(
      runId,
      "Agent interface validation failed",
      "needs-triage",
      { error: String(error) },
    );
    throw error;
  } finally {
    await post("/api/sessions/finish", {
      runId,
      outcome: passed ? "passed" : "failed",
    });
    await store.db.end();
  }
}
main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
