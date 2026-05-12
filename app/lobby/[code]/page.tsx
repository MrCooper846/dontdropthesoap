"use client";

import { QRCodeSVG } from "qrcode.react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getNickname, setPendingLobby } from "@/lib/clientStorage";
import { useSocket } from "@/components/SocketProvider";
import { buildAwards, sortedPlayers } from "@/lib/game";
import type { Lobby, Move, Pairing, RoundResult } from "@/lib/types";

export default function LobbyPage() {
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const router = useRouter();
  const { socket, playerId, nickname } = useSocket();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [link, setLink] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    const storedNickname = getNickname();
    if (!storedNickname) {
      setPendingLobby(code);
      router.replace("/nickname");
      return;
    }
    setLink(`${window.location.origin}/lobby/${code}`);
    setSoundEnabled(localStorage.getItem("dds.soundEnabled") === "true");
  }, [code, router]);

  useEffect(() => {
    if (!socket || !playerId || !getNickname()) return;

    const onUpdated = (nextLobby: Lobby) => {
      if (nextLobby.code === code) setLobby(nextLobby);
    };
    const onJoined = () => setError("");
    const onLeft = () => router.push("/");
    const onError = (message: string) => setError(message);

    socket.on("lobby:updated", onUpdated);
    socket.on("lobby:joined", onJoined);
    socket.on("lobby:left", onLeft);
    socket.on("error", onError);
    socket.emit("lobby:join", { playerId, nickname: getNickname(), code });

    return () => {
      socket.off("lobby:updated", onUpdated);
      socket.off("lobby:joined", onJoined);
      socket.off("lobby:left", onLeft);
      socket.off("error", onError);
    };
  }, [code, playerId, router, socket, nickname]);

  const me = lobby?.players.find((player) => player.playerId === playerId);
  const isHost = Boolean(me?.isHost);
  const canStart = isHost && lobby?.status === "waiting" && lobby.players.length >= 2;
  const currentPairing = lobby ? getPairingForPlayer(lobby, playerId) : null;
  const myMove = currentPairing?.moves[playerId];
  const latestRoundResults = useMemo(() => {
    if (!lobby) return [];
    return lobby.resultsHistory.filter((result) => result.round === lobby.currentRound);
  }, [lobby]);

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function leaveLobby() {
    socket?.emit("lobby:leave", { playerId, code });
  }

  function submitMove(move: Move) {
    if (soundEnabled) playTone(move === "C" ? 520 : 180, 0.08, move === "C" ? "sine" : "sawtooth");
    socket?.emit("game:submitMove", { playerId, code, move });
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("dds.soundEnabled", String(next));
    if (next) playTone(440, 0.08, "triangle");
  }

  if (error && !lobby) {
    return (
      <main className="screen stack">
        <h1 className="brand">Lobby {code}</h1>
        <section className="panel stack">
          <p className="danger">{error}</p>
          <button className="button" onClick={() => router.push("/")}>Back Home</button>
        </section>
      </main>
    );
  }

  if (!lobby) {
    return (
      <main className="screen stack">
        <h1 className="brand">Joining...</h1>
        <p className="subtitle">Finding lobby {code}. Warming up the betrayal engine.</p>
      </main>
    );
  }

  return (
    <main className="screen stack">
      <header className="topbar">
        <div>
          <p className="pill">{statusText(lobby.status)}</p>
          <h1 className="brand code">{lobby.code}</h1>
        </div>
        <button className="button small" onClick={leaveLobby}>Leave</button>
      </header>

      {error && <p className="danger">{error}</p>}

      <section className="panel stack">
        <div className="splitActions">
          <button className="button small" onClick={copyLink}>{copied ? "Copied" : "Copy Link"}</button>
          <button className="button small" onClick={() => setShowQr((value) => !value)}>{showQr ? "Hide QR" : "Show QR"}</button>
        </div>
        {showQr && link && <div className="qrWrap"><QRCodeSVG value={link} size={190} /></div>}
        <ClankerBanner lobby={lobby} />
        <button className="button small" onClick={toggleSound}>{soundEnabled ? "Sound On" : "Sound Off"}</button>
      </section>

      {lobby.status === "waiting" && (
        <WaitingRoom lobby={lobby} isHost={isHost} canStart={canStart} onStart={() => socket?.emit("game:start", { playerId, code })} />
      )}

      {lobby.status === "in_round" && currentPairing && (
        <RoundChoice lobby={lobby} pairing={currentPairing} playerId={playerId} myMove={myMove} submitMove={submitMove} />
      )}

      {(lobby.status === "between_rounds" || lobby.status === "finished") && (
        <ResultsView
          lobby={lobby}
          results={latestRoundResults}
          isHost={isHost}
          onNext={() => socket?.emit("game:nextRound", { playerId, code })}
          onRestart={() => socket?.emit("game:restart", { playerId, code })}
          soundEnabled={soundEnabled}
        />
      )}

      <PlayersPanel lobby={lobby} />
    </main>
  );
}

