"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import type { Snapshot, Ack } from "@/shared/protocol/commands";
type Session = {
  ownerId: string;
  name: string;
  controllerEpoch: number;
  csrfToken: string;
  features?: { externalBots: boolean; visualBots?: boolean };
};
export default function Play() {
  const [session, setSession] = useState<Session | null>(null),
    [name, setName] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [matches, setMatches] = useState<
      { id: string; phase: string; seatCount: number }[]
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(false);
  const socket = useRef<Socket | null>(null);
  const [matchId, setMatchId] = useState("");
  const activeMatch = useRef("");
  const [ownedBots, setOwnedBots] = useState<
      { id: string; name: string; online: boolean }[]
    >([]),
    [selectedBot, setSelectedBot] = useState("");
  const [tableMode, setTableMode] = useState<"human" | "mixed">("mixed");
  const [rounds, setRounds] = useState(10),
    [decisionSeconds, setDecisionSeconds] = useState(20);
  function selectMatch(id: string) {
    activeMatch.current = id;
    setMatchId(id);
  }
  function accept(next: Snapshot) {
    if (next.id !== activeMatch.current) return;
    setSnapshot((old) =>
      old && old.id === next.id && old.version > next.version ? old : next,
    );
  }

  async function request(path: string, data?: unknown) {
    const response = await fetch("/api/v1" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-csrf-token": session.csrfToken } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? "Request failed");
    return result;
  }
  useEffect(() => {
    fetch("/api/v1/session")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSession);
    selectMatch(new URLSearchParams(location.search).get("match") ?? "");
  }, []);
  useEffect(() => {
    if (!session) return;
    const s = io("/game-v1", { transports: ["websocket"] });
    socket.current = s;
    s.on("connect", () => setOnline(true));
    s.on("disconnect", () => setOnline(false));
    s.on("connect_error", (e) => setError(e.message));
    s.on("match.snapshot", (event) => {
      accept(event.payload);
    });
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [session?.ownerId]);
  useEffect(() => {
    if (!session || !matchId) return;
    const sync = () => {
      socket.current?.emit(
        "state.sync",
        { matchId },
        (r: { ok: boolean; snapshot: Snapshot }) => {
          if (r.ok) accept(r.snapshot);
        },
      );
    };
    sync();
    socket.current?.on("connect", sync);
    const timer = setInterval(() => {
      void request("/matches/" + matchId + "/observation")
        .then(accept)
        .catch((e) => setError(e.message));
    }, 1000);
    return () => {
      clearInterval(timer);
      socket.current?.off("connect", sync);
    };
  }, [session?.ownerId, matchId]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  async function acquire() {
    const r = await request("/controller/acquire", {});
    const next = { ...session!, controllerEpoch: r.controllerEpoch };
    setSession(next);
    return next;
  }
  async function send(type: string, payload: unknown) {
    if (!session || !snapshot) return;
    const c = {
      v: 1,
      commandId: crypto.randomUUID(),
      type,
      controllerEpoch: session.controllerEpoch,
      matchId: snapshot.id,
      seatId: snapshot.ownSeatId ?? undefined,
      round: snapshot.round,
      matchVersion: snapshot.version,
      payload,
    };
    let ack: Ack;
    try {
      ack = await request("/commands", c);
    } catch {
      ack = await request("/commands", c);
    }
    if (!ack.ok) throw new Error(ack.error?.message ?? "Command failed");
    accept(await request("/matches/" + snapshot.id + "/observation"));
  }
  useEffect(() => {
    if (session)
      void request("/bots")
        .then((r) => setOwnedBots(r.bots))
        .catch(() => {});
  }, [session?.ownerId]);
  async function list() {
    setMatches((await request("/matches")).matches);
  }
  async function create() {
    const control = await acquire();
    const { key } = await request("/command-keys", {});
    const created = await request("/matches", {
      commandId: crypto.randomUUID(),
      key,
      mode: selectedBot ? "mixed" : tableMode,
      ...(selectedBot ? { botId: selectedBot } : {}),
      controllerEpoch: control.controllerEpoch,
      settings: {
        rounds,
        decisionMs: decisionSeconds * 1000,
        revealMs: 5000,
        maxSeats: 8,
      },
    });
    selectMatch(created.id);
    history.replaceState(null, "", "/play?match=" + created.id);
    accept(await request("/matches/" + created.id + "/observation"));
  }
  async function join(id: string) {
    const control = await acquire();
    const { key } = await request("/command-keys", {});
    await request("/matches/" + id + "/join", {
      controllerEpoch: control.controllerEpoch,
      ...(selectedBot ? { botId: selectedBot } : {}),
      commandId: crypto.randomUUID(),
      key,
    });
    selectMatch(id);
    history.replaceState(null, "", "/play?match=" + id);
    accept(await request("/matches/" + id + "/observation"));
  }
  const own = snapshot?.seats.find((s) => s.id === snapshot.ownSeatId);
  const pair = snapshot?.pairs.find((p) => p.a === own?.id || p.b === own?.id);
  const opponent = snapshot?.seats.find(
    (s) => s.id === (pair?.a === own?.id ? pair?.b : pair?.a),
  );
  const seconds = snapshot?.deadline
    ? Math.max(0, Math.ceil((snapshot.deadline - Date.now()) / 1000))
    : 0;
  return (
    <main className="screen stack">
      <header>
        <h1 className="brand">Don't Drop The Soap</h1>
        <p className="subtitle">
          Trust is optional. The noodle accountant is not.
        </p>
      </header>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      {!session ? (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await request("/session/guest", { name });
              setSession(await request("/session"));
            });
          }}
        >
          <label className="label">
            Your alias
            <input
              className="input"
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            Enter
          </button>
          <p className="muted">
            Guest identity lives in this browser. Losing its cookie loses access
            to your guest and bots.
          </p>
        </form>
      ) : (
        <>
          <section className="panel stack">
            <div className="row">
              <strong>{session.name}</strong>
              <span>{online ? "Connected" : "Reconnecting"}</span>
            </div>
            <button
              className="button small"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await acquire();
                })
              }
            >
              Take control in this tab
            </button>
            <p className="muted">Taking control fences previous controllers.</p>
          </section>
          {!snapshot ? (
            <section className="panel stack">
              {(session.features?.externalBots ||
                session.features?.visualBots) && (
                <Link className="button" href="/bots">
                  Manage your bots
                </Link>
              )}
              <label className="label">
                Table type
                <select
                  className="input"
                  value={tableMode}
                  onChange={(e) => {
                    setTableMode(e.target.value as "human" | "mixed");
                    if (e.target.value === "human") setSelectedBot("");
                  }}
                >
                  <option value="mixed">Mixed: humans and bots</option>
                  <option value="human">Humans only</option>
                </select>
              </label>
              <label className="label">
                Enter as
                <select
                  className="input"
                  value={selectedBot}
                  onChange={(e) => setSelectedBot(e.target.value)}
                >
                  <option value="">Myself</option>
                  {ownedBots.map((b) => (
                    <option
                      key={b.id}
                      value={b.id}
                      disabled={tableMode === "human"}
                    >
                      {b.name} · {b.online ? "online" : "offline"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Rounds
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={50}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                />
              </label>
              <label className="label">
                Decision seconds
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={60}
                  value={decisionSeconds}
                  onChange={(e) => setDecisionSeconds(Number(e.target.value))}
                />
              </label>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act(create)}
              >
                Create table
              </button>
              <button className="button" onClick={() => void act(list)}>
                Find tables
              </button>
              {matches.map((m) => (
                <div className="row" key={m.id}>
                  <span>
                    {m.seatCount} seats · {m.phase}
                  </span>
                  <button
                    className="button small"
                    onClick={() => void act(() => join(m.id))}
                  >
                    Join {m.id.slice(0, 6)}
                  </button>
                </div>
              ))}
              {matchId && (
                <button
                  className="button"
                  onClick={() => void act(() => join(matchId))}
                >
                  Join linked table
                </button>
              )}
            </section>
          ) : (
            <section className="panel stack">
              <div className="row">
                <h2>
                  {snapshot.phase === "finished"
                    ? "Final results"
                    : "Round " +
                      snapshot.round +
                      "/" +
                      snapshot.settings.rounds}
                </h2>
                <span className="pill">
                  {snapshot.phase} · {seconds}s
                </span>
              </div>
              {snapshot.phase === "waiting" && (
                <>
                  {!own && snapshot.mode !== "human" && (
                    <label className="label">
                      Enter as
                      <select
                        className="input"
                        value={selectedBot}
                        onChange={(e) => setSelectedBot(e.target.value)}
                      >
                        <option value="">Myself</option>
                        {ownedBots.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} · {b.online ? "online" : "offline"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="muted">
                    Changes to seats or settings clear readiness. Ready up once
                    everyone has joined.
                  </p>
                  <button
                    className="button"
                    onClick={() => void act(() => join(snapshot.id))}
                    disabled={!!own}
                  >
                    Join this table
                  </button>
                  {own && (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void act(() =>
                          send("seat.ready", { ready: !own.ready }),
                        )
                      }
                    >
                      {own.ready ? "Not ready" : "Ready up"}
                    </button>
                  )}
                  {snapshot.hostOwnerId === session.ownerId && (
                    <button
                      className="button"
                      disabled={
                        busy ||
                        snapshot.seats.length < 2 ||
                        snapshot.seats.some((s) => !s.ready)
                      }
                      onClick={() => void act(() => send("match.start", {}))}
                    >
                      Start game
                    </button>
                  )}
                  <button
                    className="button small"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        location.origin + "/play?match=" + snapshot.id,
                      )
                    }
                  >
                    Copy invite
                  </button>
                </>
              )}
              {snapshot.phase === "collecting" &&
                own?.kind === "human" &&
                !own.abandoned && (
                  <>
                    <h2>You face {opponent?.name}</h2>
                    <p>
                      {snapshot.lockedCount}/{snapshot.seats.length} locked
                    </p>
                    {snapshot.ownMove ? (
                      <p role="status">
                        Locked:{" "}
                        {snapshot.ownMove === "C" ? "Cooperate" : "Betray"}
                      </p>
                    ) : (
                      <div className="splitActions">
                        <button
                          className="button good choiceButton"
                          disabled={busy}
                          onClick={() =>
                            void act(() => send("move.submit", { move: "C" }))
                          }
                        >
                          Cooperate
                        </button>
                        <button
                          className="button bad choiceButton"
                          disabled={busy}
                          onClick={() =>
                            void act(() => send("move.submit", { move: "D" }))
                          }
                        >
                          Betray
                        </button>
                      </div>
                    )}
                    <p className="muted">
                      First move locks. Missing moves become Cooperate at the
                      deadline.
                    </p>
                  </>
                )}
              {(snapshot.phase === "revealing" ||
                snapshot.phase === "finished") &&
                snapshot.results
                  .filter((r) => r.round === snapshot.round)
                  .map((r) => (
                    <div className="lockCard" key={r.pairId}>
                      <strong>
                        {snapshot.seats.find((s) => s.id === r.a)?.name}:{" "}
                        {r.aMove} vs{" "}
                        {snapshot.seats.find((s) => s.id === r.b)?.name}:{" "}
                        {r.bMove}
                      </strong>
                      <p>{r.message}</p>
                      <span>
                        {r.aNet >= 0 ? "+" : ""}
                        {r.aNet} / {r.bNet >= 0 ? "+" : ""}
                        {r.bNet} noodles
                      </span>
                    </div>
                  ))}
              {snapshot.historyExpired && (
                <p role="status">
                  Round details expired after 90 days. Final scores are
                  retained.
                </p>
              )}
              {snapshot.cancelReason === "empty" && (
                <p role="status">
                  This waiting room closed after 15 minutes without connected
                  participants. No points were credited. Start a new table to
                  play.
                </p>
              )}
              {snapshot.abortReason === "infrastructure" && (
                <p role="status">
                  Match ended after a service interruption. No points were
                  credited.
                </p>
              )}
              {snapshot.interruptions > 0 && (
                <p className="danger">
                  Service interrupted. Accepted moves were preserved and the
                  deadline renewed.
                </p>
              )}
              <ul className="list">
                {snapshot.seats.map((s) => (
                  <li className="listItem" key={s.id}>
                    <strong>
                      {s.name} {s.kind === "system" ? "(system bot)" : ""}
                    </strong>
                    <span>
                      {s.score} noodles ·{" "}
                      {s.abandoned ? "left" : s.ready ? "ready" : "not ready"}
                    </span>
                  </li>
                ))}
              </ul>
              {own &&
                !own.abandoned &&
                !["finished", "aborted", "cancelled"].includes(
                  snapshot.phase,
                ) && (
                  <>
                    <p className="muted">
                      Leaving an active game keeps your locked move and fills
                      future rounds with timeout Cooperate. Scores still settle.
                    </p>
                    <button
                      className="button"
                      onClick={() =>
                        void act(async () => {
                          await send("seat.leave", {});
                          setSnapshot(null);
                          selectMatch("");
                          history.replaceState(null, "", "/play");
                        })
                      }
                    >
                      Leave table
                    </button>
                  </>
                )}
              {["finished", "aborted", "cancelled"].includes(
                snapshot.phase,
              ) && (
                <button
                  className="button primary"
                  onClick={() => {
                    setSnapshot(null);
                    selectMatch("");
                    history.replaceState(null, "", "/play");
                  }}
                >
                  Back to tables
                </button>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
