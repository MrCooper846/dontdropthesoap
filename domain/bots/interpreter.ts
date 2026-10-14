import {
  LIMITS,
  ProgramError,
  validateProgram,
  bytes,
  valueKind,
  type Value,
  type Expression,
  type Statement,
} from "./program";
export type Observation = {
  round: number;
  ownScore: number;
  opponentScore: number;
  lastOpponentMove: "C" | "D" | null;
  ownCooperations: number;
  ownBetrayals: number;
  opponentCooperations: number;
  opponentBetrayals: number;
};
export type RuntimeState = { memory: Record<string, Value>; rngState: number };
export type Outcome = RuntimeState & {
  move: "C" | "D";
  steps: number;
  trace: string[];
};
export function execute(
  input: unknown,
  observation: Observation,
  previous?: RuntimeState,
  maxSteps: number = LIMITS.steps,
): Outcome {
  const program = validateProgram(input),
    memory = { ...program.memory };
  if (previous) {
    if (
      !Number.isInteger(previous.rngState) ||
      previous.rngState < 1 ||
      previous.rngState > 0xffffffff
    )
      throw new ProgramError("INVALID_STATE", "Invalid random state");
    if (
      !previous.memory ||
      Object.keys(previous.memory).length !== Object.keys(memory).length ||
      bytes(previous.memory) > LIMITS.memoryBytes
    )
      throw new ProgramError("MEMORY_LIMIT", "Invalid runtime memory");
    for (const name of Object.keys(memory)) {
      if (
        !Object.hasOwn(previous.memory, name) ||
        valueKind(previous.memory[name]) !== valueKind(memory[name])
      )
        throw new ProgramError("INVALID_STATE", "Runtime memory type mismatch");
      memory[name] = previous.memory[name];
    }
  }
  const fields = [
    "round",
    "ownScore",
    "opponentScore",
    "lastOpponentMove",
    "ownCooperations",
    "ownBetrayals",
    "opponentCooperations",
    "opponentBetrayals",
  ];
  if (
    !observation ||
    typeof observation !== "object" ||
    Object.keys(observation).length !== fields.length
  )
    throw new ProgramError(
      "INVALID_OBSERVATION",
      "Observation fields are required",
    );
  for (const key of fields) {
    if (!Object.hasOwn(observation, key))
      throw new ProgramError(
        "INVALID_OBSERVATION",
        "Missing observation field",
      );
    const value = observation[key as keyof Observation];
    if (key === "lastOpponentMove") {
      if (!["C", "D", null].includes(value as "C" | "D" | null))
        throw new ProgramError("INVALID_OBSERVATION", "Invalid revealed move");
    } else if (
      !Number.isSafeInteger(value) ||
      (key !== "ownScore" && key !== "opponentScore" && (value as number) < 0)
    )
      throw new ProgramError(
        "INVALID_OBSERVATION",
        "Invalid observation number",
      );
  }
  if (observation.round < 1)
    throw new ProgramError("INVALID_OBSERVATION", "Invalid round");
  if (!Number.isInteger(maxSteps) || maxSteps < 1)
    throw new ProgramError("STEP_LIMIT", "Invalid execution budget");
  let rngState = previous?.rngState ?? 1,
    steps = 0;
  const trace: string[] = [];
  function step() {
    if (++steps > Math.min(LIMITS.steps, maxSteps))
      throw new ProgramError("STEP_LIMIT", "Decision exceeded 2000 steps");
  }
  function record(text: string) {
    if (trace.length < LIMITS.trace) trace.push(text);
  }
  function expr(node: Expression): Value | null {
    step();
    if (node === null || typeof node !== "object") return node;
    switch (node.op) {
      case "round":
        return observation.round;
      case "ownScore":
        return observation.ownScore;
      case "opponentScore":
        return observation.opponentScore;
      case "lastOpponentMove":
        return observation.lastOpponentMove;
      case "count":
        return node.who === "self"
          ? node.move === "C"
            ? observation.ownCooperations
            : observation.ownBetrayals
          : node.move === "C"
            ? observation.opponentCooperations
            : observation.opponentBetrayals;
      case "memory":
        return memory[node.name];
      case "random": {
        let x = rngState;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        rngState = x >>> 0;
        return rngState / 4294967296;
      }
      case "not":
        return !expr(node.value);
      case "and":
        return !!expr(node.left) && !!expr(node.right);
      case "or":
        return !!expr(node.left) || !!expr(node.right);
      default: {
        const a = expr(node.left),
          b = expr(node.right);
        switch (node.op) {
          case "eq":
            return a === b;
          case "lt":
            return (a as number) < (b as number);
          case "lte":
            return (a as number) <= (b as number);
          case "gt":
            return (a as number) > (b as number);
          case "gte":
            return (a as number) >= (b as number);
          case "add":
          case "sub": {
            const result =
              node.op === "add"
                ? (a as number) + (b as number)
                : (a as number) - (b as number);
            if (!Number.isFinite(result))
              throw new ProgramError("NUMERIC_LIMIT", "Numeric overflow");
            return result;
          }
        }
      }
    }
  }
  function statement(node: Statement): "C" | "D" {
    step();
    switch (node.op) {
      case "return":
        record("Choose " + node.move);
        return node.move;
      case "if": {
        const condition = expr(node.condition);
        record("Condition " + String(condition));
        return statement(condition ? node.then : node.else);
      }
      case "set":
        memory[node.name] = expr(node.value) as Value;
        record("Set " + node.name + " = " + String(memory[node.name]));
        return statement(node.next);
    }
  }
  const move = statement(program.decision);
  if (bytes(memory) > LIMITS.memoryBytes)
    throw new ProgramError("MEMORY_LIMIT", "Memory exceeds 8 KiB");
  return { move, memory, rngState, steps, trace };
}
