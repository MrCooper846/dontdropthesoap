const choose = (move: "C" | "D") => ({
  type: "soap_return",
  fields: { MOVE: move },
});
export function starter(
  kind: "cooperate" | "betray" | "tit-for-tat" | "random",
) {
  const decision =
    kind === "cooperate"
      ? choose("C")
      : kind === "betray"
        ? choose("D")
        : {
            type: "soap_if",
            inputs: {
              CONDITION: {
                block:
                  kind === "tit-for-tat"
                    ? {
                        type: "soap_compare",
                        fields: { OP: "eq" },
                        inputs: {
                          LEFT: {
                            block: {
                              type: "soap_observe",
                              fields: { FACT: "lastOpponentMove" },
                            },
                          },
                          RIGHT: {
                            block: { type: "soap_move", fields: { MOVE: "D" } },
                          },
                        },
                      }
                    : {
                        type: "soap_compare",
                        fields: { OP: "lt" },
                        inputs: {
                          LEFT: { block: { type: "soap_random" } },
                          RIGHT: {
                            block: {
                              type: "soap_number",
                              fields: { NUM: 0.5 },
                            },
                          },
                        },
                      },
              },
              THEN: { block: choose(kind === "tit-for-tat" ? "D" : "C") },
              ELSE: { block: choose(kind === "tit-for-tat" ? "C" : "D") },
            },
          };
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "soap_program",
          x: 24,
          y: 24,
          inputs: { DECISION: { block: decision } },
        },
      ],
    },
  };
}
