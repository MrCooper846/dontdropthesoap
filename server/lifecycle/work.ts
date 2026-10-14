import { config } from "../config";
import { increment } from "../observability/metrics";
import { RuleError } from "../../domain/match/model";
export class WorkDrain {
  constructor(private readonly capacity = 256) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error("Invalid work capacity");
  }
  private closing = false;
  private pending = new Set<Promise<unknown>>();
  get draining() {
    return this.closing;
  }
  get pendingCount() {
    return this.pending.size;
  }
  begin() {
    this.closing = true;
  }
  run<T>(work: () => T | Promise<T>): Promise<T> {
    if (this.closing)
      return Promise.reject(
        new RuleError(
          "SERVICE_UNAVAILABLE",
          "Service restarting. Please retry.",
        ),
      );
    if (this.pending.size >= this.capacity) {
      increment("work.overload");
      return Promise.reject(
        new RuleError("SERVICE_UNAVAILABLE", "Service is busy. Please retry."),
      );
    }
    // Reserve capacity before executing user work, including reentrant arrivals.
    const task = Promise.resolve()
      .then(work)
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    return task;
  }
  async wait() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
export const serviceWork = new WorkDrain(config.MAX_PENDING_WORK);
