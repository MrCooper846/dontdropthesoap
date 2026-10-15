import { RuleError } from "../../domain/match/model";
// Expired entries can be reclaimed, but a live limiter/controller is never
// silently evicted to admit a different identity.
export class ExpiringMap<T> {
  private values = new Map<string, { value: T; until: number }>();
  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly now = () => performance.now(),
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0
    )
      throw Error("Invalid ephemeral storage bounds");
  }
  get size() {
    return this.values.size;
  }
  get(key: string): T | undefined {
    const item = this.values.get(key);
    if (!item) return undefined;
    if (this.now() >= item.until) {
      this.values.delete(key);
      return undefined;
    }
    return item.value;
  }
  set(key: string, value: T) {
    if (!this.values.has(key) && this.values.size >= this.capacity) {
      this.prune();
      if (this.values.size >= this.capacity)
        throw new RuleError(
          "SERVICE_UNAVAILABLE",
          "Temporary service capacity is full. Please retry.",
        );
    }
    this.values.set(key, { value, until: this.now() + this.ttlMs });
  }
  delete(key: string) {
    return this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  prune() {
    const now = this.now();
    for (const [key, item] of this.values)
      if (now >= item.until) this.values.delete(key);
  }
  *[Symbol.iterator](): IterableIterator<[string, T]> {
    this.prune();
    for (const [key, item] of this.values) yield [key, item.value];
  }
}
