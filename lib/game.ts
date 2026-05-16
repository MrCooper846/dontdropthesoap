import type { Award, Lobby, Move, Pairing, Player, PlayerStats, RoundResult } from "./types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROUND_DURATION_MS = 20_000;
export const BETWEEN_ROUNDS_DURATION_MS = 20_000;
export const STARTING_NOODLE_PACKS = 50;
export const ROUND_ANTE_NOODLE_PACKS = 2;

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

export function makePlayer(playerId: string, socketId: string, nickname: string, isHost: boolean, score = STARTING_NOODLE_PACKS, balanceReady = true): Player {
  return {
    playerId,
    socketId,
    nickname,
    isHost,
    connected: true,
    score,
    gameStartScore: score,
    balanceReady,
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
    player.gameStartScore = player.score;
    player.stats = createEmptyStats();
  }
}

function makePairings(players: Player[]): Pairing[] {
  const shuffled = shufflePlayers(uniqueConnectedPlayers(players));
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

export function uniqueConnectedPlayers(players: Player[]) {
  const unique = new Map<string, Player>();
  for (const player of players) {
    if (player.connected) unique.set(player.playerId, player);
  }
  return [...unique.values()];
}

export function connectedPlayersReady(players: Player[]) {
  const connected = uniqueConnectedPlayers(players);
  return connected.length >= 2 && connected.every((player) => player.balanceReady);
}

function shufflePlayers(players: Player[]) {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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

    const [aPayout, bPayout] = payoff(aMove, bMove);
    applyScoreAndStats(a, aMove, bMove, aPayout, b === null);
    a.score -= ROUND_ANTE_NOODLE_PACKS;
    a.score += aPayout;

    if (b) {
      applyScoreAndStats(b, bMove, aMove, bPayout, false);
      b.score -= ROUND_ANTE_NOODLE_PACKS;
      b.score += bPayout;
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
      aPoints: aPayout,
      bPoints: bPayout,
      message: resultMessage(a.nickname, b?.nickname ?? "The Clanker", aMove, bMove, b === null, lobby.botState.lastHumanMoveAgainstBot)
    });

    if (!b) lobby.botState.lastHumanMoveAgainstBot = aMove;
  }

  lobby.resultsHistory.push(...results);
  if (lobby.currentRound >= lobby.totalRounds) {
    lobby.status = "finished";
    lobby.roundEndsAt = null;
  } else {
    lobby.status = "between_rounds";
    lobby.roundEndsAt = Date.now() + BETWEEN_ROUNDS_DURATION_MS;
  }
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
      `${a} betrayed The Clanker. The machine remembers, itemises, and charges interest.`,
      `${a} mugged off The Clanker for noodles. This will become everyone's paperwork.`,
      `${a} chose profit over peace. The Clanker updated its grudge spreadsheet.`
    ]);
    if (aMove === "C" && bMove === "D") return previousBotMemory === "D"
      ? pick([
        `${a} tried to make peace, but The Clanker was already angry and weird about receipts.`,
        `${a} offered friendship. The Clanker offered consequences and no refund.`,
        `${a} walked into someone else's revenge arc with exact change.`
      ])
      : `The Clanker got revenge. Someone else caused this, which is legally very funny.`;
    if (aMove === "C" && bMove === "C" && previousBotMemory === "D") return pick([
      `${a} took the hit and restored peace. Heroic, expensive, questionable.`,
      `${a} absorbed the bad vibes and calmed the machine. The noodles were not reimbursed.`,
      `${a} made The Clanker believe in society again. Briefly.`
    ]);
    if (aMove === "C" && bMove === "C") return pick([
      `${a} and The Clanker cooperated. For now, the machine is chill and lightly salted.`,
      `${a} and The Clanker had a rare peaceful noodle transaction.`,
      `${a} kept things civil with The Clanker. The form was stamped.`
    ]);
    return pick([
      `${a} and The Clanker both chose violence. Commissary morale remains low.`,
      `${a} and The Clanker achieved mutual disappointment with a one-pack rebate.`,
      `${a} and The Clanker delivered scraps all round. Nobody is proud.`
    ]);
  }

  if (aMove === "D" && bMove === "C") return pick([
    `${a} betrayed ${b}. Absolute snake behaviour, now with seasoning.`,
    `${a} sold out ${b} with frightening confidence and a tiny profit motive.`,
    `${a} saw trust and converted it into noodle liquidity.`
  ]);
  if (aMove === "C" && bMove === "D") return pick([
    `${b} betrayed ${a}. Absolute snake behaviour, now with seasoning.`,
    `${b} cashed in on ${a}'s optimism. The commissary applauds quietly.`,
    `${a} trusted. ${b} chose the spreadsheet and the little flavour sachet.`
  ]);
  if (aMove === "C" && bMove === "C") return pick([
    `${a} and ${b} cooperated. Rare moment of trust. Suspicious, but profitable.`,
    `${a} and ${b} were weirdly wholesome. The noodle economy blushed.`,
    `${a} and ${b} proved society can limp forward, one packet at a time.`
  ]);
  return pick([
    `${a} and ${b} both chose violence. The noodles filed a complaint.`,
    `${a} and ${b} trusted absolutely nobody and were rewarded accordingly.`,
    `${a} and ${b} stared into the abyss and got one sad noodle pack each.`
  ]);
}

