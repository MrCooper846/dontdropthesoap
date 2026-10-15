import { AsyncLocalStorage } from "node:async_hooks";
import { RuleError } from "../../domain/match/model";
import { increment } from "../observability/metrics";
type Scope = { pool: OwnerAdmission; ownerId?: string; closed: boolean };
const current = new AsyncLocalStorage<Scope>();
export function bindOwnerWork(ownerId: string) {
  const scope = current.getStore();
  if (scope && !scope.closed) scope.pool.bind(scope, ownerId);
}
export class OwnerAdmission {
  private counts = new Map<string, number>();
  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw Error("Invalid owner work capacity");
  }
  get activeOwners() {
    return this.counts.size;
  }
  bind(scope: Scope, ownerId: string) {
    if (scope.ownerId === ownerId) return;
    if (scope.ownerId)
      throw new RuleError(
        "FORBIDDEN",
        "Request authority cannot change owners",
      );
    const count = this.counts.get(ownerId) ?? 0;
    if (count >= this.capacity) {
      increment("work.overload");
      throw new RuleError(
        "SERVICE_UNAVAILABLE",
        "Too much work is pending for this owner. Please retry.",
      );
    }
    this.counts.set(ownerId, count + 1);
    scope.ownerId = ownerId;
  }
  scope<T>(work: () => T | Promise<T>, ownerId?: string): Promise<T> {
    const scope: Scope = { pool: this, closed: false };
    return current.run(scope, async () => {
      try {
        if (ownerId) bindOwnerWork(ownerId);
        return await work();
      } finally {
        scope.closed = true;
        if (scope.ownerId) {
          const count = this.counts.get(scope.ownerId)! - 1;
          if (count) this.counts.set(scope.ownerId, count);
          else this.counts.delete(scope.ownerId);
        }
      }
    });
  }
}
