import {
  type Match,
  type Move,
  type Settings,
  type Seat,
  type Mode,
  type Result,
  RuleError,
} from "./model";
export const defaults: Settings = {
  rounds: 10,
  decisionMs: 20000,
  revealMs: 5000,
  maxSeats: 8,
};
export function createMatch(
  id: string,
  hostOwnerId: string,
  mode: Mode,
  settings: Settings,
  now: number,
  seed: number,
  circleId: string | null = null,
): Match {
  return {
    id,
    hostOwnerId,
    mode,
    settings: {
      ...settings,
      ...(mode === "challenge" || mode === "league" ? { maxSeats: 2 } : {}),
    },
    circleId,
    rulesetVersion: 1,
    phase: "waiting",
    version: 0,
    round: 0,
    deadline: null,
    seats: [],
    pairs: [],
    moves: {},
    results: [],
    rngState: seed >>> 0 || 1,
    clankerMemory: "C",
    interruptions: 0,
    createdAt: now,
  };
}
export function addSeat(m: Match, seat: Seat) {
  if (m.phase !== "waiting") throw new RuleError("WRONG_PHASE");
  if (
    m.seats.length >= m.settings.maxSeats ||
    ((m.mode === "challenge" || m.mode === "league") && m.seats.length >= 2)
  )
    throw new RuleError("CAPACITY_FULL");
  if (
    m.seats.some(
      (s) => s.id === seat.id || (s.ownerId && s.ownerId === seat.ownerId),
    )
  )
    throw new RuleError("ALREADY_SEATED");
  if (m.mode === "human" && seat.kind !== "human")
    throw new RuleError("FORBIDDEN");
  if (m.mode === "league" && seat.kind === "human")
    throw new RuleError("FORBIDDEN");
  m.seats.push({ ...seat });
  clearReadiness(m);
  m.version++;
}
export function makeSeat(
  id: string,
  ownerId: string | null,
  name: string,
  kind: Seat["kind"] = "human",
  botId: string | null = null,
  botVersionId: string | null = null,
): Seat {
  return {
    id,
    ownerId,
    name,
    ownerName: kind === "human" ? name : null,
    kind,
    botId,
    botVersionId,
    ready: false,
    abandoned: false,
    score: 0,
    cooperations: 0,
    timeouts: 0,
  };
}
function clearReadiness(m: Match) {
  for (const s of m.seats) s.ready = false;
}
export function configure(m: Match, settings: Settings) {
  if (m.phase !== "waiting") throw new RuleError("WRONG_PHASE");
  if (settings.maxSeats < m.seats.length) throw new RuleError("CAPACITY_FULL");
  m.settings = {
    ...settings,
    ...(m.mode === "challenge" || m.mode === "league" ? { maxSeats: 2 } : {}),
  };
  clearReadiness(m);
  m.version++;
}
export function ready(m: Match, seatId: string, value: boolean) {
  if (m.phase !== "waiting") throw new RuleError("WRONG_PHASE");
  const seat = m.seats.find((s) => s.id === seatId);
  if (!seat) throw new RuleError("NOT_FOUND");
  seat.ready = value;
  m.version++;
}
export function requestStart(m: Match, now: number) {
  if (m.phase !== "waiting") throw new RuleError("WRONG_PHASE");
  if (m.seats.length < 2 || m.seats.some((s) => !s.ready))
    throw new RuleError("NOT_READY");
  m.phase = "countdown";
  m.deadline = now + 3000;
  m.version++;
}
export function leave(m: Match, seatId: string) {
  const seat = m.seats.find((s) => s.id === seatId);
  if (!seat) throw new RuleError("NOT_FOUND");
  if (m.phase === "waiting" || m.phase === "countdown") {
    m.seats = m.seats.filter((s) => s.id !== seatId);
    m.phase = m.seats.length ? "waiting" : "cancelled";
    m.deadline = null;
    clearReadiness(m);
    if (seat.ownerId === m.hostOwnerId)
      m.hostOwnerId = m.seats[0]?.ownerId ?? m.hostOwnerId;
  } else {
    seat.abandoned = true;
  }
  m.version++;
}
function random(m: Match) {
  let s = m.rngState;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  m.rngState = s >>> 0;
  return m.rngState / 4294967296;
}
function beginRound(m: Match, now: number) {
  m.round++;
  m.phase = "collecting";
  m.deadline = now + m.settings.decisionMs;
  m.moves = {};
  const seats = [...m.seats];
  if (m.mode === "human" || m.mode === "mixed") {
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(random(m) * (i + 1));
      [seats[i], seats[j]] = [seats[j], seats[i]];
    }
  }
  m.pairs = [];
  for (let i = 0; i < seats.length; i += 2)
    m.pairs.push({
      id: m.id + ":" + m.round + ":" + i,
      a: seats[i].id,
      b: seats[i + 1].id,
    });
  for (const s of seats)
    if (s.kind === "system")
      m.moves[s.id] = {
        move: m.clankerMemory,
        source: "system",
        acceptedAt: now,
      };
  m.version++;
}
export function submit(
  m: Match,
  seatId: string,
  round: number,
  move: Move,
  now: number,
) {
  if (round !== m.round) throw new RuleError("ROUND_MISMATCH");
  if (m.phase !== "collecting") throw new RuleError("WRONG_PHASE");
  if (m.deadline === null || now >= m.deadline)
    throw new RuleError("DEADLINE_PASSED");
  const seat = m.seats.find((s) => s.id === seatId);
  if (!seat || seat.kind === "system" || seat.abandoned)
    throw new RuleError("FORBIDDEN");
  if (m.moves[seatId]) throw new RuleError("MOVE_LOCKED");
  m.moves[seatId] = {
    move,
    source: seat.kind === "human" ? "player" : "bot",
    acceptedAt: now,
  };
  m.version++;
  if (m.seats.every((s) => m.moves[s.id])) resolve(m, now);
}
export function payoff(a: Move, b: Move): [number, number] {
  if (a === "C" && b === "C") return [1, 1];
  if (a === "C" && b === "D") return [-2, 3];
  if (a === "D" && b === "C") return [3, -2];
  return [-1, -1];
}
function resolve(m: Match, now: number) {
  if (m.phase !== "collecting") return;
  for (const s of m.seats) {
    if (!m.moves[s.id]) {
      m.moves[s.id] = { move: "C", source: "timeout", acceptedAt: now };
      s.timeouts++;
    }
  }
  for (const p of m.pairs) {
    const a = m.seats.find((s) => s.id === p.a)!,
      b = m.seats.find((s) => s.id === p.b)!;
    const am = m.moves[p.a].move,
      bm = m.moves[p.b].move;
    const [an, bn] = payoff(am, bm);
    a.score += an;
    b.score += bn;
    if (am === "C") a.cooperations++;
    if (bm === "C") b.cooperations++;
    if (a.kind === "system") m.clankerMemory = bm;
    if (b.kind === "system") m.clankerMemory = am;
    const message =
      am === bm
        ? am === "C"
          ? "Rare peace treaty. Everyone leaves with seasoning."
          : "Mutual financial ruin. One sad noodle rebate."
        : "Noodle heist. Trust has been converted into seasoning.";
    const result: Result = {
      pairId: p.id,
      round: m.round,
      a: p.a,
      b: p.b,
      aMove: am,
      bMove: bm,
      aNet: an,
      bNet: bn,
      message,
    };
    m.results.push(result);
  }
  m.phase = "revealing";
  m.deadline = now + m.settings.revealMs;
  m.version++;
}
export function advance(m: Match, now: number) {
  if (m.deadline === null || now < m.deadline) return false;
  if (m.phase === "countdown") {
    if (m.seats.length % 2 === 1)
      m.seats.push(makeSeat(m.id + ":clanker", null, "The Clanker", "system"));
    beginRound(m, now);
    return true;
  }
  if (m.phase === "collecting") {
    resolve(m, now);
    return true;
  }
  if (m.phase === "revealing") {
    if (m.round >= m.settings.rounds) {
      m.phase = "finished";
      m.deadline = null;
      m.version++;
    } else beginRound(m, now);
    return true;
  }
  return false;
}
export function recover(m: Match, now: number) {
  if (["finished", "cancelled", "aborted"].includes(m.phase)) return false;
  if (m.phase === "waiting" || m.phase === "countdown") {
    m.phase = "waiting";
    m.deadline = null;
    clearReadiness(m);
    m.version++;
    return true;
  }
  m.interruptions++;
  if (m.interruptions > 1) {
    m.phase = "aborted";
    m.deadline = null;
  } else
    m.deadline =
      now + (m.phase === "collecting" ? m.settings.decisionMs : 5000);
  m.version++;
  return true;
}
export function project(
  m: Match,
  ownerId: string | null,
  botId: string | null = null,
) {
  const ownSeat = m.seats.find((s) =>
    botId ? s.botId === botId : s.ownerId !== null && s.ownerId === ownerId,
  );
  const visible = m.results.some((result) => result.round === m.round);
  return {
    id: m.id,
    circleId: m.circleId,
    hostOwnerId: m.hostOwnerId,
    mode: m.mode,
    rulesetVersion: m.rulesetVersion,
    settings: { ...m.settings },
    phase: m.phase,
    version: m.version,
    round: m.round,
    deadline: m.deadline,
    serverTime: Date.now(),
    interruptions: m.interruptions,
    abortReason: m.abortReason ?? null,
    cancelReason: m.cancelReason ?? null,
    historyExpired: m.historyExpired ?? false,
    seats: m.seats.map((s) => ({
      id: s.id,
      ownerId: s.ownerId,
      botId: s.botId,
      botVersionId: s.botVersionId,
      botError: s.botErrorRound === m.round,
      name: s.name,
      ownerName: s.ownerName ?? (s.kind === "human" ? s.name : null),
      kind: s.kind,
      ready: s.ready,
      abandoned: s.abandoned,
      score: s.score,
      cooperations: s.cooperations,
      timeouts: s.timeouts,
    })),
    pairs: m.pairs.map((p) => ({ ...p })),
    lockedCount: Object.keys(m.moves).length,
    ownSeatId: ownSeat?.id ?? null,
    ownMove: ownSeat ? (m.moves[ownSeat.id]?.move ?? null) : null,
    results: m.results.map((r) => ({ ...r })),
    ...(visible
      ? {
          revealedMoves: Object.fromEntries(
            Object.entries(m.moves).map(([id, d]) => [id, d.move]),
          ),
        }
      : {}),
  };
}
