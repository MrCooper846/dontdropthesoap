import { RuleError } from "../../domain/match/model";
// Preserve wire order across database/native-worker awaits, with a bounded backlog.
export class VoiceQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  constructor(private limit = 16) {}
  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.pending >= this.limit)
      return Promise.reject(new RuleError("RATE_LIMITED"));
    this.pending++;
    const task = this.tail.then(work).finally(() => {
      this.pending--;
    });
    this.tail = task.catch(() => {});
    return task;
  }
}
