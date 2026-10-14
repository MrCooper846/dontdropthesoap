export const INTERPRETER_VERSION = 1;
export const LIMITS = {
  depth: 32,
  nodes: 512,
  programBytes: 65536,
  steps: 2000,
  memoryBytes: 8192,
  trace: 32,
} as const;
export type Value = number | boolean | "C" | "D";
export type Expression =
  | Value
  | null
  | {
      op:
        "round" | "ownScore" | "opponentScore" | "lastOpponentMove" | "random";
    }
  | { op: "count"; who: "self" | "opponent"; move: "C" | "D" }
  | { op: "memory"; name: string }
  | { op: "not"; value: Expression }
  | {
      op: "eq" | "lt" | "lte" | "gt" | "gte" | "add" | "sub" | "and" | "or";
      left: Expression;
      right: Expression;
    };
export type Statement =
  | { op: "return"; move: "C" | "D" }
  | { op: "if"; condition: Expression; then: Statement; else: Statement }
  | { op: "set"; name: string; value: Expression; next: Statement };
export type Program = {
  schemaVersion: 1;
  memory: Record<string, Value>;
  decision: Statement;
};
type Kind = "number" | "boolean" | "move" | "nullableMove" | "null";
export class ProgramError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new ProgramError(code, message);
};
export function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export function valueKind(value: unknown): Kind {
  if (typeof value === "number" && Number.isFinite(value)) return "number";
  if (typeof value === "boolean") return "boolean";
  if (value === "C" || value === "D") return "move";
  if (value === null) return "null";
  return fail(
    "INVALID_PROGRAM",
    "Only finite numbers, booleans and moves are permitted",
  );
}
export function memoryName(name: unknown): string {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name) ||
    ["constructor", "prototype"].includes(name)
  )
    return fail(
      "INVALID_PROGRAM",
      "Memory names use 1–32 letters, digits or underscores and start with a letter",
    );
  return name;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("INVALID_PROGRAM", "Expected a program node");
  return value as Record<string, unknown>;
}
function keys(
  o: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  if (
    required.some((k) => !Object.hasOwn(o, k)) ||
    Object.keys(o).some((k) => !required.includes(k) && !optional.includes(k))
  )
    fail("INVALID_PROGRAM", "Missing or unknown node field");
}
// Iterative preflight bounds attacker-controlled shapes before recursive validation
// or serialization. Accessors, aliases/cycles and non-JSON objects are rejected.
function preflight(value: unknown) {
  const todo = [{ value, depth: 0 }],
    seen = new Set<object>();
  let cells = 0;
  while (todo.length) {
    const item = todo.pop()!;
    if (++cells > 4096 || item.depth > 64)
      fail("PROGRAM_LIMIT", "Program structure is too large or deep");
    if (item.value && typeof item.value === "object") {
      const v = item.value;
      if (
        Array.isArray(v) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
        seen.has(v)
      )
        fail("INVALID_PROGRAM", "Program must be an unshared JSON tree");
      seen.add(v);
      for (const [name, d] of Object.entries(
        Object.getOwnPropertyDescriptors(v),
      )) {
        if (!d.enumerable || !("value" in d) || name.length > 64)
          fail("INVALID_PROGRAM", "Invalid JSON property");
        todo.push({ value: d.value, depth: item.depth + 1 });
      }
    } else if (typeof item.value === "string") {
      if (item.value.length > LIMITS.programBytes)
        fail("PROGRAM_LIMIT", "Program exceeds 64 KiB");
    } else if (
      item.value !== null &&
      !["number", "boolean"].includes(typeof item.value)
    )
      fail("INVALID_PROGRAM", "Invalid JSON value");
  }
  if (bytes(value) > LIMITS.programBytes)
    fail("PROGRAM_LIMIT", "Program exceeds 64 KiB");
}
export function validateProgram(input: unknown): Program {
  preflight(input);
  const root = object(input);
  keys(root, ["schemaVersion", "decision"], ["memory"]);
  if (root.schemaVersion !== 1)
    fail("VERSION_UNSUPPORTED", "Unsupported visual program version");
  const declared = root.memory === undefined ? {} : object(root.memory);
  const memory: Record<string, Value> = {};
  if (Object.keys(declared).length > 128)
    fail("MEMORY_LIMIT", "At most 128 named memory slots");
  for (const name of Object.keys(declared).sort()) {
    memoryName(name);
    if (valueKind(declared[name]) === "null")
      fail("INVALID_PROGRAM", "Memory requires a typed initial value");
    memory[name] = declared[name] as Value;
  }
  if (bytes(memory) > LIMITS.memoryBytes)
    fail("MEMORY_LIMIT", "Memory exceeds 8 KiB");
  let nodes = 0;
  function budget(depth: number) {
    if (depth > LIMITS.depth || ++nodes > LIMITS.nodes)
      fail("PROGRAM_LIMIT", "Program exceeds 32 levels or 512 nodes");
  }
  function expr(raw: unknown, depth: number): { node: Expression; kind: Kind } {
    budget(depth);
    if (raw === null || typeof raw !== "object")
      return { node: raw as Value | null, kind: valueKind(raw) };
    const o = object(raw),
      op = o.op;
    if (
      [
        "round",
        "ownScore",
        "opponentScore",
        "lastOpponentMove",
        "random",
      ].includes(String(op))
    ) {
      keys(o, ["op"]);
      return {
        node: { op } as Expression,
        kind: op === "lastOpponentMove" ? "nullableMove" : "number",
      };
    }
    if (op === "count") {
      keys(o, ["op", "who", "move"]);
      if (
        !["self", "opponent"].includes(String(o.who)) ||
        !["C", "D"].includes(String(o.move))
      )
        fail("INVALID_PROGRAM", "Invalid move counter");
      return {
        node: { op, who: o.who, move: o.move } as Expression,
        kind: "number",
      };
    }
    if (op === "memory") {
      keys(o, ["op", "name"]);
      const name = memoryName(o.name);
      if (!Object.hasOwn(memory, name))
        fail("INVALID_PROGRAM", "Read of undeclared memory");
      return { node: { op, name }, kind: valueKind(memory[name]) };
    }
    if (op === "not") {
      keys(o, ["op", "value"]);
      const a = expr(o.value, depth + 1);
      if (a.kind !== "boolean") fail("TYPE_ERROR", "Not requires a boolean");
      return { node: { op, value: a.node }, kind: "boolean" };
    }
    if (
      !["eq", "lt", "lte", "gt", "gte", "add", "sub", "and", "or"].includes(
        String(op),
      )
    )
      fail("INVALID_PROGRAM", "Unknown expression opcode");
    keys(o, ["op", "left", "right"]);
    const a = expr(o.left, depth + 1),
      b = expr(o.right, depth + 1);
    let kind: Kind = "boolean";
    if (op === "eq") {
      const moveKinds = ["move", "nullableMove", "null"];
      if (
        a.kind !== b.kind &&
        !(moveKinds.includes(a.kind) && moveKinds.includes(b.kind))
      )
        fail("TYPE_ERROR", "Equality compares compatible values");
    } else if (op === "and" || op === "or") {
      if (a.kind !== "boolean" || b.kind !== "boolean")
        fail("TYPE_ERROR", "Boolean operators require booleans");
    } else {
      if (a.kind !== "number" || b.kind !== "number")
        fail("TYPE_ERROR", "Numeric operators require numbers");
      if (op === "add" || op === "sub") kind = "number";
    }
    return { node: { op, left: a.node, right: b.node } as Expression, kind };
  }
  function statement(raw: unknown, depth: number): Statement {
    budget(depth);
    const o = object(raw);
    if (o.op === "return") {
      keys(o, ["op", "move"]);
      if (o.move !== "C" && o.move !== "D")
        fail("TYPE_ERROR", "A return chooses cooperate or betray");
      return { op: "return", move: o.move as "C" | "D" };
    }
    if (o.op === "if") {
      keys(o, ["op", "condition", "then", "else"]);
      const condition = expr(o.condition, depth + 1);
      if (condition.kind !== "boolean")
        fail("TYPE_ERROR", "An if condition must be boolean");
      return {
        op: "if",
        condition: condition.node,
        then: statement(o.then, depth + 1),
        else: statement(o.else, depth + 1),
      };
    }
    if (o.op === "set") {
      keys(o, ["op", "name", "value", "next"]);
      const name = memoryName(o.name),
        value = expr(o.value, depth + 1);
      if (!Object.hasOwn(memory, name))
        fail("INVALID_PROGRAM", "Write to undeclared memory");
      if (valueKind(memory[name]) !== value.kind)
        fail("TYPE_ERROR", "Memory writes retain the declared type");
      return {
        op: "set",
        name,
        value: value.node,
        next: statement(o.next, depth + 1),
      };
    }
    return fail("INVALID_PROGRAM", "Unknown statement opcode");
  }
  return { schemaVersion: 1, memory, decision: statement(root.decision, 1) };
}
export function canonicalProgram(input: unknown) {
  return JSON.stringify(validateProgram(input));
}
