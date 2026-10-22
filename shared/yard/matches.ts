import type { Phase, Seat } from "../../domain/match/model";
export type OwnedMatch = {
  id: string;
  circleId: string | null;
  phase: Phase;
  round: number;
  seatId: string;
  name: string;
  kind: Seat["kind"];
  score: number;
  abandoned: boolean;
  createdAt: string;
};
export const isActiveMatch = (phase: Phase) =>
  ["waiting", "countdown", "collecting", "revealing"].includes(phase);
export function preferredOwnedMatch(matches: OwnedMatch[], current: string) {
  const active = matches.filter((m) => isActiveMatch(m.phase) && !m.abandoned);
  // Human decisions need the dock even when this owner is also fielding a bot.
  return (
    active.find((m) => m.kind === "human") ??
    active.find((m) => m.id === current) ??
    active[0] ??
    matches[0]
  );
}
export function matchSettingsError(
  rounds: number,
  seconds: number,
  seats: number,
) {
  const errors = [];
  if (!Number.isInteger(rounds) || rounds < 5 || rounds > 50)
    errors.push("Rounds must be a whole number from 5 to 50.");
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60)
    errors.push("Decision seconds must be a whole number from 5 to 60.");
  if (!Number.isInteger(seats) || seats < 2 || seats > 8)
    errors.push("Seats must be a whole number from 2 to 8.");
  return errors.join(" ");
}