function pick(messages: string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}

export function sortedPlayers(lobby: Lobby) {
  return uniquePlayers(lobby.players).sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
}

export function gameNoodleDelta(player: Player) {
  return player.score - player.gameStartScore;
}

export function sortedPlayersByGameDelta(lobby: Lobby) {
  return uniquePlayers(lobby.players).sort((a, b) => gameNoodleDelta(b) - gameNoodleDelta(a) || b.score - a.score || a.nickname.localeCompare(b.nickname));
}

function uniquePlayers(players: Player[]) {
  const unique = new Map<string, Player>();
  for (const player of players) {
    unique.set(player.playerId, player);
  }
  return [...unique.values()];
}

export function buildAwards(lobby: Lobby): Award[] {
  const ranked = sortedPlayersByGameDelta(lobby);
  const awards: Award[] = [];
  const topBy = (value: (player: Player) => number) => ranked.reduce((best, player) => value(player) > value(best) ? player : best, ranked[0]);
  if (!ranked[0]) return awards;

  const winnerDelta = gameNoodleDelta(ranked[0]);
  awards.push({
    title: "Noodle Kingpin",
    playerName: ranked[0].nickname,
    detail: `${winnerDelta >= 0 ? "+" : ""}${winnerDelta} noodle packs this game, ${ranked[0].score} total in the stash, and the confidence of someone who should be searched.`
  });
  awards.push({ title: "Biggest Snake", playerName: topBy((p) => p.stats.betrayedOthers).nickname, detail: "Most betrayals against trusting humans. Spiritually a spreadsheet." });
  awards.push({ title: "Most Trusting", playerName: topBy((p) => p.stats.cooperations).nickname, detail: "Pressed Cooperate like friendship pays rent." });
  awards.push({ title: "Most Betrayed", playerName: topBy((p) => p.stats.gotBetrayed).nickname, detail: "Kept offering peace. Received itemised disrespect." });
  awards.push({ title: "Peacekeeper", playerName: topBy((p) => p.stats.mutualCooperations).nickname, detail: "Most mutual cooperation moments. Possibly too pure for this economy." });
  awards.push({ title: "Menace to Society", playerName: topBy((p) => p.stats.defections).nickname, detail: "Highest defection count. Not legally financial advice." });

  const enemy = topBy((p) => p.stats.clankerBetrayals);
  if (enemy.stats.clankerBetrayals > 0) awards.push({ title: "Clanker's Enemy", playerName: enemy.nickname, detail: "Betrayed The Clanker and made it everyone's invoice." });

  const therapist = topBy((p) => p.stats.clankerTherapy);
  if (therapist.stats.clankerTherapy > 0) awards.push({ title: "Clanker's Therapist", playerName: therapist.nickname, detail: "Cooperated with angry machinery. Paid in exposure and noodles." });

  return awards;
}

export function findPlayer(lobby: Lobby, playerId: string) {
  return lobby.players.find((player) => player.playerId === playerId);
}
