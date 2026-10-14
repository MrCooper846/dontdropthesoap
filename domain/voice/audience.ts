import { distance, TILE } from "../../shared/yard/map";
import type { YardView } from "../../shared/yard/types";
import type { Match } from "../match/model";
export type AudiblePeer = { ownerId: string; gain: number; sameTable: boolean };
export function audience(
  view: YardView,
  matches: Match[],
  ownerId: string,
  blocked: (a: string, b: string) => boolean,
  muteSpectators = false,
): AudiblePeer[] {
  const receiver = view.players.find(
    (p) => p.ownerId === ownerId && p.connected,
  );
  if (!receiver) return [];
  const humanTables = new Map<string, string>();
  for (const m of matches)
    if (!["finished", "cancelled", "aborted"].includes(m.phase))
      for (const s of m.seats)
        if (s.kind === "human" && s.ownerId && !s.abandoned)
          humanTables.set(s.ownerId, m.id);
  const ownTable = humanTables.get(ownerId);
  return view.players
    .filter(
      (p) =>
        p.ownerId !== ownerId && p.connected && !blocked(ownerId, p.ownerId),
    )
    .flatMap((p) => {
      const sameTable = !!ownTable && humanTables.get(p.ownerId) === ownTable;
      if (ownTable && muteSpectators && !sameTable) return [];
      const tiles = distance(receiver, p) / TILE;
      if (!sameTable && tiles > 8) return [];
      return [
        {
          ownerId: p.ownerId,
          sameTable,
          gain: sameTable || tiles <= 3 ? 1 : Math.max(0, (8 - tiles) / 5),
        },
      ];
    });
}
