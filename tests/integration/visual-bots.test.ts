import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { pool, migrate, transaction } from "../../server/persistence/db";
import { createGuest, authenticate } from "../../server/auth/sessions";
import { resource } from "../../server/commands/resources";
import {
  publishVisual,
  visualVersion,
  visualFeedback,
} from "../../server/bots/visual-publication";
import {
  prepareVisual,
  acceptVisual,
  startVisualRuntime,
} from "../../server/bots/visual-runtime";
import { VisualPool } from "../../server/bots/visual-pool";
import {
  newMatch,
  joinMatch,
  observe,
  command,
  tickMatches,
  recoverMatches,
} from "../../server/commands/matches";
import { loadMatch, saveMatch } from "../../server/matches/repository";
import { starter } from "../../shared/bots/presets";
import { mintCredential } from "../../server/bots/identity";
import { config } from "../../server/config";
if (!config.DATABASE_URL.endsWith("/soap_test") || !config.FEATURE_VISUAL_BOTS)
  throw new Error(
    "Visual integration requires isolated soap_test + visual flag",
  );
beforeAll(migrate);
afterAll(() => pool.end());
async function owner(name: string) {
  const guest = await createGuest(name);
  return {
    headers: { cookie: "dds_session=" + guest.secret },
  } as IncomingMessage;
}
async function key(req: IncomingMessage) {
  const p = await authenticate(req),
    key = randomUUID();
  await pool.query(
    "INSERT INTO creation_keys(id,principal_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [key, p.id],
  );
  return key;
}
async function publish(req: IncomingMessage, workspace: unknown, id?: string) {
  const input = {
    commandId: randomUUID(),
    key: await key(req),
    controllerEpoch: 0,
    payload: { name: "Visual counter", workspace },
  };
  const target = id ? "visual.publish:" + id : "visual.create";
  const work = (db: any, payload: unknown, epoch: number) =>
    publishVisual(req, payload, db, epoch, id);
  const result = await resource(req, input, target, work);
  expect(await resource(req, input, target, work)).toEqual(result);
  return result as { id: string; versionId: string; revision: number };
}
function counter() {
  const workspace: any = starter("betray"),
    root = workspace.blocks.blocks[0],
    choice = root.inputs.DECISION.block;
  root.inputs.MEMORY = {
    block: {
      type: "soap_init",
      fields: { NAME: "turns", TYPE: "number", VALUE: "0" },
      next: {
        block: {
          type: "soap_init",
          fields: { NAME: "draw", TYPE: "number", VALUE: "0" },
        },
      },
    },
  };
  root.inputs.DECISION = {
    block: {
      type: "soap_set",
      fields: { NAME: "turns" },
      inputs: {
        VALUE: {
          block: {
            type: "soap_arithmetic",
            fields: { OP: "add" },
            inputs: {
              LEFT: {
                block: { type: "soap_memory", fields: { NAME: "turns" } },
              },
              RIGHT: { block: { type: "soap_number", fields: { NUM: 1 } } },
            },
          },
        },
      },
      next: {
        block: {
          type: "soap_set",
          fields: { NAME: "draw" },
          inputs: { VALUE: { block: { type: "soap_random" } } },
          next: { block: choice },
        },
      },
    },
  };
  return workspace;
}
async function act(
  req: IncomingMessage,
  id: string,
  type: string,
  payload: unknown,
  seatId?: string,
) {
  const m = await observe(req, id);
  const result = await command(req, {
    v: 1,
    commandId: randomUUID(),
    controllerEpoch: 0,
    type,
    matchId: id,
    matchVersion: m.version,
    round: m.round,
    ...(seatId ? { seatId } : {}),
    payload,
  });
  expect(result.ok).toBe(true);
  return result;
}
async function collecting(workspace: unknown = counter(), start = true) {
  const human = await owner("Visual human"),
    botOwner = await owner("Visual owner"),
    bot = await publish(botOwner, workspace);
  const { id } = await newMatch(human, {
    commandId: randomUUID(),
    key: await key(human),
    controllerEpoch: 0,
    mode: "mixed",
    settings: { rounds: 5, decisionMs: 5000, revealMs: 1000, maxSeats: 2 },
  });
  await joinMatch(botOwner, id, {
    commandId: randomUUID(),
    key: await key(botOwner),
    controllerEpoch: 0,
    botId: bot.id,
  });
  const state = await observe(human, id),
    humanSeat = state.seats.find((s) => s.kind === "human")!.id,
    visualSeat = state.seats.find((s) => s.kind === "visual")!.id;
  if (start) {
    await act(human, id, "seat.ready", { ready: true }, humanSeat);
    await act(botOwner, id, "seat.ready", { ready: true }, visualSeat);
    await act(human, id, "match.start", {});
    await expire(id);
  }
  return { id, human, botOwner, bot, humanSeat, visualSeat };
}
async function expire(id: string) {
  await transaction(async (db) => {
    const m = await loadMatch(db, id, true);
    m.deadline = Date.now() - 10;
    await saveMatch(db, m);
  });
  await tickMatches();
}
it("publication is idempotent and immutable, foreign owners cannot edit/read, and active matches freeze versions", async () => {
  const f = await collecting(),
    outsider = await owner("Not the visual owner");
  const newer = await publish(f.botOwner, starter("cooperate"), f.bot.id);
  expect(newer.revision).toBe(2);
  expect(
    (await visualVersion(f.botOwner, f.bot.id, f.bot.versionId)).program_json,
  ).not.toEqual((await visualVersion(f.botOwner, f.bot.id)).program_json);
  await expect(visualVersion(outsider, f.bot.id)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(
    publish(outsider, starter("betray"), f.bot.id),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    pool.query("UPDATE bot_versions SET program_json='{}' WHERE id=$1", [
      f.bot.versionId,
    ]),
  ).rejects.toThrow(/immutable/);
  await expect(
    mintCredential(f.botOwner, f.bot.id, { controllerEpoch: 0 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const job = await prepareVisual(f.id, f.visualSeat);
  expect(job!.versionId).toBe(f.bot.versionId);
  const workers = new VisualPool();
  try {
    const outcome = await workers.run({
      program: job!.program,
      observation: job!.observation,
      previous: job!.previous,
    });
    expect(outcome.move).toBe("D");
    expect(
      await Promise.all([
        acceptVisual(job!, outcome),
        acceptVisual(job!, outcome),
      ]),
    ).toEqual(expect.arrayContaining([true, false]));
    const row = (
      await pool.query(
        "SELECT * FROM bot_runtime_states WHERE match_id=$1 AND seat_id=$2",
        [f.id, f.visualSeat],
      )
    ).rows[0];
    expect(row.state_json.turns).toBe(1);
    expect(Number(row.rng_state)).toBe(outcome.rngState);
    expect(
      (
        await pool.query("SELECT * FROM visual_decisions WHERE match_id=$1", [
          f.id,
        ])
      ).rowCount,
    ).toBe(1);
    expect(JSON.stringify(await observe(f.human, f.id))).not.toContain(
      '"ownMove":"D"',
    );
    expect((await observe(f.botOwner, f.id)).ownMove).toBe("D");
    expect(
      (await visualFeedback(f.botOwner, f.id, f.visualSeat))[0].trace_json,
    ).toContain("Choose D");
    await expect(
      visualFeedback(f.human, f.id, f.visualSeat),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const forced = await command(f.botOwner, {
      v: 1,
      commandId: randomUUID(),
      controllerEpoch: 0,
      type: "move.submit",
      matchId: f.id,
      round: 1,
      seatId: f.visualSeat,
      payload: { move: "C" },
    });
    expect(forced.error!.code).toBe("FORBIDDEN");
  } finally {
    await workers.close();
  }
});
it("a database failure after updating memory/move rolls everything back; a retained result can then commit once", async () => {
  const f = await collecting(),
    job = await prepareVisual(f.id, f.visualSeat),
    workers = new VisualPool();
  try {
    const outcome = await workers.run({
      program: job!.program,
      observation: job!.observation,
      previous: job!.previous,
    });
    await pool.query(
      "CREATE FUNCTION fail_visual_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected visual write failure'; END $$",
    );
    await pool.query(
      "CREATE TRIGGER fail_visual_test BEFORE INSERT ON visual_decisions FOR EACH ROW EXECUTE FUNCTION fail_visual_test()",
    );
    try {
      await expect(acceptVisual(job!, outcome)).rejects.toThrow(/injected/);
    } finally {
      await pool.query("DROP TRIGGER fail_visual_test ON visual_decisions");
      await pool.query("DROP FUNCTION fail_visual_test()");
    }
    const row = (
      await pool.query(
        "SELECT * FROM bot_runtime_states WHERE match_id=$1 AND seat_id=$2",
        [f.id, f.visualSeat],
      )
    ).rows[0];
    expect(row.last_round).toBe(0);
    expect(row.state_json.turns).toBe(0);
    expect(Number(row.rng_state)).toBe(job!.previous.rngState);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM moves WHERE match_id=$1 AND seat_id=$2",
          [f.id, f.visualSeat],
        )
      ).rowCount,
    ).toBe(0);
    expect(await acceptVisual(job!, outcome)).toBe(true);
    expect(await acceptVisual(job!, outcome)).toBe(false);
  } finally {
    await workers.close();
  }
});
it("a real worker bot completes five rounds, retains memory across recovery and never credits duplicate outcomes", async () => {
  const f = await collecting(),
    workers = new VisualPool();
  try {
    for (let round = 1; round <= 5; round++) {
      const job = await prepareVisual(f.id, f.visualSeat);
      expect(job!.observation.lastOpponentMove).toBe(round === 1 ? null : "C");
      const outcome = await workers.run({
        program: job!.program,
        observation: job!.observation,
        previous: job!.previous,
      });
      expect(await acceptVisual(job!, outcome)).toBe(true);
      if (round === 1) {
        await recoverMatches();
        expect(await prepareVisual(f.id, f.visualSeat)).toBeNull();
      }
      await act(f.human, f.id, "move.submit", { move: "C" }, f.humanSeat);
      await expire(f.id);
    }
    const final = await observe(f.human, f.id);
    expect(final.phase).toBe("finished");
    expect(final.seats.find((s) => s.id === f.humanSeat)!.score).toBe(-10);
    expect(final.seats.find((s) => s.id === f.visualSeat)!.score).toBe(15);
    expect(
      (
        await pool.query(
          "SELECT state_json FROM bot_runtime_states WHERE match_id=$1",
          [f.id],
        )
      ).rows[0].state_json.turns,
    ).toBe(5);
    expect(
      (
        await pool.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
          f.id,
        ])
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await pool.query("SELECT 1 FROM visual_decisions WHERE match_id=$1", [
          f.id,
        ])
      ).rowCount,
    ).toBe(5);
    await tickMatches();
    expect(
      (
        await pool.query("SELECT 1 FROM balance_entries WHERE match_id=$1", [
          f.id,
        ])
      ).rowCount,
    ).toBe(2);
  } finally {
    await workers.close();
  }
});

