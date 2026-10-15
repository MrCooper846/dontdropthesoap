import { it, expect } from "vitest";
import { BlockRouting, type BlockEdge } from "../server/yards/block-routing";
function gate() {
  let resolve!: (rows: BlockEdge[]) => void;
  const promise = new Promise<BlockEdge[]>((r) => (resolve = r));
  return { promise, resolve };
}
it("denies unknown participants, bounds edges to the requested membership and suppresses both directions", async () => {
  const cache = new BlockRouting(3);
  expect(cache.blocked("a", "b")).toBe(true);
  await cache.refresh(["a", "b"], async () => [
    { owner_id: "a", blocked_owner_id: "b" },
    { owner_id: "x", blocked_owner_id: "y" },
  ]);
  expect(cache.size).toBe(1);
  expect(cache.blocked("b", "a")).toBe(true);
  expect(cache.blocked("a", "c")).toBe(true);
  await cache.refresh(["a", "b", "c"], async () => []);
  expect(cache.blocked("a", "c")).toBe(false);
  await expect(
    cache.refresh(["a", "b", "c", "d"], async () => []),
  ).rejects.toThrow("Routing state");
  expect(cache.blocked("a", "c")).toBe(true);
});
it("an old refresh cannot undo a later block, invalidation or failed current read", async () => {
  const cache = new BlockRouting(2),
    old = gate();
  const stale = cache.refresh(["a", "b"], () => old.promise);
  cache.invalidate();
  await cache.refresh(["a", "b"], async () => [
    { owner_id: "a", blocked_owner_id: "b" },
  ]);
  old.resolve([]);
  await stale;
  expect(cache.blocked("a", "b")).toBe(true);
  await expect(
    cache.refresh(["a", "b"], async () => {
      throw Error("unavailable");
    }),
  ).rejects.toThrow();
  expect(cache.blocked("a", "b")).toBe(true);
  await cache.refresh(["a", "b"], async () => []);
  expect(cache.blocked("a", "b")).toBe(false);
});
