import { it, expect } from "vitest";
import { parseCommand } from "../shared/protocol/commands";
it("rejects unsupported major versions distinctly and malformed envelopes", () => {
  expect(() => parseCommand({ v: 2 })).toThrow("VERSION_UNSUPPORTED");
  expect(() => parseCommand({ v: 1 })).toThrow();
});
