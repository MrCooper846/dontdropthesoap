import { describe, it, expect } from "vitest";
import {
  canonicalProgram,
  validateProgram,
  LIMITS,
  type Statement,
} from "../domain/bots/program";
import { execute, type Observation } from "../domain/bots/interpreter";
const observation: Observation = {
  round: 1,
  ownScore: 0,
  opponentScore: 0,
  lastOpponentMove: null,
  ownCooperations: 0,
  ownBetrayals: 0,
  opponentCooperations: 0,
  opponentBetrayals: 0,
};
const cooperate = { schemaVersion: 1, decision: { op: "return", move: "C" } };
const mirror = {
  schemaVersion: 1,
  decision: {
    op: "if",
    condition: { op: "eq", left: { op: "lastOpponentMove" }, right: "D" },
    then: { op: "return", move: "D" },
    else: { op: "return", move: "C" },
  },
};
describe("validated visual language", () => {
  it("plays tit-for-tat from revealed observations with C for a first encounter", () => {
    expect(execute(mirror, observation).move).toBe("C");
    expect(
      execute(mirror, { ...observation, lastOpponentMove: "D" }).move,
    ).toBe("D");
    expect(
      execute(mirror, { ...observation, lastOpponentMove: "C" }).move,
    ).toBe("C");
  });
  it("canonicalizes property order and snapshots input without retaining executable references", () => {
    const first = { ...cooperate, memory: { z: 1, a: false } };
    const other = {
      memory: { a: false, z: 1 },
      decision: { move: "C", op: "return" },
      schemaVersion: 1,
    };
    expect(canonicalProgram(first)).toBe(canonicalProgram(other));
    const compiled = validateProgram(first);
    first.memory.z = 100;
    expect(compiled.memory.z).toBe(1);
  });
  it("rejects unknown fields/opcodes, missing branches and incompatible expression/memory types", () => {
    for (const bad of [
      { ...cooperate, secret: "ignored?" },
      { ...cooperate, schemaVersion: 2 },
      { ...cooperate, decision: { op: "eval", code: "return 'D'" } },
      {
        schemaVersion: 1,
        decision: {
          op: "if",
          condition: true,
          then: { op: "return", move: "C" },
        },
      },
      {
        schemaVersion: 1,
        decision: {
          op: "if",
          condition: 1,
          then: { op: "return", move: "C" },
          else: { op: "return", move: "D" },
        },
      },
      {
        schemaVersion: 1,
        decision: {
          op: "if",
          condition: { op: "lt", left: "C", right: 2 },
          then: { op: "return", move: "C" },
          else: { op: "return", move: "D" },
        },
      },
      {
        schemaVersion: 1,
        memory: { n: 0 },
        decision: {
          op: "set",
          name: "n",
          value: true,
          next: { op: "return", move: "C" },
        },
      },
      {
        schemaVersion: 1,
        decision: {
          op: "set",
          name: "missing",
          value: 1,
          next: { op: "return", move: "C" },
        },
      },
    ])
      expect(() => validateProgram(bad)).toThrow();
  });
  it("enforces exact nesting, node and byte limits before execution", () => {
    let node: Statement = { op: "return", move: "C" };
    for (let i = 0; i < 31; i++)
      node = { op: "set", name: "n", value: 0, next: node };
    expect(() =>
      validateProgram({ schemaVersion: 1, memory: { n: 0 }, decision: node }),
    ).not.toThrow();
    expect(() =>
      validateProgram({
        schemaVersion: 1,
        memory: { n: 0 },
        decision: { op: "set", name: "n", value: 0, next: node },
      }),
    ).toThrow(/32 levels/);
    function wide(depth: number): Statement {
      return depth
        ? {
            op: "if",
            condition: true,
            then: wide(depth - 1),
            else: wide(depth - 1),
          }
        : { op: "return", move: "C" };
    }
    expect(() =>
      validateProgram({ schemaVersion: 1, decision: wide(8) }),
    ).toThrow(/512 nodes/);
    expect(() =>
      validateProgram({ ...cooperate, extra: "x".repeat(LIMITS.programBytes) }),
    ).toThrow(/64 KiB/);
  });
  it("rejects cycles, getters, nonfinite numbers and prototype tricks without invoking getters", () => {
    let called = false;
    const getter = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        called = true;
        return 1;
      },
    });
    expect(() => validateProgram(getter)).toThrow();
    expect(called).toBe(false);
    const cycle: any = { schemaVersion: 1 };
    cycle.decision = cycle;
    expect(() => validateProgram(cycle)).toThrow();
    expect(() =>
      validateProgram({ ...cooperate, memory: JSON.parse('{"__proto__":0}') }),
    ).toThrow();
    expect(() =>
      validateProgram({ ...cooperate, memory: { constructor: 0 } }),
    ).toThrow();
    expect(() =>
      validateProgram({ ...cooperate, memory: { x: Infinity } }),
    ).toThrow();
    expect(() =>
      validateProgram({ ...cooperate, memory: { x: NaN } }),
    ).toThrow();
  });
  it("updates private typed memory immutably and replaying the same input advances it once", () => {
    const program = {
      schemaVersion: 1,
      memory: { turns: 0 },
      decision: {
        op: "set",
        name: "turns",
        value: { op: "add", left: { op: "memory", name: "turns" }, right: 1 },
        next: { op: "return", move: "D" },
      },
    };
    const state = { memory: { turns: 4 }, rngState: 42 };
    const first = execute(program, observation, state),
      retry = execute(program, observation, state);
    expect(first).toEqual(retry);
    expect(first.memory.turns).toBe(5);
    expect(state.memory.turns).toBe(4);
    expect(
      execute(program, { ...observation, round: 2 }, first).memory.turns,
    ).toBe(6);
  });
  it("seeded random is reproducible and unexecuted branches do not consume its state", () => {
    const program = {
      schemaVersion: 1,
      decision: {
        op: "if",
        condition: { op: "lt", left: { op: "random" }, right: 0.5 },
        then: { op: "return", move: "C" },
        else: { op: "return", move: "D" },
      },
    };
    const state = { memory: {}, rngState: 1234567 };
    const first = execute(program, observation, state);
    expect(first).toEqual(execute(program, observation, state));
    expect(first.rngState).not.toBe(state.rngState);
    const short = {
      schemaVersion: 1,
      decision: {
        op: "if",
        condition: {
          op: "or",
          left: true,
          right: { op: "lt", left: { op: "random" }, right: 0.5 },
        },
        then: { op: "return", move: "C" },
        else: { op: "return", move: "D" },
      },
    };
    expect(execute(short, observation, state).rngState).toBe(state.rngState);
  });
  it("enforces execution/memory budgets, numeric limits and strict runtime observations", () => {
    expect(() => execute(mirror, observation, undefined, 2)).toThrow(
      /2000 steps/,
    );
    expect(() =>
      execute(cooperate, observation, { memory: { a: "C" }, rngState: 1 }),
    ).toThrow();
    expect(() =>
      execute(cooperate, observation, { memory: {}, rngState: 0 }),
    ).toThrow();
    expect(() => execute(cooperate, {} as Observation)).toThrow(
      /Observation fields/,
    );
    expect(() =>
      execute(cooperate, { ...observation, ownScore: Infinity }),
    ).toThrow();
    expect(() =>
      execute(cooperate, { ...observation, opponentBetrayals: -1 }),
    ).toThrow();
    const overflow = {
      schemaVersion: 1,
      memory: { n: 0 },
      decision: {
        op: "set",
        name: "n",
        value: { op: "add", left: 1e308, right: 1e308 },
        next: { op: "return", move: "C" },
      },
    };
    expect(() => execute(overflow, observation)).toThrow(/overflow/);
    const bad: any = { memory: {}, rngState: 1 };
    bad.memory.extra = "x".repeat(8193);
    expect(() => execute(cooperate, observation, bad)).toThrow();
  });
  it("uses own/opponent score, round and revealed move counters without coercing values", () => {
    const program = {
      schemaVersion: 1,
      decision: {
        op: "if",
        condition: {
          op: "and",
          left: { op: "gte", left: { op: "round" }, right: 3 },
          right: {
            op: "gt",
            left: { op: "count", who: "opponent", move: "D" },
            right: { op: "count", who: "opponent", move: "C" },
          },
        },
        then: { op: "return", move: "D" },
        else: { op: "return", move: "C" },
      },
    };
    expect(
      execute(program, {
        ...observation,
        round: 3,
        opponentBetrayals: 2,
        opponentCooperations: 1,
      }).move,
    ).toBe("D");
    expect(
      execute(program, {
        ...observation,
        round: 2,
        opponentBetrayals: 2,
        opponentCooperations: 1,
      }).move,
    ).toBe("C");
  });
});
