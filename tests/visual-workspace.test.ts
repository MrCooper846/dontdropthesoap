import * as Blockly from "blockly/core";
import { it, expect } from "vitest";
import { registerBlocks } from "../shared/bots/blocks";
import { starter } from "../shared/bots/presets";
import { compileWorkspace } from "../domain/bots/workspace";
import { execute } from "../domain/bots/interpreter";
registerBlocks(Blockly);
const observation = {
  round: 1,
  ownScore: 0,
  opponentScore: 0,
  lastOpponentMove: null,
  ownCooperations: 0,
  ownBetrayals: 0,
  opponentCooperations: 0,
  opponentBetrayals: 0,
};
it("real Blockly round-trips starter workspaces into the same canonical executable program", () => {
  for (const name of [
    "cooperate",
    "betray",
    "tit-for-tat",
    "random",
  ] as const) {
    const input = starter(name),
      workspace = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(input, workspace);
      const saved = Blockly.serialization.workspaces.save(workspace);
      expect(compileWorkspace(saved)).toEqual(compileWorkspace(input));
      expect(workspace.getAllBlocks(false).length).toBeGreaterThan(1);
    } finally {
      workspace.dispose();
    }
  }
});
it("block field edits change the derived program; no separate claimed AST can disguise it", () => {
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(starter("cooperate"), workspace);
    const choice = workspace
      .getAllBlocks(false)
      .find((b) => b.type === "soap_return")!;
    choice.setFieldValue("D", "MOVE");
    expect(
      execute(
        compileWorkspace(Blockly.serialization.workspaces.save(workspace)),
        observation,
      ).move,
    ).toBe("D");
  } finally {
    workspace.dispose();
  }
});
it("rejects spare roots, hidden executable state, disabled blocks and mismatched values", () => {
  const spare: any = starter("cooperate");
  spare.blocks.blocks.push({ type: "soap_program" });
  expect(() => compileWorkspace(spare)).toThrow(/exactly one/);
  const hidden: any = starter("cooperate");
  hidden.blocks.blocks[0].extraState = { code: "evil" };
  expect(() => compileWorkspace(hidden)).toThrow();
  const disabled: any = starter("cooperate");
  disabled.blocks.blocks[0].enabled = false;
  expect(() => compileWorkspace(disabled)).toThrow(/Enable all/);
  const wrong: any = starter("tit-for-tat");
  wrong.blocks.blocks[0].inputs.DECISION.block.inputs.CONDITION.block.fields.OP =
    "eval";
  expect(() => compileWorkspace(wrong)).toThrow(/operator/);
});
it("rejects cycle/oversize workspaces before recursive block traversal", () => {
  const cycle: any = starter("cooperate");
  cycle.blocks.blocks[0].inputs.DECISION.block = cycle;
  expect(() => compileWorkspace(cycle)).toThrow();
  expect(() =>
    compileWorkspace({
      blocks: { languageVersion: 0, blocks: [] },
      data: "x".repeat(65537),
    }),
  ).toThrow();
});
