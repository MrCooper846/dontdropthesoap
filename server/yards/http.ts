import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json, body } from "../http";
import { authenticate, assertController } from "../auth/sessions";
import { pool, transaction } from "../persistence/db";
import { requireYard, requireNearby, refreshBlocks, snapshot } from "./world";
import { config } from "../config";
import { RuleError } from "../../domain/match/model";
export async function yardHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  if (!config.FEATURE_YARD) return false;
  const p = await authenticate(req);
  if (path === "/yards" && method === "GET") {
    json(res, 200, {
      yards: [
        {
          id: "main-yard",
          name: "Prison yard",
          capacity: config.MAX_YARD_PLAYERS,
          players: snapshot().players.length,
        },
      ],
    });
    return true;
  }
  if (path === "/yard" && method === "GET") {
    requireYard(p.ownerId);
    json(res, 200, snapshot());
    return true;
  }
  if (path === "/blocks" && method === "GET") {
    json(res, 200, {
      blocks: (
        await pool.query(
          "SELECT blocked_owner_id FROM owner_blocks WHERE owner_id=$1",
          [p.ownerId],
        )
      ).rows.map((r) => r.blocked_owner_id),
    });
    return true;
  }
  const block = path.match(/^\/blocks(?:\/([^/]+))?$/);
  if (block && (method === "POST" || method === "DELETE")) {
    const input =
      method === "POST"
        ? z
            .object({
              ownerId: z.string().uuid(),
              controllerEpoch: z.number().int(),
            })
            .strict()
            .parse(await body(req))
        : z
            .object({ controllerEpoch: z.number().int() })
            .strict()
            .parse(await body(req));
    const target =
      method === "POST"
        ? z
            .string()
            .uuid()
            .parse("ownerId" in input ? input.ownerId : undefined)
        : z.string().uuid().parse(block[1]);
    if (target === p.ownerId) throw new RuleError("INVALID_PAYLOAD");
    await transaction(async (db) => {
      await assertController(db, p, input.controllerEpoch);
      if (
        !(await db.query("SELECT id FROM owners WHERE id=$1", [target]))
          .rowCount
      )
        throw new RuleError("NOT_FOUND");
      if (method === "POST")
        await db.query(
          "INSERT INTO owner_blocks(owner_id,blocked_owner_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [p.ownerId, target],
        );
      else
        await db.query(
          "DELETE FROM owner_blocks WHERE owner_id=$1 AND blocked_owner_id=$2",
          [p.ownerId, target],
        );
    });
    await refreshBlocks();
    json(res, 200, { ok: true });
    return true;
  }
  if (path === "/reports" && method === "POST") {
    const input = z
      .object({
        ownerId: z.string().uuid(),
        reason: z.string().trim().min(1).max(500),
        controllerEpoch: z.number().int(),
      })
      .strict()
      .parse(await body(req));
    requireYard(p.ownerId);
    await transaction(async (db) => {
      await assertController(db, p, input.controllerEpoch);
      if (
        !(await db.query("SELECT id FROM owners WHERE id=$1", [input.ownerId]))
          .rowCount
      )
        throw new RuleError("NOT_FOUND");
      await db.query(
        "INSERT INTO reports(id,reporter_id,subject_owner_id,reason) VALUES($1,$2,$3,$4)",
        [randomUUID(), p.ownerId, input.ownerId, input.reason],
      );
    });
    json(res, 201, { ok: true });
    return true;
  }
  return false;
}
