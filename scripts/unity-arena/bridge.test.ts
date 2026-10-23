import { afterEach, expect, it, vi } from "vitest";
import { Bridge } from "./bridge";
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

it("waits for native main-thread acknowledgement and asynchronous server completion", async () => {
  let release!: () => void;
  const dispatched = new Promise<void>((resolve) => {
    release = resolve;
  });
  let observations = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/act")) {
      await dispatched;
      return reply({ accepted: true, actionId: 7 }, 202);
    }
    observations++;
    return reply({
      screen: "active",
      busy: observations === 1,
      completedActionId: 7,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const result = new Bridge(21101).act({ op: "stop" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(observations).toBe(0);
  release();
  expect((await result).busy).toBe(false);
  expect(observations).toBe(2);
});

it("does not mistake a not-busy delayed join for successful participation", async () => {
  let observations = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/act"))
        return reply({ accepted: true, actionId: 9 }, 202);
      observations++;
      return reply({
        screen: "waiting",
        shiftId: "shift",
        busy: false,
        completedActionId: 9,
        shift: { me: observations === 1 ? null : { active: true } },
      });
    }),
  );
  const result = await new Bridge(21102).act({ op: "join", id: "shift" });
  expect(result.shift?.me).toEqual({ active: true });
  expect(observations).toBe(2);
});

it("waits for its own action ID even when a stale observation says not busy", async () => {
  let observations = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/act"))
        return reply({ accepted: true, actionId: 11 }, 202);
      observations++;
      return reply({
        screen: "active",
        busy: false,
        completedActionId: observations === 1 ? 10 : 11,
        pendingActions: 0,
      });
    }),
  );
  const result = await new Bridge(21101).act({ op: "stop" });
  expect(result.completedActionId).toBe(11);
  expect(observations).toBe(2);
});

it("refuses unavailable human controls without dispatching a mutation", async () => {
  const fetcher = vi.fn(async () =>
    reply({ controls: [{ name: "Take noodles", enabled: false }] }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new Bridge(21103).act({ op: "interact", name: "Take noodles" }),
  ).rejects.toThrow("not available");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects non-acknowledged native actions and non-owned bridge ports", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply({ accepted: false }, 202)),
  );
  await expect(new Bridge(21104).act({ op: "stop" })).rejects.toThrow(
    "not acknowledged",
  );
  expect(() => new Bridge(3157)).toThrow("21101..21104");
});
