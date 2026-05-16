import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { BETWEEN_ROUNDS_DURATION_MS, ROUND_DURATION_MS, STARTING_NOODLE_PACKS, allMovesSubmitted, autoCooperateMissingMoves, buildAwards, connectedPlayersReady, findPlayer, generateLobbyCode, makeLobby, makePlayer, resetLobbyForReplay, revealRound, startRound, uniqueConnectedPlayers } from "./lib/game";
import { ensurePlayerBalance, recordFinishedGame, recordPlayerBalances } from "./lib/leaderboard";
import type { Lobby, Move } from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();
const lobbies = new Map<string, Lobby>();
const socketPlayers = new Map<string, string>();
const roundTimers = new Map<string, NodeJS.Timeout>();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    socket.on("player:hello", ({ playerId, nickname }: { playerId: string; nickname: string }) => {
      socketPlayers.set(socket.id, playerId);
      if (nickname?.trim()) void ensurePlayerBalance(playerId, nickname.trim());
      const lobby = findLobbyByPlayer(playerId);
      if (lobby) {
        const player = findPlayer(lobby, playerId);
        if (player) {
          player.socketId = socket.id;
          player.connected = true;
          if (nickname?.trim()) player.nickname = nickname.trim();
          socket.join(lobby.code);
          emitLobby(io, lobby);
        }
      }
    });

    socket.on("lobby:listOpen", () => {
      socket.emit("lobby:openList", getOpenLobbies());
    });

    socket.on("player:setNickname", ({ playerId, nickname }: { playerId: string; nickname: string }) => {
      if (nickname.trim()) void ensurePlayerBalance(playerId, nickname.trim());
      const lobby = findLobbyByPlayer(playerId);
      const player = lobby ? findPlayer(lobby, playerId) : null;
      if (lobby && player && nickname.trim()) {
        player.nickname = nickname.trim();
        emitLobby(io, lobby);
      }
    });

    socket.on("lobby:create", async ({ playerId, nickname, totalRounds, maxPlayers }: { playerId: string; nickname: string; totalRounds: number; maxPlayers: number }) => {
      if (!nickname?.trim()) return socket.emit("error", "Choose a nickname first.");
      const existing = findLobbyByPlayer(playerId);
      if (existing) removePlayer(existing, playerId);

      const code = generateLobbyCode(new Set(lobbies.keys()));
      const host = makePlayer(playerId, socket.id, nickname.trim(), true, STARTING_NOODLE_PACKS, false);
      const lobby = makeLobby(code, host, clamp(totalRounds, 3, 10), clamp(maxPlayers, 2, 12));
      lobbies.set(code, lobby);
      socket.join(code);
      socket.emit("lobby:created", { code });
      emitLobby(io, lobby);
      emitOpenLobbies(io);

      const balance = await ensurePlayerBalance(playerId, nickname.trim());
      if (lobby.status === "waiting") {
        host.score = balance;
        host.gameStartScore = balance;
        host.balanceReady = true;
        emitLobby(io, lobby);
      }
    });

    socket.on("lobby:join", async ({ playerId, nickname, code }: { playerId: string; nickname: string; code: string }) => {
      if (!nickname?.trim()) return socket.emit("error", "Choose a nickname first.");
      const lobby = lobbies.get(code.toUpperCase().trim());
      if (!lobby) return socket.emit("error", "Lobby not found.");

      const existingPlayer = findPlayer(lobby, playerId);
      if (existingPlayer) {
        existingPlayer.socketId = socket.id;
        existingPlayer.connected = true;
        existingPlayer.nickname = nickname.trim();
        socket.join(lobby.code);
        socket.emit("lobby:joined", { code: lobby.code });
        emitLobby(io, lobby);

        if (!existingPlayer.balanceReady && lobby.status === "waiting") {
          const balance = await ensurePlayerBalance(playerId, nickname.trim());
          if (lobby.status === "waiting") {
            existingPlayer.score = balance;
            existingPlayer.gameStartScore = balance;
            existingPlayer.balanceReady = true;
            emitLobby(io, lobby);
          }
        }
        return;
      }

      if (lobby.status !== "waiting") return socket.emit("error", "That game already started.");
      if (lobby.players.length >= lobby.maxPlayers) return socket.emit("error", "Lobby is full.");

      const previous = findLobbyByPlayer(playerId);
      if (previous && previous.code !== lobby.code) removePlayer(previous, playerId);

      const player = makePlayer(playerId, socket.id, nickname.trim(), false, STARTING_NOODLE_PACKS, false);
      lobby.players.push(player);
      socket.join(lobby.code);
      socket.emit("lobby:joined", { code: lobby.code });
      emitLobby(io, lobby);
      emitOpenLobbies(io);

      const balance = await ensurePlayerBalance(playerId, nickname.trim());
      if (lobby.status === "waiting") {
        player.score = balance;
        player.gameStartScore = balance;
        player.balanceReady = true;
        emitLobby(io, lobby);
      }
    });

    socket.on("lobby:leave", ({ playerId, code }: { playerId: string; code: string }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      removePlayer(lobby, playerId);
      socket.leave(code);
      socket.emit("lobby:left");
      if (lobby.players.length === 0) {
        clearRoundTimer(lobby.code);
        lobbies.delete(lobby.code);
      } else {
        emitLobby(io, lobby);
      }
      emitOpenLobbies(io);
    });

    socket.on("game:start", ({ playerId, code }: { playerId: string; code: string }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      if (lobby.hostPlayerId !== playerId) return socket.emit("error", "Only the host can start.");
      if (lobby.status !== "waiting") return socket.emit("error", "Game already started.");
      if (connectedPlayerCount(lobby) < 2) return socket.emit("error", "You need at least 2 connected players.");
      if (!connectedPlayersReady(lobby.players)) return socket.emit("error", "Hold up. The noodle accountant is still counting balances.");
      startRound(lobby);
      scheduleRoundTimer(io, lobby);
      io.to(lobby.code).emit("game:roundStarted", lobby);
      emitLobby(io, lobby);
      emitOpenLobbies(io);
    });

    socket.on("game:submitMove", ({ playerId, code, move }: { playerId: string; code: string; move: Move }) => {
      const lobby = lobbies.get(code);
      if (!lobby || lobby.status !== "in_round") return;
      const pairing = lobby.pairings.find((p) => p.aPlayerId === playerId || p.bPlayerId === playerId);
      if (!pairing || (move !== "C" && move !== "D")) return;
      pairing.moves[playerId] = move;
      emitLobby(io, lobby);
      if (allMovesSubmitted(lobby)) {
        revealAndEmit(io, lobby);
      }
    });

    socket.on("game:nextRound", ({ playerId, code }: { playerId: string; code: string }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      if (lobby.hostPlayerId !== playerId) return socket.emit("error", "Only the host can advance.");
      if (lobby.status !== "between_rounds") return;
      clearRoundTimer(lobby.code);
      startRound(lobby);
      scheduleRoundTimer(io, lobby);
      io.to(lobby.code).emit("game:roundStarted", lobby);
      emitLobby(io, lobby);
    });

    socket.on("game:restart", ({ playerId, code }: { playerId: string; code: string }) => {
      const lobby = lobbies.get(code);
      if (!lobby) return;
      if (lobby.hostPlayerId !== playerId) return socket.emit("error", "Only the host can restart.");
      if (lobby.status !== "finished") return socket.emit("error", "The game has to finish first.");
      resetLobbyForReplay(lobby);
      emitLobby(io, lobby);
      emitOpenLobbies(io);
    });

    socket.on("disconnect", () => {
      const playerId = socketPlayers.get(socket.id);
      socketPlayers.delete(socket.id);
      if (!playerId) return;
      const lobby = findLobbyByPlayer(playerId);
      const player = lobby ? findPlayer(lobby, playerId) : null;
      if (lobby && player && player.socketId === socket.id) {
        player.connected = false;
        emitLobby(io, lobby);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`Ready on http://localhost:${port}`);
  });
});

