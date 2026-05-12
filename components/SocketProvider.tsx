"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getNickname, getPlayerId } from "@/lib/clientStorage";

type SocketContextValue = {
  socket: Socket | null;
  playerId: string;
  nickname: string;
  setLocalNickname: (nickname: string) => void;
  connected: boolean;
};

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [nickname, setNickname] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const storedPlayerId = getPlayerId();
    const storedNickname = getNickname();
    const nextSocket = io();

    setPlayerId(storedPlayerId);
    setNickname(storedNickname);
    setSocket(nextSocket);

    nextSocket.on("connect", () => {
      setConnected(true);
      nextSocket.emit("player:hello", { playerId: storedPlayerId, nickname: getNickname() });
    });
    nextSocket.on("disconnect", () => setConnected(false));

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  const value = useMemo<SocketContextValue>(() => ({
    socket,
    playerId,
    nickname,
    connected,
    setLocalNickname: (nextNickname: string) => {
      setNickname(nextNickname);
      socket?.emit("player:setNickname", { playerId, nickname: nextNickname });
    }
  }), [connected, nickname, playerId, socket]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const value = useContext(SocketContext);
  if (!value) throw new Error("useSocket must be used inside SocketProvider");
  return value;
}
