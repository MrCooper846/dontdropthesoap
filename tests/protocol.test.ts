import { it, expect } from "vitest";
import v1Fixtures from "./fixtures/protocol-v1.json";
import {
  parseCommand,
  moveSchema,
  readySchema,
  settingsSchema,
} from "../shared/protocol/commands";
it("rejects unsupported major versions distinctly and malformed envelopes", () => {
  expect(() => parseCommand({ v: 2 })).toThrow("VERSION_UNSUPPORTED");
  expect(() => parseCommand({ v: 1 })).toThrow();
});

it.each(v1Fixtures)(
  "retains the documented v1 $type wire request",
  (fixture) => {
    const parsed = parseCommand(JSON.parse(JSON.stringify(fixture)));
    expect(parsed).toEqual(fixture);
    if (parsed.type === "move.submit")
      expect(moveSchema.parse(parsed.payload)).toEqual(fixture.payload);
    if (parsed.type === "seat.ready")
      expect(readySchema.parse(parsed.payload)).toEqual(fixture.payload);
    if (parsed.type === "match.configure")
      expect(settingsSchema.parse(parsed.payload)).toEqual(fixture.payload);
  },
);

it("does not accept authority fields outside the v1 request contract", () => {
  expect(() =>
    parseCommand({
      ...v1Fixtures[0],
      ownerId: "33333333-3333-4333-8333-333333333333",
    }),
  ).toThrow();
});
