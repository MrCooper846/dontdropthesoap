"use client";

import { QRCodeSVG } from "qrcode.react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getNickname, setPendingLobby } from "@/lib/clientStorage";
import { useSocket } from "@/components/SocketProvider";
import { ROUND_ANTE_NOODLE_PACKS, buildAwards, connectedPlayersReady, gameNoodleDelta, sortedPlayersByGameDelta, uniqueConnectedPlayers } from "@/lib/game";
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
  const connectedPlayers = lobby ? uniqueConnectedPlayers(lobby.players).length : 0;
  const balancesReady = lobby ? connectedPlayersReady(lobby.players) : false;
  const canStart = isHost && lobby?.status === "waiting" && balancesReady;
  const currentPairing = lobby ? getPairingForPlayer(lobby, playerId) : null;
  const myMove = currentPairing?.moves[playerId];
  const latestRoundResults = useMemo(() => {
    if (!lobby) return [];
    return lobby.resultsHistory.filter((result) => result.round === lobby.currentRound);
  }, [lobby]);
  const myRoundResults = useMemo(() => {
    return latestRoundResults.filter((result) => result.aPlayerId === playerId || result.bPlayerId === playerId);
  }, [latestRoundResults, playerId]);

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
        <p className="subtitle">Finding lobby {code}. Counting noodles and pretending this is regulated.</p>
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
        {lobby.status === "waiting" && (
          <>
            <div className="splitActions">
              <button className="button small" onClick={copyLink}>{copied ? "Copied" : "Copy Link"}</button>
              <button className="button small" onClick={() => setShowQr((value) => !value)}>{showQr ? "Hide QR" : "Show QR"}</button>
            </div>
            {showQr && link && <div className="qrWrap"><QRCodeSVG value={link} size={190} /></div>}
          </>
        )}
        <ClankerBanner lobby={lobby} />
        <button className="button small" onClick={toggleSound}>{soundEnabled ? "Sound On" : "Sound Off"}</button>
      </section>

      {lobby.status === "waiting" && (
        <WaitingRoom lobby={lobby} isHost={isHost} canStart={canStart} balancesReady={balancesReady} connectedPlayers={connectedPlayers} onStart={() => socket?.emit("game:start", { playerId, code })} />
      )}

      {lobby.status === "in_round" && currentPairing && (
        <RoundChoice lobby={lobby} pairing={currentPairing} playerId={playerId} myMove={myMove} submitMove={submitMove} />
      )}

      {(lobby.status === "between_rounds" || lobby.status === "finished") && (
        <ResultsView
          lobby={lobby}
          results={myRoundResults}
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
        {vengeful ? " Someone made it angry. Good luck explaining that to the noodle auditor." : " Nobody has annoyed the machine yet. A rare administrative miracle."}
      </p>
    </div>
  );
}