it("discards a pre-interruption result without advancing memory, then accepts the recomputed current-window decision", async () => {
  const f = await collecting(),
    job = await prepareVisual(f.id, f.visualSeat),
    workers = new VisualPool();
  try {
    const outcome = await workers.run({
      program: job!.program,
      observation: job!.observation,
      previous: job!.previous,
    });
    await recoverMatches();
    expect(await acceptVisual(job!, outcome)).toBe(false);
    const fresh = await prepareVisual(f.id, f.visualSeat);
    expect(fresh!.previous).toEqual(job!.previous);
    expect(await acceptVisual(fresh!, outcome)).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT state_json FROM bot_runtime_states WHERE match_id=$1",
          [f.id],
        )
      ).rows[0].state_json.turns,
    ).toBe(1);
  } finally {
    await workers.close();
  }
});
it("live scheduler records a bounded runtime error, preserves memory and falls back to deadline C without leaking the trace", async () => {
  const workspace: any = starter("betray"),
    root = workspace.blocks.blocks[0],
    choice = root.inputs.DECISION.block;
  root.inputs.MEMORY = {
    block: {
      type: "soap_init",
      fields: { NAME: "n", TYPE: "number", VALUE: "0" },
    },
  };
  root.inputs.DECISION = {
    block: {
      type: "soap_set",
      fields: { NAME: "n" },
      inputs: {
        VALUE: {
          block: {
            type: "soap_arithmetic",
            fields: { OP: "add" },
            inputs: {
              LEFT: { block: { type: "soap_number", fields: { NUM: 1e308 } } },
              RIGHT: { block: { type: "soap_number", fields: { NUM: 1e308 } } },
            },
          },
        },
      },
      next: { block: choice },
    },
  };
  const f = await collecting(workspace),
    stop = startVisualRuntime();
  try {
    await expect
      .poll(
        async () =>
          (
            await pool.query(
              "SELECT status FROM visual_decisions WHERE match_id=$1",
              [f.id],
            )
          ).rows[0]?.status,
      )
      .toBe("error");
    expect(
      (await visualFeedback(f.botOwner, f.id, f.visualSeat))[0].error_code,
    ).toBe("NUMERIC_LIMIT");
    expect(
      (await observe(f.human, f.id)).seats.find((s) => s.id === f.visualSeat)!
        .botError,
    ).toBe(true);
    expect(
      (
        await pool.query(
          "SELECT last_round,state_json FROM bot_runtime_states WHERE match_id=$1",
          [f.id],
        )
      ).rows[0],
    ).toMatchObject({ last_round: 0, state_json: { n: 0 } });
    await expire(f.id);
    const results = await observe(f.human, f.id);
    expect(results.results[0].aMove).toBe("C");
    expect(results.results[0].bMove).toBe("C");
    expect(JSON.stringify(results)).not.toContain("NUMERIC_LIMIT");
  } finally {
    await stop();
  }
});

it("disabling visual participation fences existing waiting seats and prevents starting a timeout-only substitute", async () => {
  const f = await collecting(counter(), false);
  await act(f.human, f.id, "seat.ready", { ready: true }, f.humanSeat);
  await act(f.botOwner, f.id, "seat.ready", { ready: true }, f.visualSeat);
  const enabled = config.FEATURE_VISUAL_BOTS;
  config.FEATURE_VISUAL_BOTS = false;
  try {
    for (const [req, type, seatId, payload] of [
      [f.botOwner, "seat.ready", f.visualSeat, { ready: true }],
      [f.human, "match.start", undefined, {}],
    ] as const) {
      const m = await observe(req, f.id);
      const result = await command(req, {
        v: 1,
        commandId: randomUUID(),
        controllerEpoch: 0,
        type,
        matchId: f.id,
        matchVersion: m.version,
        round: m.round,
        ...(seatId ? { seatId } : {}),
        payload,
      });
      expect(result.error!.code).toBe("BOT_OFFLINE");
    }
    expect((await observe(f.human, f.id)).phase).toBe("waiting");
  } finally {
    config.FEATURE_VISUAL_BOTS = enabled;
  }
});
