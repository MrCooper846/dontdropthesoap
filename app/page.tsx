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

function formatNoodlePacks(score: number) {
  return `${score} noodle packs${score < 0 ? " - in noodle debt" : ""}`;
}

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNicknameState] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState("");

  useEffect(() => {
    const stored = getNickname();
    const pendingLobby = consumePendingLobby();
    setNicknameState(stored);
    if (stored && pendingLobby) router.replace(`/lobby/${pendingLobby}`);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    function loadLeaderboard() {
      fetch("/api/leaderboard", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("Leaderboard request failed");
          return response.json();
        })
        .then((data: { leaderboard?: LeaderboardEntry[] }) => {
          if (cancelled) return;
          setLeaderboard(data.leaderboard ?? []);
          setLeaderboardError("");
        })
        .catch(() => {
          if (cancelled) return;
          setLeaderboard([]);
          setLeaderboardError("Could not load noodle rankings. The commissary ledger is sulking.");
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") loadLeaderboard();
    }

    loadLeaderboard();
    window.addEventListener("focus", loadLeaderboard);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadLeaderboard);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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
        <p className="subtitle">A tiny party game about trust, betrayal, and ruining friendships over instant noodles.</p>
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
          Welcome to the noodle economy. Everyone starts with 50 noodle packs, which is basically generational wealth in here.
          Each round, both players put 2 packs on the line: C/C gets 3 back each, C/D gives the cooperator 0 and the defector 5,
          and D/D gets 1 back each. Noodle totals can go negative, because bad decisions deserve accounting.
        </p>
      </section>

      <section className="panel stack">
        <div className="row">
          <h2>Global Noodle Rankings</h2>
          <span className="pill">Commissary crimes</span>
        </div>
        {leaderboardError ? (
          <p className="muted">{leaderboardError}</p>
        ) : leaderboard.length === 0 ? (
          <p className="muted">No noodle stashes yet. Be the first financial incident.</p>
        ) : (
          <ol className="list">
            {leaderboard.map((entry, index) => (
              <li className="listItem" key={entry.playerId}>
                <strong>{index + 1}. {entry.nickname}</strong>
                <span className="pill">{formatNoodlePacks(entry.score)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link className="muted" href="/nickname">Change nickname anytime</Link>
    </main>
  );
}
