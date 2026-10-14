import type { Expression, Statement, Program } from "./program";
const move = (v: unknown) =>
  v === "C" ? "cooperate" : v === "D" ? "betray" : String(v);
function expression(e: Expression): string {
  if (e === null) return "no earlier move";
  if (typeof e !== "object") return move(e);
  switch (e.op) {
    case "round":
      return "round number";
    case "ownScore":
      return "my score";
    case "opponentScore":
      return "opponent score";
    case "lastOpponentMove":
      return "this opponent's last revealed move";
    case "count":
      return (
        (e.who === "self" ? "my" : "this opponent's") +
        " " +
        (e.move === "C" ? "cooperations" : "betrayals")
      );
    case "random":
      return "seeded random number";
    case "memory":
      return "memory " + e.name;
    case "not":
      return "not (" + expression(e.value) + ")";
    default: {
      const signs = {
        eq: "=",
        lt: "<",
        lte: "≤",
        gt: ">",
        gte: "≥",
        add: "+",
        sub: "−",
        and: "and",
        or: "or",
      };
      return (
        "(" +
        expression(e.left) +
        " " +
        signs[e.op] +
        " " +
        expression(e.right) +
        ")"
      );
    }
  }
}
function statements(s: Statement, indent = ""): string {
  if (s.op === "return") return indent + "Choose " + move(s.move);
  if (s.op === "set")
    return (
      indent +
      "Remember " +
      s.name +
      " = " +
      expression(s.value) +
      "\n" +
      statements(s.next, indent)
    );
  return (
    indent +
    "If " +
    expression(s.condition) +
    "\n" +
    statements(s.then, indent + "  ") +
    "\n" +
    indent +
    "Otherwise\n" +
    statements(s.else, indent + "  ")
  );
}
export function summarize(program: Program) {
  return statements(program.decision);
}
