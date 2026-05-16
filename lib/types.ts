export type Move = "C" | "D";

export type LobbyStatus = "waiting" | "in_round" | "revealing" | "between_rounds" | "finished";

export type PlayerStats = {
  cooperations: number;
  defections: number;
  betrayedOthers: number;
  gotBetrayed: number;
  mutualCooperations: number;
  mutualDefections: number;
  clankerEncounters: number;
  clankerBetrayals: number;
  clankerTherapy: number;
};

export type Player = {
  playerId: string;
  socketId: string;
  nickname: string;
  isHost: boolean;
  connected: boolean;
  score: number;
  gameStartScore: number;
  balanceReady: boolean;
  stats: PlayerStats;
};

export type BotState = {
  lastHumanMoveAgainstBot: Move | null;
};

export type Pairing = {
  id: string;
  aPlayerId: string;
  bPlayerId: string | "BOT";
  moves: Partial<Record<string, Move>>;
  botMove?: Move;
};

export type RoundResult = {
  pairingId: string;
  round: number;
  aPlayerId: string;
  aName: string;
  bPlayerId: string | "BOT";
  bName: string;
  aMove: Move;
  bMove: Move;
  aPoints: number;
  bPoints: number;
  message: string;
};

export type Lobby = {
  code: string;
  hostPlayerId: string;
  status: LobbyStatus;
  maxPlayers: number;
  totalRounds: number;
  currentRound: number;
  roundEndsAt: number | null;
  players: Player[];
  pairings: Pairing[];
  resultsHistory: RoundResult[];
  botState: BotState;
  createdAt: number;
};

export type PublicLobby = Lobby;

export type Award = {
  title: string;
  playerName: string;
  detail: string;
};
