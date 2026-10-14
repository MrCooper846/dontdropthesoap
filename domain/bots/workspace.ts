import {
  validateProgram,
  ProgramError,
  LIMITS,
  bytes,
  type Expression,
  type Statement,
  type Value,
  type Program,
} from "./program";
type Node = Record<string, any>;
const error = (message: string): never => {
  throw new ProgramError("INVALID_WORKSPACE", message);
};
function obj(v: unknown): Node {
  if (!v || typeof v !== "object" || Array.isArray(v))
    return error("Expected a workspace object");
  return v as Node;
}
function shape(o: Node, required: string[], optional: string[] = []) {
  if (
    required.some((k) => !Object.hasOwn(o, k)) ||
    Object.keys(o).some((k) => !required.includes(k) && !optional.includes(k))
  )
    error("Missing or unknown workspace field");
}
const blockTypes = [
  "soap_program",
  "soap_return",
  "soap_if",
  "soap_set",
  "soap_init",
  "soap_number",
  "soap_boolean",
  "soap_move",
  "soap_none",
  "soap_observe",
  "soap_count",
  "soap_random",
  "soap_memory",
  "soap_compare",
  "soap_arithmetic",
  "soap_logic",
  "soap_not",
];
function inspect(input: unknown) {
  const todo = [{ value: input, depth: 0 }],
    seen = new Set<object>();
  let cells = 0,
    blocks = 0;
  while (todo.length) {
    const { value, depth } = todo.pop()!;
    if (++cells > 8192 || depth > 128) error("Workspace is too large or deep");
    if (value && typeof value === "object") {
      if (seen.has(value)) error("Workspace must be an unshared JSON tree");
      seen.add(value);
      if (Array.isArray(value)) {
        if (value.length > 512) error("Too many workspace items");
      } else if (
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      )
        error("Workspace must contain JSON objects");
      if (
        Object.hasOwn(value, "type") &&
        blockTypes.includes(
          Object.getOwnPropertyDescriptor(value, "type")?.value,
        ) &&
        ++blocks > 512
      )
        error("Too many blocks");
      for (const [k, d] of Object.entries(
        Object.getOwnPropertyDescriptors(value),
      )) {
        if (Array.isArray(value) && k === "length") continue;
        if (!d.enumerable || !("value" in d) || k.length > 64)
          error("Invalid workspace property");
        todo.push({ value: d.value, depth: depth + 1 });
      }
    } else if (typeof value === "string") {
      if (value.length > 65536) error("Workspace exceeds 64 KiB");
    } else if (
      value !== null &&
      !(
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      )
    )
      error("Invalid JSON value");
  }
  if (bytes(input) > 65536) error("Workspace exceeds 64 KiB");
}
export function compileWorkspace(input: unknown): Program {
  inspect(input);
  const workspace = obj(input);
  shape(workspace, ["blocks"]);
  const collection = obj(workspace.blocks);
  shape(collection, ["languageVersion", "blocks"]);
  if (
    collection.languageVersion !== 0 ||
    !Array.isArray(collection.blocks) ||
    collection.blocks.length !== 1
  )
    error(
      "Use exactly one Strategy root; connect or remove spare blocks before publishing",
    );
  function block(
    raw: unknown,
    fields: string[],
    inputs: string[],
    next = false,
  ): Node {
    const b = obj(raw);
    shape(
      b,
      ["type"],
      [
        "id",
        "x",
        "y",
        "collapsed",
        "deletable",
        "movable",
        "editable",
        "enabled",
        "disabledReasons",
        "inline",
        "data",
        "icons",
        "fields",
        "inputs",
        ...(next ? ["next"] : []),
      ],
    );
    if (!blockTypes.includes(b.type)) error("Unknown block type");
    if (
      b.enabled === false ||
      (b.disabledReasons &&
        (!Array.isArray(b.disabledReasons) || b.disabledReasons.length))
    )
      error("Enable all blocks before publishing");
    const f = b.fields === undefined ? {} : obj(b.fields),
      i = b.inputs === undefined ? {} : obj(b.inputs);
    shape(f, fields);
    shape(i, [], inputs);
    for (const key of Object.keys(i)) {
      const c = obj(i[key]);
      shape(c, [], ["block", "shadow"]);
      if (!c.block && !c.shadow) error("Connect the " + key + " input");
      if (c.shadow) {
        // A hidden fallback may not smuggle a different language into saved workspaces.
        if (!blockTypes.includes(obj(c.shadow).type))
          error("Unknown shadow block");
      }
    }
    return b;
  }
  function child(b: Node, name: string, required = true): unknown {
    const connection = b.inputs?.[name];
    if (!connection) {
      if (required) error("Connect the " + name + " input");
      return undefined;
    }
    return connection.block ?? connection.shadow;
  }
  function expression(raw: unknown): Expression {
    const type = obj(raw).type;
    let b: Node;
    switch (type) {
      case "soap_number":
        b = block(raw, ["NUM"], []);
        if (typeof b.fields.NUM !== "number" || !Number.isFinite(b.fields.NUM))
          error("Enter a finite number");
        return b.fields.NUM;
      case "soap_boolean":
        b = block(raw, ["BOOL"], []);
        if (!["TRUE", "FALSE"].includes(b.fields.BOOL))
          error("Invalid boolean");
        return b.fields.BOOL === "TRUE";
      case "soap_move":
        b = block(raw, ["MOVE"], []);
        if (!["C", "D"].includes(b.fields.MOVE)) error("Invalid move");
        return b.fields.MOVE;
      case "soap_none":
        block(raw, [], []);
        return null;
      case "soap_observe":
        b = block(raw, ["FACT"], []);
        if (
          !["round", "ownScore", "opponentScore", "lastOpponentMove"].includes(
            b.fields.FACT,
          )
        )
          error("Unknown observation");
        return { op: b.fields.FACT };
      case "soap_count":
        b = block(raw, ["WHO", "MOVE"], []);
        return { op: "count", who: b.fields.WHO, move: b.fields.MOVE };
      case "soap_memory":
        b = block(raw, ["NAME"], []);
        return { op: "memory", name: b.fields.NAME };
      case "soap_random":
        block(raw, [], []);
        return { op: "random" };
      case "soap_not":
        b = block(raw, [], ["VALUE"]);
        return { op: "not", value: expression(child(b, "VALUE")) };
      case "soap_compare":
      case "soap_arithmetic":
      case "soap_logic": {
        b = block(raw, ["OP"], ["LEFT", "RIGHT"]);
        const allowed =
          type === "soap_compare"
            ? ["eq", "lt", "lte", "gt", "gte"]
            : type === "soap_arithmetic"
              ? ["add", "sub"]
              : ["and", "or"];
        if (!allowed.includes(b.fields.OP)) error("Invalid operator");
        return {
          op: b.fields.OP,
          left: expression(child(b, "LEFT")),
          right: expression(child(b, "RIGHT")),
        };
      }
      default:
        return error("Use a value block in this input");
    }
  }
  function decision(raw: unknown): Statement {
    const type = obj(raw).type;
    if (type === "soap_return") {
      const b = block(raw, ["MOVE"], []);
      return { op: "return", move: b.fields.MOVE };
    }
    if (type === "soap_if") {
      const b = block(raw, [], ["CONDITION", "THEN", "ELSE"]);
      return {
        op: "if",
        condition: expression(child(b, "CONDITION")),
        then: decision(child(b, "THEN")),
        else: decision(child(b, "ELSE")),
      };
    }
    if (type === "soap_set") {
      const b = block(raw, ["NAME"], ["VALUE"], true);
      const next = obj(b.next);
      shape(next, ["block"]);
      return {
        op: "set",
        name: b.fields.NAME,
        value: expression(child(b, "VALUE")),
        next: decision(next.block),
      };
    }
    return error("Every decision path must end with a choice");
  }
  const root = block(collection.blocks[0], [], ["MEMORY", "DECISION"]);
  if (root.type !== "soap_program") error("Use a Strategy root");
  const memory: Record<string, Value> = Object.create(null);
  let declaration = child(root, "MEMORY", false);
  while (declaration) {
    const b = block(declaration, ["NAME", "TYPE", "VALUE"], [], true);
    if (b.type !== "soap_init")
      error("Use memory declarations in initial memory");
    const name = b.fields.NAME;
    if (typeof name !== "string" || Object.hasOwn(memory, name))
      error("Memory names must be distinct");
    let value: Value;
    if (
      b.fields.TYPE === "number" &&
      typeof b.fields.VALUE === "string" &&
      b.fields.VALUE.trim() !== ""
    )
      value = Number(b.fields.VALUE);
    else if (
      b.fields.TYPE === "boolean" &&
      ["true", "false"].includes(b.fields.VALUE)
    )
      value = b.fields.VALUE === "true";
    else if (b.fields.TYPE === "move" && ["C", "D"].includes(b.fields.VALUE))
      value = b.fields.VALUE;
    else return error("Initial memory value does not match its type");
    memory[name] = value;
    if (b.next) {
      shape(obj(b.next), ["block"]);
      declaration = b.next.block;
    } else declaration = undefined;
  }
  return validateProgram({
    schemaVersion: 1,
    memory,
    decision: decision(child(root, "DECISION")),
  });
}
