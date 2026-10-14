import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { config } from "../config";
import { json, body, rateLimit } from "../http";
import { resource } from "../commands/resources";
import {
  publishVisual,
  visualVersion,
  visualFeedback,
} from "./visual-publication";
import { authenticate, assertController } from "../auth/sessions";
import { transaction } from "../persistence/db";
import { compileWorkspace } from "../../domain/bots/workspace";
import type { Observation, RuntimeState } from "../../domain/bots/interpreter";
import { RuleError } from "../../domain/match/model";
import { VisualPool } from "./visual-pool";
let previews: VisualPool | undefined;
const pending = new Set<string>();
export async function closeVisualPreview() {
  await previews?.close();
  previews = undefined;
}
export async function visualHttp(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  method: string,
) {
  const versions = path.match(/^\/bots\/([^/]+)\/versions(?:\/([^/]+))?$/);
  const feedback = path.match(
    /^\/matches\/([^/]+)\/seats\/([^/]+)\/visual-feedback$/,
  );
  if (
    !["/bots/visual", "/bots/preview"].includes(path) &&
    !versions &&
    !feedback
  )
    return false;
  if (!config.FEATURE_VISUAL_BOTS) throw new RuleError("NOT_FOUND");
  if (path === "/bots/preview" && method === "POST") {
    const data = z
      .object({
        controllerEpoch: z.number().int().nonnegative(),
        workspace: z.unknown(),
        observation: z.unknown(),
        previous: z.unknown().optional(),
      })
      .strict()
      .parse(await body(req, 131072));
    const p = await authenticate(req);
    rateLimit("visual-preview:" + p.ownerId, 2);
    if (pending.has(p.ownerId))
      throw new RuleError("BOT_BUSY", "A preview is already running");
    pending.add(p.ownerId);
    try {
      await transaction((db) => assertController(db, p, data.controllerEpoch));
      const program = compileWorkspace(data.workspace);
      previews ??= new VisualPool({ size: 1, capacity: 4 });
      const outcome = await previews.run({
        program,
        observation: data.observation as Observation,
        previous: data.previous as RuntimeState | undefined,
        deadline: Date.now() + 3000,
      });
      await transaction((db) => assertController(db, p, data.controllerEpoch));
      json(res, 200, { ...outcome, preview: true });
    } finally {
      pending.delete(p.ownerId);
    }
    return true;
  }
  if (path === "/bots/visual" && method === "POST") {
    json(
      res,
      201,
      await resource(
        req,
        await body(req, 131072),
        "visual.create",
        (db, payload, epoch) => publishVisual(req, payload, db, epoch),
      ),
    );
    return true;
  }
  if (versions) {
    const botId = z.string().uuid().parse(versions[1]);
    if (method === "POST" && !versions[2]) {
      json(
        res,
        201,
        await resource(
          req,
          await body(req, 131072),
          "visual.publish:" + botId,
          (db, payload, epoch) => publishVisual(req, payload, db, epoch, botId),
        ),
      );
      return true;
    }
    if (method === "GET" && versions[2]) {
      json(
        res,
        200,
        await visualVersion(
          req,
          botId,
          versions[2] === "latest"
            ? undefined
            : z.string().uuid().parse(versions[2]),
        ),
      );
      return true;
    }
  }
  if (feedback && method === "GET") {
    json(res, 200, {
      decisions: await visualFeedback(
        req,
        z.string().uuid().parse(feedback[1]),
        z.string().max(100).parse(feedback[2]),
      ),
    });
    return true;
  }
  throw new RuleError("NOT_FOUND");
}
