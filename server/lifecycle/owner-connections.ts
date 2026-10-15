import { RuleError } from "../../domain/match/model";
import { increment } from "../observability/metrics";
export class OwnerConnections {
  private counts = new Map<string, number>();
  constructor(private readonly capacity: number) {}
  get activeOwners() {
    return this.counts.size;
  }
  acquire(ownerId: string) {
    const count = this.counts.get(ownerId) ?? 0;
    if (count >= this.capacity) {
      increment("connection.rejected");
      throw new RuleError(
        "SERVICE_UNAVAILABLE",
        "Too many open connections for this owner. Close an older tab or bot connection and retry.",
      );
    }
    this.counts.set(ownerId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = this.counts.get(ownerId)! - 1;
      if (left) this.counts.set(ownerId, left);
      else this.counts.delete(ownerId);
    };
  }
}