function ClankerBanner({ lobby }: { lobby: Lobby }) {
  const vengeful = lobby.botState.lastHumanMoveAgainstBot === "D";
  return (
    <div className={`clankerBanner ${vengeful ? "vengeful" : "friendly"}`}>
      <strong>{vengeful ? "The Clanker mood: Vengeful" : "The Clanker mood: Friendly"}</strong>
      <p>
        The Clanker copies the last move any human played against it.
        {vengeful ? " Someone made it angry. Good luck." : " Nobody has annoyed the machine yet."}
      </p>
    </div>
  );
}

function WaitingRoom({ lobby, isHost, canStart, onStart }: { lobby: Lobby; isHost: boolean; canStart: boolean; onStart: () => void }) {
  return (
    <section className="panel stack">
      <div className="row">
        <strong>Waiting Room</strong>
        <span className="pill">{lobby.players.length}/{lobby.maxPlayers}</span>
      </div>
      <p className="subtitle">{lobby.totalRounds} rounds. At least 2 people required. Maximum drama recommended.</p>
      {isHost ? (
        <button className="button primary choiceButton" disabled={!canStart} onClick={onStart}>Start Game</button>
      ) : (
        <p className="muted">Waiting for the host to press the big shiny button.</p>
      )}
    </section>
  );
}

function RoundChoice({ lobby, pairing, playerId, myMove, submitMove }: { lobby: Lobby; pairing: Pairing; playerId: string; myMove?: Move; submitMove: (move: Move) => void }) {
  const opponent = opponentName(lobby, pairing, playerId);
  const submitted = lobby.pairings.reduce((count, item) => count + Object.keys(item.moves).length, 0);
  const required = lobby.pairings.reduce((count, item) => count + (item.bPlayerId === "BOT" ? 1 : 2), 0);
  const secondsLeft = useRoundCountdown(lobby.roundEndsAt);
  const [lockedMove, setLockedMove] = useState<Move | null>(null);

  useEffect(() => {
    setLockedMove(null);
  }, [lobby.currentRound]);

  function choose(move: Move) {
    setLockedMove(move);
    submitMove(move);
  }

  return (
    <section className={`panel stack choicePanel ${lockedMove === "C" ? "flashGood" : ""} ${lockedMove === "D" ? "flashBad" : ""}`}>
      <div className="row">
        <strong>Round {lobby.currentRound}/{lobby.totalRounds}</strong>
        <span className="pill timerPill">{secondsLeft}s</span>
      </div>
      <div className="row">
        <span className="muted">{submitted}/{required} locked</span>
        <span className="muted">No move = Cooperate</span>
      </div>
      <h2>You face {opponent}</h2>
      {myMove ? (
        <div className="lockCard">
          <strong>{myMove === "C" ? "Locked in. Suspiciously noble." : "Locked in. Absolute menace behaviour."}</strong>
          <p className="muted">Waiting for everyone else to make their terrible little choice.</p>
        </div>
      ) : (
        <div className="splitActions">
          <button className="button good choiceButton" onClick={() => choose("C")}>Cooperate</button>
          <button className="button bad choiceButton" onClick={() => choose("D")}>Defect</button>
        </div>
      )}
    </section>
  );
}

function useRoundCountdown(roundEndsAt: number | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!roundEndsAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [roundEndsAt]);

  if (!roundEndsAt) return 0;
  return Math.max(0, Math.ceil((roundEndsAt - now) / 1000));
}

