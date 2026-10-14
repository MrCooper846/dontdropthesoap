"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { consumePendingLobby, getNickname, setNickname } from "@/lib/clientStorage";
import { useSocket } from "@/components/SocketProvider";

export default function NicknamePage() {
  const router = useRouter();
  const { setLocalNickname } = useSocket();
  const [nickname, setNicknameState] = useState("");

  useEffect(() => {
    setNicknameState(getNickname());
  }, []);

  function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = nickname.trim().slice(0, 24);
    if (!trimmed) return;
    setNickname(trimmed);
    setLocalNickname(trimmed);
    const pendingLobby = consumePendingLobby();
    router.push(pendingLobby ? `/lobby/${pendingLobby}` : "/");
  }

  return (
    <main className="screen stack">
      <div className="topbar">
        <h1 className="brand">Your Alias</h1>
      </div>
      <form className="panel stack" onSubmit={save}>
        <label className="label">
          Nickname
          <input
            className="input"
            value={nickname}
            maxLength={24}
            autoFocus
            placeholder="e.g. Dave The Betrayer"
            onChange={(event) => setNicknameState(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={!nickname.trim()}>Save Nickname</button>
      </form>
    </main>
  );
}
