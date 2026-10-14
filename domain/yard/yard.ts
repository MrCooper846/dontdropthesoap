import { z } from "zod";
import { randomUUID } from "node:crypto";
import { RuleError } from "../match/model";
import {
  YARD_MAP,
  movePoint,
  distance,
  TICK_MS,
  INPUT_TIMEOUT_MS,
  TILE,
  type Point,
} from "../../shared/yard/map";
export const inputSchema = z
  .object({
    seq: z.number().int().min(0).max(2147483647),
    axisX: z.number().finite().min(-1).max(1),
    axisY: z.number().finite().min(-1).max(1),
  })
  .strict();
type Presence = {
  ownerId: string;
  name: string;
  socketId: string;
  controllerEpoch: number;
  position: Point;
  input: { axisX: number; axisY: number };
  lastInputAt: number;
  processedSeq: number;
  anchor: Point | null;
  disconnectedAt: number | null;
};
export type YardSnapshot = {
  epoch: string;
  tick: number;
  mapVersion: number;
  players: {
    ownerId: string;
    name: string;
    x: number;
    y: number;
    seated: boolean;
    connected: boolean;
    processedSeq: number;
  }[];
};
export class Yard {
  readonly epoch = randomUUID();
  private tickNumber = 0;
  private people = new Map<string, Presence>();
  constructor(readonly capacity = 32) {}
  enter(
    ownerId: string,
    name: string,
    socketId: string,
    controllerEpoch: number,
    now: number,
  ) {
    const existing = this.people.get(ownerId);
    if (existing) {
      if (controllerEpoch < existing.controllerEpoch)
        throw new RuleError("CONTROLLER_STALE");
      existing.disconnectedAt = null;
      existing.socketId = socketId;
      existing.controllerEpoch = controllerEpoch;
      existing.name = name;
      existing.processedSeq = -1;
      existing.input = { axisX: 0, axisY: 0 };
      existing.lastInputAt = now;
      return this.snapshot();
    }
    if (this.people.size >= this.capacity) throw new RuleError("CAPACITY_FULL");
    this.people.set(ownerId, {
      ownerId,
      name,
      socketId,
      controllerEpoch,
      position: { ...YARD_MAP.spawn },
      input: { axisX: 0, axisY: 0 },
      lastInputAt: now,
      processedSeq: -1,
      anchor: null,
      disconnectedAt: null,
    });
    return this.snapshot();
  }
  leave(ownerId: string, socketId?: string) {
    const p = this.people.get(ownerId);
    if (p && (!socketId || socketId === p.socketId))
      this.people.delete(ownerId);
  }
  disconnect(ownerId: string, socketId: string, now: number) {
    const p = this.people.get(ownerId);
    if (p && p.socketId === socketId) {
      p.socketId = "";
      p.disconnectedAt = now;
      p.input = { axisX: 0, axisY: 0 };
    }
  }
  prune(now: number) {
    for (const [id, p] of this.people)
      if (p.disconnectedAt !== null && now - p.disconnectedAt >= 30000)
        this.people.delete(id);
  }
  active(ownerId: string) {
    return !!this.people.get(ownerId)?.socketId;
  }
  has(ownerId: string) {
    return this.people.has(ownerId);
  }
  setController(ownerId: string, epoch: number) {
    const p = this.people.get(ownerId);
    if (p && epoch > p.controllerEpoch) {
      p.controllerEpoch = epoch;
      p.input = { axisX: 0, axisY: 0 };
      p.processedSeq = -1;
    }
  }
  input(
    ownerId: string,
    socketId: string,
    epoch: number,
    value: unknown,
    now: number,
  ) {
    const p = this.people.get(ownerId);
    if (!p) throw new RuleError("NOT_FOUND");
    if (p.socketId !== socketId || p.controllerEpoch !== epoch)
      throw new RuleError("CONTROLLER_STALE");
    const input = inputSchema.parse(value);
    if (input.seq <= p.processedSeq) return false;
    if (input.seq > p.processedSeq + 1000)
      throw new RuleError(
        "INVALID_PAYLOAD",
        "Input sequence jump exceeds budget",
      );
    p.processedSeq = input.seq;
    p.input = { axisX: input.axisX, axisY: input.axisY };
    p.lastInputAt = now;
    return true;
  }
  step(now: number) {
    this.tickNumber++;
    for (const p of this.people.values()) {
      if (p.anchor) {
        p.position = { ...p.anchor };
        continue;
      }
      if (now - p.lastInputAt >= INPUT_TIMEOUT_MS) {
        p.input = { axisX: 0, axisY: 0 };
        continue;
      }
      p.position = movePoint(p.position, p.input.axisX, p.input.axisY, TICK_MS);
    }
    return this.snapshot();
  }
  anchor(ownerId: string, point: Point | null) {
    const p = this.people.get(ownerId);
    if (p) {
      if (
        (!p.anchor && !point) ||
        (p.anchor && point && p.anchor.x === point.x && p.anchor.y === point.y)
      )
        return;
      p.anchor = point ? { ...point } : null;
      p.input = { axisX: 0, axisY: 0 };
    }
  }
  circle(ownerId: string, circleId: string) {
    const p = this.people.get(ownerId),
      c = YARD_MAP.circles.find((c) => c.id === circleId);
    if (!p || !c) throw new RuleError("NOT_FOUND");
    if (distance(p.position, c) > c.radius + TILE)
      throw new RuleError("TOO_FAR", "Move nearer to this circle");
    return { ...c };
  }
  recipients(ownerId: string, blocked: (a: string, b: string) => boolean) {
    const sender = this.people.get(ownerId);
    if (!sender) throw new RuleError("NOT_FOUND");
    return [...this.people.values()]
      .filter(
        (p) =>
          !!p.socketId &&
          distance(sender.position, p.position) <= 8 * TILE &&
          !blocked(ownerId, p.ownerId),
      )
      .map((p) => p.ownerId);
  }
  snapshot(): YardSnapshot {
    return {
      epoch: this.epoch,
      tick: this.tickNumber,
      mapVersion: YARD_MAP.version,
      players: [...this.people.values()].map((p) => ({
        ownerId: p.ownerId,
        name: p.name,
        x: p.position.x,
        y: p.position.y,
        seated: !!p.anchor,
        connected: p.disconnectedAt === null,
        processedSeq: p.processedSeq,
      })),
    };
  }
}
