import type { Award, Lobby, Move, Pairing, Player, PlayerStats, RoundResult } from "./types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROUND_DURATION_MS = 20_000;

export function createEmptyStats(): PlayerStats {
  return {
    cooperations: 0,
    defections: 0,
    betrayedOthers: 0,
    gotBetrayed: 0,
    mutualCooperations: 0,
    mutualDefections: 0,
    clankerEncounters: 0,
    clankerBetrayals: 0,
    clankerTherapy: 0
  };
}

export function generateLobbyCode(existingCodes: Set<string>) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error("Could not generate a lobby code.");
}

export function makePlayer(playerId: string, socketId: string, nickname: string, isHost: boolean): Player {
  return {
    playerId,
    socketId,
    nickname,
    isHost,
    connected: true,
    score: 0,
    stats: createEmptyStats()
  };
}

export function makeLobby(code: string, host: Player, totalRounds: number, maxPlayers: number): Lobby {
  return {
    code,
    hostPlayerId: host.playerId,
    status: "waiting",
    maxPlayers,
    totalRounds,
    currentRound: 0,
    roundEndsAt: null,
    players: [host],
    pairings: [],
    resultsHistory: [],
    botState: { lastHumanMoveAgainstBot: null },
    createdAt: Date.now()
  };
}

export function startRound(lobby: Lobby) {
  lobby.currentRound += 1;
  lobby.status = "in_round";
  lobby.roundEndsAt = Date.now() + ROUND_DURATION_MS;
  lobby.pairings = makePairings(lobby.players);
}

export function resetLobbyForReplay(lobby: Lobby) {
  lobby.status = "waiting";
  lobby.currentRound = 0;
  lobby.roundEndsAt = null;
  lobby.pairings = [];
  lobby.resultsHistory = [];
  lobby.botState = { lastHumanMoveAgainstBot: null };
  lobby.createdAt = Date.now();

  for (const player of lobby.players) {
    player.score = 0;
    player.stats = createEmptyStats();
  }
}

function makePairings(players: Player[]): Pairing[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const pairings: Pairing[] = [];

  for (let i = 0; i < shuffled.length; i += 2) {
    const a = shuffled[i];
    const b = shuffled[i + 1];
    pairings.push({
      id: `${Date.now()}-${i}-${a.playerId}`,
      aPlayerId: a.playerId,
      bPlayerId: b?.playerId ?? "BOT",
      moves: {}
    });
  }

  return pairings;
}

export function allMovesSubmitted(lobby: Lobby) {
  return lobby.pairings.every((pairing) => {
    const aMoved = Boolean(pairing.moves[pairing.aPlayerId]);
    if (pairing.bPlayerId === "BOT") return aMoved;
    return aMoved && Boolean(pairing.moves[pairing.bPlayerId]);
  });
}

export function autoCooperateMissingMoves(lobby: Lobby) {
  for (const pairing of lobby.pairings) {
    pairing.moves[pairing.aPlayerId] ??= "C";
    if (pairing.bPlayerId !== "BOT") {
      pairing.moves[pairing.bPlayerId] ??= "C";
    }
  }
}

export function revealRound(lobby: Lobby) {
  if (lobby.status !== "in_round") return;

  lobby.status = "revealing";
  lobby.roundEndsAt = null;
  const results: RoundResult[] = [];

  for (const pairing of lobby.pairings) {
    const a = findPlayer(lobby, pairing.aPlayerId);
    const b = pairing.bPlayerId === "BOT" ? null : findPlayer(lobby, pairing.bPlayerId);
    if (!a) continue;

    const aMove = pairing.moves[a.playerId];
    const botMove = pairing.bPlayerId === "BOT" ? lobby.botState.lastHumanMoveAgainstBot ?? "C" : undefined;
    const bMove = b ? pairing.moves[b.playerId] : botMove;
    if (!aMove || !bMove) continue;

    pairing.botMove = botMove;

    const [aPoints, bPoints] = payoff(aMove, bMove);
    applyScoreAndStats(a, aMove, bMove, aPoints, b === null);
    a.score += aPoints;

    if (b) {
      applyScoreAndStats(b, bMove, aMove, bPoints, false);
      b.score += bPoints;
    } else {
      a.stats.clankerEncounters += 1;
      if (aMove === "D" && bMove === "C") a.stats.clankerBetrayals += 1;
      if (lobby.botState.lastHumanMoveAgainstBot === "D" && aMove === "C") a.stats.clankerTherapy += 1;
    }

    results.push({
      pairingId: pairing.id,
      round: lobby.currentRound,
      aPlayerId: a.playerId,
      aName: a.nickname,
      bPlayerId: b?.playerId ?? "BOT",
      bName: b?.nickname ?? "The Clanker",
      aMove,
      bMove,
      aPoints,
      bPoints,
      message: resultMessage(a.nickname, b?.nickname ?? "The Clanker", aMove, bMove, b === null, lobby.botState.lastHumanMoveAgainstBot)
    });

    if (!b) lobby.botState.lastHumanMoveAgainstBot = aMove;
  }

  lobby.resultsHistory.push(...results);
  lobby.status = lobby.currentRound >= lobby.totalRounds ? "finished" : "between_rounds";
}

