import { accessSync, constants } from "node:fs";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import {
  validateProgram,
  valueKind,
  bytes,
  ProgramError,
  LIMITS,
  type Program,
} from "../../domain/bots/program";
import type {
  Observation,
  RuntimeState,
  Outcome,
} from "../../domain/bots/interpreter";
export type VisualTask = {
  program: Program;
  observation: Observation;
  previous?: RuntimeState;
  deadline?: number;
};
type Job = {
  id: string;
  input: VisualTask;
  resolve: (v: Outcome) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};
type Slot = {
  worker: Worker;
  ready: boolean;
  dead: boolean;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
};
function validOutcome(value: unknown, program: Program): value is Outcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Outcome;
  if (
    Object.keys(r).sort().join(",") !== "memory,move,rngState,steps,trace" ||
    !["C", "D"].includes(r.move) ||
    !Number.isInteger(r.steps) ||
    r.steps < 1 ||
    r.steps > LIMITS.steps ||
    !Number.isInteger(r.rngState) ||
    r.rngState < 1 ||
    r.rngState > 0xffffffff ||
    !Array.isArray(r.trace) ||
    r.trace.length > LIMITS.trace ||
    r.trace.some((t) => typeof t !== "string" || t.length > 128) ||
    !r.memory ||
    typeof r.memory !== "object" ||
    Array.isArray(r.memory)
  )
    return false;
  if (Object.keys(r.memory).length !== Object.keys(program.memory).length)
    return false;
  try {
    for (const name of Object.keys(program.memory))
      if (
        !Object.hasOwn(r.memory, name) ||
        valueKind(r.memory[name]) !== valueKind(program.memory[name])
      )
        return false;
    return bytes(r.memory) <= LIMITS.memoryBytes;
  } catch {
    return false;
  }
}
export class VisualPool {
  private slots = new Set<Slot>();
  private jobs: Job[] = [];
  private closed = false;
  private restarts: number[] = [];
  constructor(
    private options: {
      size?: number;
      capacity?: number;
      executionMs?: number;
      startupMs?: number;
      workerURL?: URL;
    } = {},
  ) {
    const size = options.size ?? 2,
      capacity = options.capacity ?? 32;
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 4 ||
      !Number.isInteger(capacity) ||
      capacity < size ||
      capacity > 128
    )
      throw new Error("Invalid visual pool limits");
    const workerURL =
      this.options.workerURL ??
      new URL("../../dist/workers/visual-worker.mjs", import.meta.url);
    if (workerURL.protocol !== "file:")
      throw new Error("Visual worker must be a trusted local artifact");
    accessSync(workerURL, constants.R_OK);
    for (let i = 0; i < size; i++) this.spawn();
  }
  private spawn() {
    if (this.closed) return;
    const slot: Slot = {
      worker: new Worker(
        this.options.workerURL ??
          new URL("../../dist/workers/visual-worker.mjs", import.meta.url),
        {
          execArgv: [],
          resourceLimits: {
            maxOldGenerationSizeMb: 64,
            maxYoungGenerationSizeMb: 16,
            stackSizeMb: 4,
          },
        },
      ),
      ready: false,
      dead: false,
    };
    this.slots.add(slot);
    slot.timer = setTimeout(
      () =>
        this.lost(
          slot,
          new ProgramError("WORKER_UNAVAILABLE", "Worker startup timed out"),
        ),
      this.options.startupMs ?? 5000,
    );
    slot.worker.on("message", (message) => {
      if (slot.dead) return;
      if (!slot.ready) {
        if (message?.type !== "ready") {
          this.lost(
            slot,
            new ProgramError("BOT_ERROR", "Invalid worker startup"),
          );
          return;
        }
        clearTimeout(slot.timer);
        slot.ready = true;
        this.pump();
        return;
      }
      const job = slot.job;
      if (!job || message?.id !== job.id) {
        this.lost(
          slot,
          new ProgramError("BOT_ERROR", "Invalid worker response"),
        );
        return;
      }
      clearTimeout(slot.timer);
      slot.job = undefined;
      clearTimeout(job.timer);
      if (Date.now() > (job.input.deadline ?? Infinity))
        job.reject(
          new ProgramError(
            "DECISION_EXPIRED",
            "Late worker decision discarded",
          ),
        );
      else if (message.ok && validOutcome(message.result, job.input.program))
        job.resolve(message.result);
      else {
        job.reject(
          new ProgramError(
            typeof message.error?.code === "string"
              ? message.error.code
              : "BOT_ERROR",
            "Visual decision failed",
          ),
        );
        if (message.ok) {
          this.lost(
            slot,
            new ProgramError("BOT_ERROR", "Malformed worker output"),
          );
          return;
        }
      }
      this.pump();
    });
    slot.worker.on("error", () =>
      this.lost(slot, new ProgramError("BOT_ERROR", "Worker failed")),
    );
    slot.worker.on("exit", () =>
      this.lost(slot, new ProgramError("BOT_ERROR", "Worker exited")),
    );
  }
  run(input: VisualTask): Promise<Outcome> {
    if (this.closed)
      return Promise.reject(
        new ProgramError("WORKER_UNAVAILABLE", "Visual workers unavailable"),
      );
    if (
      this.jobs.length + [...this.slots].filter((s) => s.job).length >=
      (this.options.capacity ?? 32)
    )
      return Promise.reject(
        new ProgramError("BOT_BUSY", "Visual worker queue is full"),
      );
    let safe: VisualTask;
    try {
      const program = validateProgram(input.program);
      if (
        bytes({ observation: input.observation, previous: input.previous }) >
        16384
      )
        throw new ProgramError("PROGRAM_LIMIT", "Decision input exceeds limit");
      safe = structuredClone({ ...input, program });
      if (
        safe.deadline !== undefined &&
        (!Number.isFinite(safe.deadline) || safe.deadline <= Date.now())
      )
        throw new ProgramError("DECISION_EXPIRED", "Decision deadline passed");
    } catch (e) {
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) => {
      const job: Job = { id: randomUUID(), input: safe, resolve, reject };
      if (safe.deadline !== undefined)
        job.timer = setTimeout(
          () => {
            const index = this.jobs.indexOf(job);
            if (index >= 0) {
              this.jobs.splice(index, 1);
              job.reject(
                new ProgramError("DECISION_EXPIRED", "Queued decision expired"),
              );
              return;
            }
            const slot = [...this.slots].find((s) => s.job === job);
            if (slot)
              this.lost(
                slot,
                new ProgramError("DECISION_EXPIRED", "Active decision expired"),
              );
          },
          Math.min(2147483647, safe.deadline - Date.now()),
        );
      this.jobs.push(job);
      this.pump();
    });
  }
  private pump() {
    for (const slot of this.slots) {
      if (slot.dead || !slot.ready || slot.job) continue;
      let job = this.jobs.shift();
      if (!job) return;
      while (job && Date.now() > (job.input.deadline ?? Infinity)) {
        clearTimeout(job.timer);
        job.reject(
          new ProgramError("DECISION_EXPIRED", "Queued decision expired"),
        );
        job = this.jobs.shift();
      }
      if (!job) return;
      slot.job = job;
      slot.timer = setTimeout(
        () =>
          this.lost(
            slot,
            new ProgramError(
              "WORKER_TIMEOUT",
              "Visual decision worker exceeded its deadline",
            ),
          ),
        this.options.executionMs ?? 100,
      );
      try {
        slot.worker.postMessage({ id: job.id, input: job.input });
      } catch {
        this.lost(
          slot,
          new ProgramError("BOT_ERROR", "Worker dispatch failed"),
        );
      }
    }
  }
  private lost(slot: Slot, error: Error) {
    if (slot.dead) return;
    slot.dead = true;
    clearTimeout(slot.timer);
    this.slots.delete(slot);
    if (slot.job) {
      clearTimeout(slot.job.timer);
      slot.job.reject(error);
      slot.job = undefined;
    }
    void slot.worker.terminate();
    if (this.closed) return;
    this.restarts = this.restarts.filter((t) => Date.now() - t < 60000);
    this.restarts.push(Date.now());
    if (this.restarts.length > 4) {
      void this.close();
      return;
    }
    this.spawn();
    this.pump();
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    const error = new ProgramError(
      "WORKER_UNAVAILABLE",
      "Visual workers closed",
    );
    for (const job of this.jobs) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.jobs = [];
    const terminating: Promise<number>[] = [];
    for (const slot of this.slots) {
      slot.dead = true;
      clearTimeout(slot.timer);
      if (slot.job) {
        clearTimeout(slot.job.timer);
        slot.job.reject(error);
      }
      terminating.push(slot.worker.terminate());
    }
    this.slots.clear();
    await Promise.allSettled(terminating);
  }
}
