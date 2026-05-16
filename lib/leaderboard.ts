import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { STARTING_NOODLE_PACKS } from "./game";
import type { Lobby } from "./types";

export type LeaderboardEntry = {
  playerId: string;
  nickname: string;
  score: number;
};

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "leaderboard.sqlite");

let dbPromise: Promise<Database> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function getDb() {
  dbPromise ??= openDb();
  return dbPromise;
}

async function openDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file)
  });
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS player_balances (
      player_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      balance INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS score_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      lobby_code TEXT NOT NULL,
      player_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL,
      finished_at INTEGER NOT NULL,
      UNIQUE(game_id, player_id)
    );
  `);
  saveDb(db);
  return db;
}

export function ensurePlayerBalance(playerId: string, nickname: string): Promise<number> {
  const next = writeQueue.then(async () => {
    const db = await getDb();
    const now = Date.now();
    const trimmedNickname = nickname.trim();

    db.run(`
      INSERT INTO player_balances (player_id, nickname, balance, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        nickname = excluded.nickname,
        updated_at = excluded.updated_at;
    `, [playerId, trimmedNickname, STARTING_NOODLE_PACKS, now]);

    const statement = db.prepare(`
      SELECT balance
      FROM player_balances
      WHERE player_id = ?
      LIMIT 1;
    `);

    try {
      statement.bind([playerId]);
      if (statement.step()) {
        const row = statement.getAsObject() as { balance: number };
        saveDb(db);
        return row.balance;
      }
    } finally {
      statement.free();
    }

    saveDb(db);
    return STARTING_NOODLE_PACKS;
  });
  writeQueue = next;
  return next;
}

export function recordPlayerBalances(lobby: Lobby) {
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    const now = Date.now();
    const upsert = db.prepare(`
      INSERT INTO player_balances (player_id, nickname, balance, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        nickname = excluded.nickname,
        balance = excluded.balance,
        updated_at = excluded.updated_at;
    `);

    try {
      for (const player of lobby.players) {
        upsert.run([player.playerId, player.nickname, player.score, now]);
      }
    } finally {
      upsert.free();
    }

    saveDb(db);
  }).catch((error) => {
    console.error("Failed to record noodle balances", error);
  });

  return writeQueue;
}

export function recordFinishedGame(lobby: Lobby) {
  writeQueue = writeQueue.then(async () => {
    const db = await getDb();
    const gameId = `${lobby.code}-${lobby.createdAt}`;
    const finishedAt = Date.now();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO score_entries
        (game_id, lobby_code, player_id, nickname, score, finished_at)
      VALUES (?, ?, ?, ?, ?, ?);
    `);

    try {
      for (const player of lobby.players) {
        insert.run([gameId, lobby.code, player.playerId, player.nickname, player.score, finishedAt]);
      }
    } finally {
      insert.free();
    }

    saveDb(db);
  }).catch((error) => {
    console.error("Failed to record leaderboard scores", error);
  });

  return writeQueue;
}

export async function getGlobalLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  await writeQueue.catch(() => undefined);
  const db = await getDb();
  const statement = db.prepare(`
    SELECT
      player_id AS playerId,
      nickname,
      balance AS score
    FROM player_balances
    ORDER BY score DESC, nickname ASC
    LIMIT ?;
  `);

  const entries: LeaderboardEntry[] = [];
  try {
    statement.bind([limit]);
    while (statement.step()) {
      const row = statement.getAsObject() as { playerId: string; nickname: string; score: number };
      entries.push({
        playerId: row.playerId,
        nickname: row.nickname,
        score: row.score
      });
    }
  } finally {
    statement.free();
  }

  return entries;
}

function saveDb(db: Database) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}
