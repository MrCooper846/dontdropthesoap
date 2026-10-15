import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { io } from "socket.io-client";
import { enter, own, origin } from "./helpers";
test("historical block pages do not hide current-yard block controls after reload", async ({
  browser,
}) => {
  const db = new Pool({
    connectionString:
      "postgresql://soap:soap_local_only@localhost:55432/soap_yard_browser",
  });
  const a = await browser.newContext(),
    b = await browser.newContext();
  let departed: ReturnType<typeof io> | undefined;
  try {
    await db.query("TRUNCATE owners CASCADE");
    const host = await a.newPage(),
      target = await b.newPage();
    await enter(host, "Paged blocker");
    await enter(target, "Nearby block target");
    const ownerId = (await own(host)).session.ownerId,
      targetId = (await own(target)).session.ownerId;
    const offline = Array.from(
      { length: 203 },
      (_, i) =>
        "00000000-0000-4000-8000-" + (i + 1).toString(16).padStart(12, "0"),
    );
    await db.query(
      "INSERT INTO owners(id,display_name) SELECT id,'Offline block fixture' FROM unnest($1::uuid[]) AS id",
      [offline],
    );
    await db.query(
      "INSERT INTO owner_blocks(owner_id,blocked_owner_id) SELECT $1,id FROM unnest($2::uuid[]) AS id",
      [ownerId, offline],
    );
    await target
      .getByLabel("Nearby message", { exact: true })
      .fill("Buffered before block");
    await target.getByRole("button", { name: "Send", exact: true }).click();
    await expect(host.getByLabel("Nearby messages")).toContainText(
      "Buffered before block",
    );
    await host
      .getByRole("button", { name: "Block Nearby block target", exact: true })
      .click();
    await expect(
      host.getByRole("button", {
        name: "Unblock Nearby block target",
        exact: true,
      }),
    ).toBeVisible();
    let after: string | null = null;
    const ids: string[] = [];
    const sizes: number[] = [];
    do {
      const response: { blocks: string[]; next: string | null } =
        await host.request
          .get("/api/v1/blocks" + (after ? "?after=" + after : ""))
          .then((r) => r.json());
      ids.push(...response.blocks);
      sizes.push(response.blocks.length);
      after = response.next;
    } while (after);
    expect(sizes).toEqual([100, 100, 4]);
    expect(new Set(ids)).toEqual(new Set([...offline, targetId]));
    expect(
      await host.request.get("/api/v1/blocks?scope=yard").then((r) => r.json()),
    ).toEqual({ blocks: [targetId], next: null });
    await expect(host.getByLabel("Nearby messages")).not.toContainText(
      "Buffered before block",
    );
    departed = io(origin + "/game-v1", {
      transports: ["websocket"],
      extraHeaders: {
        Origin: origin,
        Cookie: (await b.cookies())
          .map((c) => c.name + "=" + c.value)
          .join("; "),
      },
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      departed!.once("connect", resolve);
      departed!.once("connect_error", reject);
    });
    const epoch = (await own(target)).session.controllerEpoch;
    expect(
      (
        await departed
          .timeout(5000)
          .emitWithAck("yard.enter", { controllerEpoch: epoch })
      ).ok,
    ).toBe(true);
    expect(
      (await departed.timeout(5000).emitWithAck("yard.leave", {})).ok,
    ).toBe(true);
    await expect(
      host.getByRole("button", {
        name: "Unblock Nearby block target",
        exact: true,
      }),
    ).toHaveCount(0);
    // A real membership refresh must retain the block for an already buffered message.
    await expect
      .poll(async () =>
        host.request.get("/api/v1/blocks?scope=yard").then((r) => r.json()),
      )
      .toEqual({ blocks: [targetId], next: null });
    await expect(host.getByLabel("Nearby messages")).not.toContainText(
      "Buffered before block",
    );
    expect(
      (
        await departed
          .timeout(5000)
          .emitWithAck("yard.enter", { controllerEpoch: epoch })
      ).ok,
    ).toBe(true);
    await host.reload();
    await host.getByRole("button", { name: "Enter yard" }).click();
    await expect(
      host.getByRole("button", {
        name: "Unblock Nearby block target",
        exact: true,
      }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Unblock Nearby block target", exact: true })
      .click();
    await expect(
      host.getByRole("button", {
        name: "Block Nearby block target",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await host.request.get("/api/v1/blocks?after=invalid")).status(),
    ).toBe(400);
  } finally {
    departed?.close();
    await a.close();
    await b.close();
    await db.end();
  }
});