function WaitingRoom({ lobby, isHost, canStart, balancesReady, connectedPlayers, onStart }: { lobby: Lobby; isHost: boolean; canStart: boolean; balancesReady: boolean; connectedPlayers: number; onStart: () => void }) {
  const waitingForBalances = connectedPlayers >= 2 && !balancesReady;
  return (
    <section className="panel stack">
      <div className="row">
        <strong>Waiting Room</strong>
        <span className="pill">{connectedPlayers}/{lobby.maxPlayers}</span>
      </div>
      <p className="subtitle">{lobby.totalRounds} rounds. At least 2 connected people required. Bring courage, poor judgment, and a loose relationship with trust.</p>
      {isHost ? (
        <>
          <button className="button primary choiceButton" disabled={!canStart} onClick={onStart}>Start Game</button>
          {waitingForBalances && <p className="muted">Counting commissary balances. The noodle accountant refuses to be rushed.</p>}
        </>
      ) : (
        <p className="muted">Waiting for the host to press the big shiny button. Democracy has been cancelled.</p>
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
        <span className="muted">No move = Cooperate by panic</span>
      </div>
      <h2>You face {opponent}</h2>
      {myMove ? (
        <div className="lockCard">
          <strong>{myMove === "C" ? "Locked in. Suspiciously noble. Deeply unprofitable vibes." : "Locked in. Absolute menace behaviour. The commissary noticed."}</strong>
          <p className="muted">Waiting for everyone else to make their terrible little financial decision.</p>
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

function formatNoodlePacks(score: number) {
  return `${score} noodle packs${score < 0 ? " - in noodle debt" : ""}`;
}

function formatNetNoodlePacks(payout: number) {
  const net = payout - ROUND_ANTE_NOODLE_PACKS;
  return `${net >= 0 ? "+" : ""}${net} net`;
}

function formatGameDelta(delta: number) {
  return `${delta >= 0 ? "+" : ""}${delta} noodle packs`;
}

function netNoodlePacks(payout: number) {
  return payout - ROUND_ANTE_NOODLE_PACKS;
}

function ResultsView({ lobby, results, isHost, onNext, onRestart, soundEnabled }: { lobby: Lobby; results: RoundResult[]; isHost: boolean; onNext: () => void; onRestart: () => void; soundEnabled: boolean }) {
  const awards = lobby.status === "finished" ? buildAwards(lobby) : [];
  const betweenRoundSecondsLeft = useRoundCountdown(lobby.status === "between_rounds" ? lobby.roundEndsAt : null);
  const [revealStep, setRevealStep] = useState(results.length > 0 ? 1 : 0);
  const [visibleAwards, setVisibleAwards] = useState(0);
  const totalRevealSteps = results.length * 3;
  const currentRevealIndex = Math.max(0, Math.min(results.length - 1, Math.floor((revealStep - 1) / 3)));
  const currentRevealPhase = results.length > 0 ? ((Math.max(1, revealStep) - 1) % 3) + 1 : 0;
  const completedResultCount = Math.min(results.length, Math.floor(revealStep / 3));
  const resultsRevealComplete = results.length === 0 || revealStep >= totalRevealSteps;

  useEffect(() => {
    setRevealStep(results.length > 0 ? 1 : 0);
    setVisibleAwards(0);
    if (results.length === 0) return;

    let step = 1;
    const interval = window.setInterval(() => {
      step += 1;
      setRevealStep(Math.min(step, results.length * 3));
      if (step >= results.length * 3) window.clearInterval(interval);
    }, 780);

    return () => window.clearInterval(interval);
  }, [results]);

  useEffect(() => {
    if (!soundEnabled || results.length === 0 || revealStep === 0) return;
    const result = results[currentRevealIndex];
    if (!result) return;
    if (currentRevealPhase === 1) playTone(260, 0.08, "triangle");
    if (currentRevealPhase === 2) {
      const betrayal = result.aMove !== result.bMove;
      const bothDefected = result.aMove === "D" && result.bMove === "D";
      playTone(betrayal ? 170 : bothDefected ? 120 : 520, 0.1, betrayal || bothDefected ? "sawtooth" : "sine");
    }
    if (currentRevealPhase === 3) playOutcomeSound(result);
  }, [currentRevealIndex, currentRevealPhase, results, revealStep, soundEnabled]);

  useEffect(() => {
    if (lobby.status !== "finished" || awards.length === 0 || !resultsRevealComplete) return;
    setVisibleAwards(1);
    let index = 1;
    const interval = window.setInterval(() => {
      index += 1;
      setVisibleAwards(Math.min(index, awards.length));
      if (soundEnabled) playTone(560, 0.07, "sine");
      if (index >= awards.length) window.clearInterval(interval);
    }, 950);

    return () => window.clearInterval(interval);
  }, [awards.length, lobby.status, resultsRevealComplete, soundEnabled]);

  const currentReveal = results[currentRevealIndex];
  const awardsFinished = lobby.status !== "finished" || visibleAwards >= awards.length;
  const showAwards = resultsRevealComplete && awards.length > 0;
  const showLeaderboard = resultsRevealComplete && (lobby.status === "between_rounds" || awardsFinished);
  const showCurrentReveal = Boolean(currentReveal) && !(lobby.status === "finished" && resultsRevealComplete);

  return (
    <section className="panel stack">
      <h2>{lobby.status === "finished" ? "Final Results" : `Round ${lobby.currentRound} Results`}</h2>
      {showCurrentReveal && currentReveal && (
        <RevealStage lobby={lobby} result={currentReveal} phase={currentRevealPhase} />
      )}
      {results.length === 0 && (
        <p className="muted">No personal matchup to reveal here. Check the current leaderboard for the wider noodle damage.</p>
      )}
      {completedResultCount > 0 && lobby.status === "between_rounds" && (
        <p className="muted">Your matchup is revealed. The wider mess is reflected in the leaderboard.</p>
      )}
      {showAwards && (
        <div className="stack">
          <h2>{visibleAwards === 0 ? "The Noodle Kingpin is..." : "Awards"}</h2>
          {awards[0] && visibleAwards > 0 && (
            <div className="kingpinSpotlight">
              <span className="pill">Grand stash inspection complete</span>
              <strong>{awards[0].playerName}</strong>
              <p>{awards[0].detail}</p>
            </div>
          )}
          <ul className="list">
            {awards.slice(1, visibleAwards).map((award) => (
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
      {lobby.status === "between_rounds" && (
        <div className="row">
          <span className="pill timerPill">Next round in {betweenRoundSecondsLeft}s</span>
          {isHost ? <button className="button primary" onClick={onNext}>Next Round Now</button> : <span className="muted">Auto-advancing soon. The host may also wake up.</span>}
        </div>
      )}
      {lobby.status === "finished" && awardsFinished && isHost && <button className="button primary choiceButton" onClick={onRestart}>Play Again</button>}
      {lobby.status === "finished" && awardsFinished && !isHost && <p className="muted">Host can restart this lobby, or leave and pass the noodle crown.</p>}
    </section>
  );
}

function RevealStage({ lobby, result, phase }: { lobby: Lobby; result: RoundResult; phase: number }) {
  const aNet = netNoodlePacks(result.aPoints);
  const bNet = netNoodlePacks(result.bPoints);
  const aAfter = scoreForPlayer(lobby, result.aPlayerId);
  const bAfter = result.bPlayerId === "BOT" ? null : scoreForPlayer(lobby, result.bPlayerId);
  const aBefore = aAfter - aNet;
  const bBefore = bAfter === null ? null : bAfter - bNet;

  return (
    <div className={`revealStage ${outcomeClass(result)}`}>
      <span className="pill">Your matchup</span>
      <strong>{phase === 1 ? "Stash inspection..." : `${result.aName} vs ${result.bName}`}</strong>
      {phase === 1 && <p>The room goes quiet. Two noodle futures enter accounting.</p>}
      {phase >= 2 && (
        <div className="moveReveal">
          <span className={result.aMove === "C" ? "moveGood" : "moveBad"}>{result.aName}: {moveLabel(result.aMove)}</span>
          <span className={result.bMove === "C" ? "moveGood" : "moveBad"}>{result.bName}: {moveLabel(result.bMove)}</span>
        </div>
      )}
      {phase >= 3 && (
        <div className="payoutReveal">
          <h3>{outcomeTitle(result)}</h3>
          <p>{result.message}</p>
          <div className="payoutGrid">
            <NoodleDelta name={result.aName} before={aBefore} after={aAfter} net={aNet} />
            {bAfter === null || bBefore === null ? (
              <div className="deltaCard mutedDelta">
                <strong>{result.bName}</strong>
                <span>Machine accounting unavailable</span>
                <small>{formatNetNoodlePacks(result.bPoints)}</small>
              </div>
            ) : (
              <NoodleDelta name={result.bName} before={bBefore} after={bAfter} net={bNet} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NoodleDelta({ name, before, after, net }: { name: string; before: number; after: number; net: number }) {
  return (
    <div className={`deltaCard ${net >= 0 ? "deltaUp" : "deltaDown"}`}>
      <strong>{name}</strong>
      <span>{before} &rarr; {after}</span>
      <small>{net >= 0 ? "+" : ""}{net} noodle packs</small>
    </div>
  );
}

function outcomeTitle(result: RoundResult) {
  if (result.aMove === "C" && result.bMove === "C") return "Rare Peace Treaty";
  if (result.aMove === "D" && result.bMove === "D") return "Mutual Financial Ruin";
  return "Noodle Heist";
}

function outcomeClass(result: RoundResult) {
  if (result.aMove === "C" && result.bMove === "C") return "outcomePeace";
  if (result.aMove === "D" && result.bMove === "D") return "outcomeRuin";
  return "outcomeHeist";
}

function scoreForPlayer(lobby: Lobby, playerId: string) {
  const player = lobby.players.find((item) => item.playerId === playerId);
  return player?.score ?? 0;
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
              <p className="muted">{player.connected ? "online" : "reconnecting hopefully"} - {formatNoodlePacks(player.score)}</p>
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
            <th>This Game</th>
            <th>Current Stash</th>
            <th>C</th>
            <th>D</th>
            <th>Snake</th>
            <th>Hit</th>
          </tr>
        </thead>
        <tbody>
          {sortedPlayersByGameDelta(lobby).map((player, index) => (
            <tr className="scoreRow" key={player.playerId}>
              <td>{index + 1}</td>
              <td>{player.nickname}</td>
              <td><span className={`scorePop gameDelta ${gameNoodleDelta(player) >= 0 ? "deltaPositive" : "deltaNegative"}`}>{formatGameDelta(gameNoodleDelta(player))}</span></td>
              <td>{formatNoodlePacks(player.score)}</td>
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

function playOutcomeSound(result: RoundResult) {
  if (result.aMove === "C" && result.bMove === "C") {
    playTone(520, 0.08, "sine");
    window.setTimeout(() => playTone(660, 0.1, "sine"), 95);
    return;
  }

  if (result.aMove === "D" && result.bMove === "D") {
    playTone(145, 0.12, "sawtooth");
    window.setTimeout(() => playTone(110, 0.08, "triangle"), 130);
    return;
  }

  playTone(190, 0.12, "sawtooth");
  window.setTimeout(() => playTone(410, 0.08, "square"), 115);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
