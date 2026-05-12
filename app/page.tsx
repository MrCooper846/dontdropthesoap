"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { consumePendingLobby, getNickname, setPendingLobby } from "@/lib/clientStorage";

type LeaderboardEntry = {
  playerId: string;
  nickname: string;
  score: number;
};

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNicknameState] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const stored = getNickname();
    const pendingLobby = consumePendingLobby();
    setNicknameState(stored);
    if (stored && pendingLobby) router.replace(`/lobby/${pendingLobby}`);
  }, [router]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((response) => response.json())
      .then((data: { leaderboard?: LeaderboardEntry[] }) => setLeaderboard(data.leaderboard ?? []))
      .catch(() => setLeaderboard([]));
  }, []);

  function requireNickname(path: string) {
    if (!nickname) {
      if (path.startsWith("/lobby/")) setPendingLobby(path.split("/").pop() ?? "");
      router.push("/nickname");
      return;
    }
    router.push(path);
  }

  return (
    <main className="screen stack">
      <section>
        <h1 className="brand">Don&apos;t Drop The Soap</h1>
        <p className="subtitle">A tiny party game about trust, betrayal, and making your friends yell at a phone.</p>
      </section>

      <section className="panel stack">
        <button className="button" onClick={() => router.push("/nickname")}>
          {nickname ? `Nickname: ${nickname}` : "Choose Nickname"}
        </button>
        <button className="button primary" onClick={() => requireNickname("/create")}>Create Lobby</button>
        <button className="button" onClick={() => requireNickname("/join")}>Join Lobby</button>
      </section>

      <section className="panel">
        <h2>Rules</h2>
        <p className="subtitle">
          Each round, you are paired with someone. Secretly choose Cooperate or Defect. If you both cooperate, you both gain.
          If one defects while the other cooperates, the defector gets a big reward. If both defect, you both get scraps.
        </p>
      </section>

      <section className="panel stack">
        <div className="row">
          <h2>Global Scores</h2>
          <span className="pill">Tonight&apos;s damage</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="muted">No scores yet. Be the first problem.</p>
        ) : (
          <ol className="list">
            {leaderboard.map((entry, index) => (
              <li className="listItem" key={entry.playerId}>
                <strong>{index + 1}. {entry.nickname}</strong>
                <span className="pill">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link className="muted" href="/nickname">Change nickname anytime</Link>
    </main>
  );
}
