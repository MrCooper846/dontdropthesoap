"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getNickname } from "@/lib/clientStorage";
import { useSocket } from "@/components/SocketProvider";

export default function CreatePage() {
  const router = useRouter();
  const { socket, playerId } = useSocket();
  const [nickname, setNickname] = useState("");
  const [rounds, setRounds] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = getNickname();
    if (!stored) router.replace("/nickname");
    setNickname(stored);
  }, [router]);

  useEffect(() => {
    if (!socket) return;
    const onCreated = ({ code }: { code: string }) => router.push(`/lobby/${code}`);
    const onError = (message: string) => setError(message);
    socket.on("lobby:created", onCreated);
    socket.on("error", onError);
    return () => {
      socket.off("lobby:created", onCreated);
      socket.off("error", onError);
    };
  }, [router, socket]);

  function createLobby(event: FormEvent) {
    event.preventDefault();
    socket?.emit("lobby:create", { playerId, nickname, totalRounds: rounds, maxPlayers });
  }

  return (
    <main className="screen stack">
      <h1 className="brand">Create Lobby</h1>
      <form className="panel stack" onSubmit={createLobby}>
        <label className="label">
          Rounds
          <input className="input" type="number" min={3} max={10} value={rounds} onChange={(event) => setRounds(Number(event.target.value))} />
        </label>
        <label className="label">
          Max Players
          <input className="input" type="number" min={2} max={12} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
        </label>
        {error && <p className="danger">{error}</p>}
        <button className="button primary" disabled={!socket || !playerId}>Create Lobby</button>
      </form>
    </main>
  );
}
