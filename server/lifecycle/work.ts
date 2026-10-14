import { RuleError } from "../../domain/match/model";
export class WorkDrain {
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
    let result: Promise<T>;
    try {
      result = Promise.resolve(work());
    } catch (error) {
      result = Promise.reject(error);
    }
    const task = result.finally(() => this.pending.delete(task));
    this.pending.add(task);
    return task;
  }
  async wait() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
export const serviceWork = new WorkDrain();