function emitLobby(io: Server, lobby: Lobby) {
  io.to(lobby.code).emit("lobby:updated", lobby);
}

function emitOpenLobbies(io: Server) {
  io.emit("lobby:openList", getOpenLobbies());
}

function getOpenLobbies() {
  return [...lobbies.values()]
    .filter((lobby) => lobby.status === "waiting" && lobby.players.length < lobby.maxPlayers)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((lobby) => ({
      code: lobby.code,
      playerCount: lobby.players.length,
      maxPlayers: lobby.maxPlayers,
      totalRounds: lobby.totalRounds,
      hostNickname: findPlayer(lobby, lobby.hostPlayerId)?.nickname ?? lobby.players[0]?.nickname ?? "Mystery Host"
    }));
}

function connectedPlayerCount(lobby: Lobby) {
  return uniqueConnectedPlayers(lobby.players).length;
}

function scheduleRoundTimer(io: Server, lobby: Lobby) {
  clearRoundTimer(lobby.code);
  roundTimers.set(lobby.code, setTimeout(() => {
    const currentLobby = lobbies.get(lobby.code);
    if (!currentLobby || currentLobby.status !== "in_round") return;
    autoCooperateMissingMoves(currentLobby);
    revealAndEmit(io, currentLobby);
  }, ROUND_DURATION_MS));
}

function scheduleBetweenRoundTimer(io: Server, lobby: Lobby) {
  clearRoundTimer(lobby.code);
  roundTimers.set(lobby.code, setTimeout(() => {
    const currentLobby = lobbies.get(lobby.code);
    if (!currentLobby || currentLobby.status !== "between_rounds") return;
    startRound(currentLobby);
    scheduleRoundTimer(io, currentLobby);
    io.to(currentLobby.code).emit("game:roundStarted", currentLobby);
    emitLobby(io, currentLobby);
  }, BETWEEN_ROUNDS_DURATION_MS));
}

function clearRoundTimer(code: string) {
  const timer = roundTimers.get(code);
  if (timer) clearTimeout(timer);
  roundTimers.delete(code);
}

function revealAndEmit(io: Server, lobby: Lobby) {
  clearRoundTimer(lobby.code);
  revealRound(lobby);
  void recordPlayerBalances(lobby);
  if (lobby.status === "between_rounds") scheduleBetweenRoundTimer(io, lobby);
  io.to(lobby.code).emit("game:roundRevealed", lobby);
  if ((lobby as Lobby).status === "finished") {
    void recordFinishedGame(lobby);
    io.to(lobby.code).emit("game:finished", { lobby, awards: buildAwards(lobby) });
  }
  emitLobby(io, lobby);
}

function findLobbyByPlayer(playerId: string) {
  return [...lobbies.values()].find((lobby) => lobby.players.some((player) => player.playerId === playerId));
}

function removePlayer(lobby: Lobby, playerId: string) {
  const leaving = findPlayer(lobby, playerId);
  lobby.players = lobby.players.filter((player) => player.playerId !== playerId);
  if (leaving?.isHost && lobby.players[0]) {
    for (const player of lobby.players) {
      player.isHost = false;
    }
    lobby.hostPlayerId = lobby.players[0].playerId;
    lobby.players[0].isHost = true;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
