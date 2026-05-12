"use client";

const PLAYER_ID_KEY = "dds.playerId";
const NICKNAME_KEY = "dds.nickname";
const PENDING_LOBBY_KEY = "dds.pendingLobbyCode";

export function getPlayerId() {
  let playerId = localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) {
    playerId = createPlayerId();
    localStorage.setItem(PLAYER_ID_KEY, playerId);
  }
  return playerId;
}

function createPlayerId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function getNickname() {
  return localStorage.getItem(NICKNAME_KEY) ?? "";
}

export function setNickname(nickname: string) {
  localStorage.setItem(NICKNAME_KEY, nickname.trim());
}

export function setPendingLobby(code: string) {
  localStorage.setItem(PENDING_LOBBY_KEY, code.toUpperCase());
}

export function consumePendingLobby() {
  const code = localStorage.getItem(PENDING_LOBBY_KEY);
  localStorage.removeItem(PENDING_LOBBY_KEY);
  return code;
}