function ResultsView({ lobby, results, isHost, onNext, onRestart, soundEnabled }: { lobby: Lobby; results: RoundResult[]; isHost: boolean; onNext: () => void; onRestart: () => void; soundEnabled: boolean }) {
  const awards = lobby.status === "finished" ? buildAwards(lobby) : [];
  const [visibleResults, setVisibleResults] = useState(results.length > 0 ? 1 : 0);
  const [visibleAwards, setVisibleAwards] = useState(lobby.status === "finished" ? 1 : 0);

  useEffect(() => {
    setVisibleResults(results.length > 0 ? 1 : 0);
    if (results.length === 0) return;
    if (soundEnabled) playTone(330, 0.08, "triangle");

    let index = 1;
    const interval = window.setInterval(() => {
      index += 1;
      setVisibleResults(Math.min(index, results.length));
      if (soundEnabled) playTone(index % 2 === 0 ? 220 : 440, 0.06, "triangle");
      if (index >= results.length) window.clearInterval(interval);
    }, 850);

    return () => window.clearInterval(interval);
  }, [results, soundEnabled]);

  useEffect(() => {
    if (lobby.status !== "finished" || awards.length === 0) return;
    setVisibleAwards(1);
    let index = 1;
    const interval = window.setInterval(() => {
      index += 1;
      setVisibleAwards(Math.min(index, awards.length));
      if (soundEnabled) playTone(560, 0.07, "sine");
      if (index >= awards.length) window.clearInterval(interval);
    }, 950);

    return () => window.clearInterval(interval);
  }, [awards.length, lobby.status, soundEnabled]);

  const currentReveal = results[Math.max(0, Math.min(visibleResults, results.length) - 1)];
  const awardsFinished = lobby.status !== "finished" || visibleAwards >= awards.length;
  const showLeaderboard = lobby.status === "between_rounds" || awardsFinished;

  return (
    <section className="panel stack">
      <h2>{lobby.status === "finished" ? "Final Results" : `Round ${lobby.currentRound} Results`}</h2>
      {currentReveal && (
        <div className="revealStage">
          <span className="pill">Reveal {Math.min(visibleResults, results.length)}/{results.length}</span>
          <strong>{currentReveal.aName} vs {currentReveal.bName}</strong>
          <p>{moveLabel(currentReveal.aMove)} vs {moveLabel(currentReveal.bMove)}</p>
        </div>
      )}
      <ul className="list">
        {results.slice(0, visibleResults).map((result) => (
          <li className={`listItem result ${result.aMove !== result.bMove ? "betrayalResult" : ""}`} key={result.pairingId}>
            <div>
              <strong>{result.message}</strong>
              <p className="muted">{moveLabel(result.aMove)} vs {moveLabel(result.bMove)}. {result.aName} +{result.aPoints}, {result.bName} +{result.bPoints}</p>
            </div>
          </li>
        ))}
      </ul>
      {awards.length > 0 && (
        <div className="stack">
          <h2>Awards</h2>
          <ul className="list">
            {awards.slice(0, visibleAwards).map((award) => (
              <li className="listItem awardItem" key={award.title}>
                <div>
                  <strong>{award.title}: {award.playerName}</strong>
                  <p className="muted">{award.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showLeaderboard && <Leaderboard lobby={lobby} />}
      {lobby.status === "between_rounds" && isHost && <button className="button primary choiceButton" onClick={onNext}>Next Round</button>}
      {lobby.status === "between_rounds" && !isHost && <p className="muted">Host chooses when the next mess begins.</p>}
      {lobby.status === "finished" && awardsFinished && isHost && <button className="button primary choiceButton" onClick={onRestart}>Play Again</button>}
      {lobby.status === "finished" && awardsFinished && !isHost && <p className="muted">Host can restart this lobby, or leave and pass the crown.</p>}
    </section>
  );
}

function PlayersPanel({ lobby }: { lobby: Lobby }) {
  return (
    <section className="panel stack">
      <h2>Players</h2>
      <ul className="list">
        {lobby.players.map((player) => (
          <li className="listItem" key={player.playerId}>
            <div>
              <strong>{player.isHost ? "Host: " : ""}{player.nickname}</strong>
              <p className="muted">{player.connected ? "online" : "reconnecting hopefully"} · {player.score} pts</p>
            </div>
            {player.isHost && <span className="pill">Host</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Leaderboard({ lobby }: { lobby: Lobby }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="leaderboard">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Score</th>
            <th>C</th>
            <th>D</th>
            <th>Snake</th>
            <th>Hit</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayers(lobby).map((player, index) => (
            <tr className="scoreRow" key={player.playerId}>
              <td>{index + 1}</td>
              <td>{player.nickname}</td>
              <td><span className="scorePop">{player.score}</span></td>
              <td>{player.stats.cooperations}</td>
              <td>{player.stats.defections}</td>
              <td>{player.stats.betrayedOthers}</td>
              <td>{player.stats.gotBetrayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getPairingForPlayer(lobby: Lobby, playerId: string) {
  return lobby.pairings.find((pairing) => pairing.aPlayerId === playerId || pairing.bPlayerId === playerId);
}

function opponentName(lobby: Lobby, pairing: Pairing, playerId: string) {
  const opponentId = pairing.aPlayerId === playerId ? pairing.bPlayerId : pairing.aPlayerId;
  if (opponentId === "BOT") return "The Clanker";
  return lobby.players.find((player) => player.playerId === opponentId)?.nickname ?? "Someone suspicious";
}

function statusText(status: Lobby["status"]) {
  const labels: Record<Lobby["status"], string> = {
    waiting: "Waiting",
    in_round: "Choose privately",
    revealing: "Revealing",
    between_rounds: "Between rounds",
    finished: "Finished"
  };
  return labels[status];
}

function moveLabel(move: Move) {
  return move === "C" ? "Cooperate" : "Defect";
}

function playTone(frequency: number, duration: number, type: OscillatorType) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const audio = new AudioContextClass();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
  oscillator.addEventListener("ended", () => void audio.close());
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
