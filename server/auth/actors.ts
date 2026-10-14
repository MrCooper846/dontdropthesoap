import type { IncomingMessage } from "node:http";
import type { PoolClient } from "pg";
import { authenticate, assertController } from "./sessions";
import { botPrincipal, lockBotController, assertScope } from "../bots/identity";
import { pool } from "../persistence/db";
export async function actor(
  req: IncomingMessage,
  db: PoolClient | typeof pool = pool,
) {
  if (req.headers.authorization)
    return { kind: "bot" as const, ...(await botPrincipal(req, db)) };
  return { kind: "browser" as const, ...(await authenticate(req, db)) };
}
export async function lockActor(
  db: PoolClient,
  p: Awaited<ReturnType<typeof actor>>,
  epoch: number,
) {
  if (p.kind === "bot") {
    assertScope(p, "moves:write");
    await lockBotController(db, p, epoch);
  } else await assertController(db, p, epoch);
}
