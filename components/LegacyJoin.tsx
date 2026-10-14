"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getNickname } from "@/lib/clientStorage";
import { useSocket } from "@/components/SocketProvider";

type OpenLobby = {
  code: string;
  playerCount: number;
  maxPlayers: number;
  totalRounds: number;
  hostNickname: string;
};

export default function JoinPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const [code, setCode] = useState("");
  const [openLobbies, setOpenLobbies] = useState<OpenLobby[]>([]);

  useEffect(() => {
    if (!getNickname()) router.replace("/nickname");
  }, [router]);

  useEffect(() => {
    if (!socket) return;
    const onOpenList = (lobbies: OpenLobby[]) => setOpenLobbies(lobbies);
    socket.on("lobby:openList", onOpenList);
    socket.emit("lobby:listOpen");
    return () => {
      socket.off("lobby:openList", onOpenList);
    };
  }, [socket]);

  function join(event: FormEvent) {
    event.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned) router.push(`/lobby/${cleaned}`);
  }

  return (
    <main className="screen stack">
      <h1 className="brand">Join Lobby</h1>
      <form className="panel stack" onSubmit={join}>
        <label className="label">
          Room Code
          <input
            className="input code"
            value={code}
            maxLength={6}
            autoFocus
            placeholder="ABC234"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <button className="button primary" disabled={code.trim().length < 4}>Join Lobby</button>
      </form>

      <section className="panel stack">
        <div className="row">
          <h2>Open Lobbies</h2>
          <button className="button small" onClick={() => socket?.emit("lobby:listOpen")}>Refresh</button>
        </div>
        {openLobbies.length === 0 ? (
          <p className="muted">No waiting lobbies yet. Someone needs to create trouble first.</p>
        ) : (
          <ul className="list">
            {openLobbies.map((lobby) => (
              <li className="listItem" key={lobby.code}>
                <div>
                  <strong className="code" style={{ fontSize: 22 }}>{lobby.code}</strong>
                  <p className="muted">
                    Host: {lobby.hostNickname} · {lobby.playerCount}/{lobby.maxPlayers} players · {lobby.totalRounds} rounds
                  </p>
                </div>
                <button className="button small primary" onClick={() => router.push(`/lobby/${lobby.code}`)}>Join</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
