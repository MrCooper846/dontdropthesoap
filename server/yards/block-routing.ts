import { RuleError } from "../../domain/match/model";
export type BlockEdge = { owner_id: string; blocked_owner_id: string };
export class BlockRouting {
  private revision = 0;
  private members = new Set<string>();
  private edges = new Set<string>();
  constructor(private readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw Error("Invalid routing capacity");
  }
  get size() {
    return this.edges.size;
  }
  invalidate() {
    this.revision++;
    this.members.clear();
    this.edges.clear();
  }
  blocked(a: string, b: string) {
    if (a === b) return false;
    return (
      !this.members.has(a) ||
      !this.members.has(b) ||
      this.edges.has(a + ":" + b) ||
      this.edges.has(b + ":" + a)
    );
  }
  async refresh(ids: string[], read: (ids: string[]) => Promise<BlockEdge[]>) {
    const version = ++this.revision,
      members = new Set(ids);
    if (members.size > this.capacity) {
      this.invalidate();
      throw new RuleError(
        "SERVICE_UNAVAILABLE",
        "Routing state is unavailable",
      );
    }
    try {
      const rows = await read([...members]);
      if (version !== this.revision) return;
      const edges = new Set<string>();
      for (const row of rows)
        if (members.has(row.owner_id) && members.has(row.blocked_owner_id))
          edges.add(row.owner_id + ":" + row.blocked_owner_id);
      this.members = members;
      this.edges = edges;
    } catch (error) {
      if (version === this.revision) this.invalidate();
      throw error;
    }
  }
}
