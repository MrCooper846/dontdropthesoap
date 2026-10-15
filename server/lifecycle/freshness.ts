// Local authority lifetimes use elapsed monotonic time, never the wall clock.
export class FreshnessLease {
  private checkedAt: number | undefined;
  constructor(
    private readonly ttlMs: number,
    private readonly now = () => performance.now(),
  ) {}
  get ageMs() {
    return this.checkedAt === undefined ? null : this.now() - this.checkedAt;
  }
  get fresh() {
    const age = this.ageMs;
    return age !== null && age >= 0 && age < this.ttlMs;
  }
  confirm(startedAt = this.now()) {
    this.checkedAt = startedAt;
  }
  invalidate() {
    this.checkedAt = undefined;
  }
}
