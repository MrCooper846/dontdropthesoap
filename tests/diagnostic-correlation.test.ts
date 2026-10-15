import { it, expect, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { command } from "../server/commands/matches";

it("correlates rejected commands while discarding payloads, arbitrary codes and invalid identifiers; sheds floods", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const commandId = "09f81963-7c8f-4f3d-a9b2-1911b6177140";
  const matchId = "15e780de-9a14-46d3-b8c2-d029f1d55d16";
  const sentinel = "secret-move-cookie-prompt-sentinel";
  const req = {} as IncomingMessage;
  try {
    // Invalid protocol version rejects before authentication or database work.
    await expect(
      command(req, {
        v: 999,
        commandId,
        matchId,
        type: "move.submit",
        payload: { move: sentinel },
        authorization: sentinel,
      }),
    ).rejects.toThrow();
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toEqual({
      event: "command.rejected",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      commandId,
      matchId,
      action: "move.submit",
      latencyMs: expect.any(Number),
      code: "VERSION_UNSUPPORTED",
    });
    await expect(
      command(req, {
        v: 999,
        commandId: sentinel,
        matchId: sentinel,
        type: sentinel,
      }),
    ).rejects.toThrow();
    expect(JSON.parse(log.mock.calls[1][0])).not.toHaveProperty("commandId");
    for (let i = 0; i < 100; i++) {
      await expect(
        command(req, { v: 999, payload: sentinel }),
      ).rejects.toThrow();
    }
    expect(log.mock.calls.length).toBeLessThanOrEqual(20);
    expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
  } finally {
    log.mockRestore();
  }
});