function payoff(aMove: Move, bMove: Move): [number, number] {
  if (aMove === "C" && bMove === "C") return [3, 3];
  if (aMove === "C" && bMove === "D") return [0, 5];
  if (aMove === "D" && bMove === "C") return [5, 0];
  return [1, 1];
}

function applyScoreAndStats(player: Player, ownMove: Move, otherMove: Move, _points: number, againstBot: boolean) {
  if (ownMove === "C") player.stats.cooperations += 1;
  if (ownMove === "D") player.stats.defections += 1;
  if (ownMove === "D" && otherMove === "C" && !againstBot) player.stats.betrayedOthers += 1;
  if (ownMove === "C" && otherMove === "D") player.stats.gotBetrayed += 1;
  if (ownMove === "C" && otherMove === "C") player.stats.mutualCooperations += 1;
  if (ownMove === "D" && otherMove === "D") player.stats.mutualDefections += 1;
}

function resultMessage(a: string, b: string, aMove: Move, bMove: Move, hasBot: boolean, previousBotMemory: Move | null) {
  if (hasBot) {
    if (aMove === "D" && bMove === "C") return pick([
      `${a} betrayed The Clanker. The machine remembers.`,
      `${a} mugged off The Clanker. This will become everyone's problem.`,
      `${a} chose profit over peace. The Clanker updated its grudge file.`
    ]);
    if (aMove === "C" && bMove === "D") return previousBotMemory === "D"
      ? pick([
        `${a} tried to make peace, but The Clanker was already angry.`,
        `${a} offered friendship. The Clanker offered consequences.`,
        `${a} walked into someone else's revenge arc.`
      ])
      : `The Clanker got revenge. Someone else caused this.`;
    if (aMove === "C" && bMove === "C" && previousBotMemory === "D") return pick([
      `${a} took the hit and restored peace.`,
      `${a} absorbed the bad vibes and calmed the machine.`,
      `${a} made The Clanker believe in society again.`
    ]);
    if (aMove === "C" && bMove === "C") return pick([
      `${a} and The Clanker cooperated. For now, the machine is chill.`,
      `${a} and The Clanker had a rare peaceful transaction.`,
      `${a} kept things civil with The Clanker.`
    ]);
    return pick([
      `${a} and The Clanker both chose violence.`,
      `${a} and The Clanker achieved mutual disappointment.`,
      `${a} and The Clanker delivered scraps all round.`
    ]);
  }

  if (aMove === "D" && bMove === "C") return pick([
    `${a} betrayed ${b}. Absolute snake behaviour.`,
    `${a} sold out ${b} with frightening confidence.`,
    `${a} saw trust and turned it into points.`
  ]);
  if (aMove === "C" && bMove === "D") return pick([
    `${b} betrayed ${a}. Absolute snake behaviour.`,
    `${b} cashed in on ${a}'s optimism.`,
    `${a} trusted. ${b} chose the spreadsheet.`
  ]);
  if (aMove === "C" && bMove === "C") return pick([
    `${a} and ${b} cooperated. Rare moment of trust.`,
    `${a} and ${b} were weirdly wholesome.`,
    `${a} and ${b} proved society can limp forward.`
  ]);
  return pick([
    `${a} and ${b} both chose violence.`,
    `${a} and ${b} trusted absolutely nobody.`,
    `${a} and ${b} stared into the abyss and got one point each.`
  ]);
}

function pick(messages: string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}

export function sortedPlayers(lobby: Lobby) {
  return [...lobby.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
}

export function buildAwards(lobby: Lobby): Award[] {
  const ranked = sortedPlayers(lobby);
  const awards: Award[] = [];
  const topBy = (value: (player: Player) => number) => ranked.reduce((best, player) => value(player) > value(best) ? player : best, ranked[0]);
  if (!ranked[0]) return awards;

  awards.push({ title: "Winner", playerName: ranked[0].nickname, detail: `${ranked[0].score} points and a suspicious smile.` });
  awards.push({ title: "Biggest Snake", playerName: topBy((p) => p.stats.betrayedOthers).nickname, detail: "Most betrayals against trusting humans." });
  awards.push({ title: "Most Trusting", playerName: topBy((p) => p.stats.cooperations).nickname, detail: "Pressed Cooperate like friendship was real." });
  awards.push({ title: "Most Betrayed", playerName: topBy((p) => p.stats.gotBetrayed).nickname, detail: "Kept offering peace. Received nonsense." });
  awards.push({ title: "Peacekeeper", playerName: topBy((p) => p.stats.mutualCooperations).nickname, detail: "Most mutual cooperation moments." });
  awards.push({ title: "Menace to Society", playerName: topBy((p) => p.stats.defections).nickname, detail: "Highest defection count." });

  const enemy = topBy((p) => p.stats.clankerBetrayals);
  if (enemy.stats.clankerBetrayals > 0) awards.push({ title: "Clanker's Enemy", playerName: enemy.nickname, detail: "Betrayed The Clanker and made it everyone's problem." });

  const therapist = topBy((p) => p.stats.clankerTherapy);
  if (therapist.stats.clankerTherapy > 0) awards.push({ title: "Clanker's Therapist", playerName: therapist.nickname, detail: "Cooperated with angry machinery." });

  return awards;
}

export function findPlayer(lobby: Lobby, playerId: string) {
  return lobby.players.find((player) => player.playerId === playerId);
}
