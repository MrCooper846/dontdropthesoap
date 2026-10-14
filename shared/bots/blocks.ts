import type * as Blockly from "blockly/core";
const dropdown = (name: string, options: string[][]) => ({
  type: "field_dropdown",
  name,
  options,
});
const input = (name: string, check?: string) => ({
  type: "input_value",
  name,
  ...(check ? { check } : {}),
});
const statement = (name: string) => ({ type: "input_statement", name });
const text = (name: string, text: string) => ({
  type: "field_input",
  name,
  text,
});
export const BLOCKS = [
  {
    type: "soap_program",
    message0: "Strategy · initial memory %1 then decide %2",
    args0: [statement("MEMORY"), statement("DECISION")],
    colour: 275,
    tooltip: "One program; every decision branch must end in a choice.",
  },
  {
    type: "soap_return",
    message0: "choose %1",
    args0: [
      dropdown("MOVE", [
        ["cooperate", "C"],
        ["betray", "D"],
      ]),
    ],
    previousStatement: null,
    colour: 25,
  },
  {
    type: "soap_if",
    message0: "if %1 then %2 otherwise %3",
    args0: [
      input("CONDITION", "Boolean"),
      statement("THEN"),
      statement("ELSE"),
    ],
    previousStatement: null,
    colour: 210,
  },
  {
    type: "soap_set",
    message0: "remember %1 = %2",
    args0: [text("NAME", "turns"), input("VALUE")],
    previousStatement: null,
    nextStatement: null,
    colour: 275,
  },
  {
    type: "soap_init",
    message0: "memory %1 is %2 starting at %3",
    args0: [
      text("NAME", "turns"),
      dropdown("TYPE", [
        ["number", "number"],
        ["boolean", "boolean"],
        ["move", "move"],
      ]),
      text("VALUE", "0"),
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 275,
  },
  {
    type: "soap_number",
    message0: "%1",
    args0: [{ type: "field_number", name: "NUM", value: 0 }],
    output: "Number",
    colour: 160,
  },
  {
    type: "soap_boolean",
    message0: "%1",
    args0: [
      dropdown("BOOL", [
        ["true", "TRUE"],
        ["false", "FALSE"],
      ]),
    ],
    output: "Boolean",
    colour: 210,
  },
  {
    type: "soap_move",
    message0: "%1",
    args0: [
      dropdown("MOVE", [
        ["cooperate", "C"],
        ["betray", "D"],
      ]),
    ],
    output: "Move",
    colour: 25,
  },
  {
    type: "soap_none",
    message0: "no earlier move",
    output: "Move",
    colour: 25,
  },
  {
    type: "soap_observe",
    message0: "%1",
    args0: [
      dropdown("FACT", [
        ["round number", "round"],
        ["my score", "ownScore"],
        ["opponent score", "opponentScore"],
        ["opponent last revealed move", "lastOpponentMove"],
      ]),
    ],
    output: null,
    colour: 160,
  },
  {
    type: "soap_count",
    message0: "count %1 by %2",
    args0: [
      dropdown("MOVE", [
        ["cooperations", "C"],
        ["betrayals", "D"],
      ]),
      dropdown("WHO", [
        ["me", "self"],
        ["this opponent", "opponent"],
      ]),
    ],
    output: "Number",
    colour: 160,
  },
  {
    type: "soap_random",
    message0: "seeded random from 0 to 1",
    output: "Number",
    colour: 160,
  },
  {
    type: "soap_memory",
    message0: "memory %1",
    args0: [text("NAME", "turns")],
    output: null,
    colour: 275,
  },
  {
    type: "soap_compare",
    message0: "%1 %2 %3",
    args0: [
      input("LEFT"),
      dropdown("OP", [
        ["=", "eq"],
        ["<", "lt"],
        ["≤", "lte"],
        [">", "gt"],
        ["≥", "gte"],
      ]),
      input("RIGHT"),
    ],
    output: "Boolean",
    colour: 210,
    inputsInline: true,
  },
  {
    type: "soap_arithmetic",
    message0: "%1 %2 %3",
    args0: [
      input("LEFT", "Number"),
      dropdown("OP", [
        ["+", "add"],
        ["−", "sub"],
      ]),
      input("RIGHT", "Number"),
    ],
    output: "Number",
    colour: 160,
    inputsInline: true,
  },
  {
    type: "soap_logic",
    message0: "%1 %2 %3",
    args0: [
      input("LEFT", "Boolean"),
      dropdown("OP", [
        ["and", "and"],
        ["or", "or"],
      ]),
      input("RIGHT", "Boolean"),
    ],
    output: "Boolean",
    colour: 210,
    inputsInline: true,
  },
  {
    type: "soap_not",
    message0: "not %1",
    args0: [input("VALUE", "Boolean")],
    output: "Boolean",
    colour: 210,
  },
];
export function registerBlocks(Blockly: typeof import("blockly/core")) {
  if (!Blockly.Blocks.soap_program)
    Blockly.common.defineBlocksWithJsonArray(BLOCKS);
}
export const toolbox = {
  kind: "categoryToolbox",
  contents: [
    {
      kind: "category",
      name: "Decisions",
      colour: 25,
      contents: ["soap_return", "soap_if"].map((type) => ({
        kind: "block",
        type,
      })),
    },
    {
      kind: "category",
      name: "Observations",
      colour: 160,
      contents: [
        "soap_observe",
        "soap_count",
        "soap_random",
        "soap_number",
        "soap_move",
        "soap_none",
      ].map((type) => ({ kind: "block", type })),
    },
    {
      kind: "category",
      name: "Logic",
      colour: 210,
      contents: [
        "soap_compare",
        "soap_arithmetic",
        "soap_logic",
        "soap_boolean",
        "soap_not",
      ].map((type) => ({ kind: "block", type })),
    },
    {
      kind: "category",
      name: "Memory",
      colour: 275,
      contents: ["soap_init", "soap_memory", "soap_set"].map((type) => ({
        kind: "block",
        type,
      })),
    },
  ],
};
