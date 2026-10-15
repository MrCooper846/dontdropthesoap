"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import YardCanvas from "../../client/yard/YardCanvas";
import YardVoicePanel from "../../components/YardVoicePanel";
import YardMatchPanel from "../../components/YardMatchPanel";
import type {
  YardView,
  ChatMessage,
  Invitation,
  BrowserSession,
} from "../../shared/yard/types";
import type { Snapshot } from "../../shared/protocol/commands";
import { distance } from "../../shared/yard/map";
type Bot = { id: string; name: string; online: boolean; kind: string };
export default function YardPage() {
  const [admissionsPaused, setAdmissionsPaused] = useState(false);
  useEffect(() => {
    let stopped = false,
      pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/v1/service");
        if (response.ok) {
          const state = await response.json();
          if (!stopped) setAdmissionsPaused(state.matchesOpen === false);
        }
      } catch {
        /* Keep the last confirmed service state during reconnect. */
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const [session, setSession] = useState<BrowserSession | null>(null),
    [name, setName] = useState(""),
    [online, setOnline] = useState(false),
    [entered, setEntered] = useState(false),
    [view, setView] = useState<YardView | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [circleId, setCircleId] = useState(""),
    [match, setMatch] = useState<Snapshot | null>(null),
    [bots, setBots] = useState<Bot[]>([]),
    [botId, setBotId] = useState(""),
    [rounds, setRounds] = useState(10),
    [seconds, setSeconds] = useState(20),
    [maxSeats, setMaxSeats] = useState(8),
    [chat, setChat] = useState<ChatMessage[]>([]),
    [text, setText] = useState(""),
    [blocks, setBlocks] = useState<string[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [reportOwner, setReportOwner] = useState(""),
    [reason, setReason] = useState("");
  const socket = useRef<Socket | null>(null),
    sessionRef = useRef(session),
    enteredRef = useRef(false),
    matchRef = useRef(""),
    enterWork = useRef(false),
    seenInvites = useRef(new Set<string>()),
    inviteMatch = useRef("");
  sessionRef.current = session;
  async function api(path: string, data?: unknown, method = "POST") {
    const response = await fetch("/api/v1" + path, {
      method: data === undefined ? "GET" : method,
      headers: {
        "Content-Type": "application/json",
        ...(sessionRef.current
          ? { "x-csrf-token": sessionRef.current.csrfToken }
          : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? "Request failed");
    return result;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function rpc(event: string, input: unknown) {
    return new Promise<any>((resolve, reject) => {
      if (!socket.current?.connected) {
        reject(new Error("Connection unavailable"));
        return;
      }
      socket.current
        .timeout(5000)
        .emit(event, input, (error: Error | null, response: any) => {
          if (error) {
            reject(new Error("Connection timed out"));
            return;
          }
          if (!response?.ok) {
            reject(
              new Error(
                response?.error?.message ??
                  response?.error?.code ??
                  "Action rejected",
              ),
            );
            return;
          }
          resolve(response.result);
        });
    });
  }
  async function enter() {
    if (enterWork.current) return;
    enterWork.current = true;
    try {
      const control = await api("/controller/acquire", {});
      const next = {
        ...sessionRef.current!,
        controllerEpoch: control.controllerEpoch,
      };
      sessionRef.current = next;
      setSession(next);
      const result = await rpc("yard.enter", {
        controllerEpoch: next.controllerEpoch,
      });
      enteredRef.current = true;
      setEntered(true);
      setView(result.snapshot);
      setChat(result.chat);
      setBlocks((await api("/blocks")).blocks);
      if (matchRef.current) await watch(matchRef.current);
      else if (inviteMatch.current) {
        const requested = inviteMatch.current;
        inviteMatch.current = "";
        const observed = await api("/matches/" + requested + "/observation");
        setCircleId(observed.circleId ?? "");
        await watch(requested);
      }
    } finally {
      enterWork.current = false;
    }
  }
  function acceptMatch(next: Snapshot) {
    if (next.id !== matchRef.current) return;
    setMatch((old) =>
      old && old.id === next.id && old.version > next.version ? old : next,
    );
  }
  async function watch(id: string) {
    matchRef.current = id;
    acceptMatch(await api("/matches/" + id + "/observation"));
    socket.current?.emit("state.sync", { matchId: id }, (r: any) => {
      if (r.ok) acceptMatch(r.snapshot);
    });
  }
  async function inspect(id: string) {
    setCircleId(id);
    const selected = view?.circles.find((c) => c.id === id);
    if (selected?.mode === "human") setBotId("");
    if (selected?.matchId) await watch(selected.matchId);
    else {
      matchRef.current = "";
      setMatch(null);
    }
  }
  useEffect(() => {
    setBotId(new URLSearchParams(location.search).get("bot") ?? "");
    inviteMatch.current =
      new URLSearchParams(location.search).get("match") ?? "";
    fetch("/api/v1/session")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSession)
      .catch(() => setError("Cannot reach the game service"));
  }, []);
  useEffect(() => {
    if (!session) return;
    const s = io("/game-v1", { transports: ["websocket"] });
    socket.current = s;
    let retryTimer: ReturnType<typeof setTimeout> | undefined,
      retryMs = 1000;
    s.on("connect", () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      retryMs = 1000;
      setOnline(true);
      setError("");
      if (enteredRef.current) void run(enter);
    });
    s.on("disconnect", () => setOnline(false));
    s.on(
      "connect_error",
      (
        error: Error & { data?: { message?: unknown; retryable?: boolean } },
      ) => {
        setOnline(false);
        setError(
          typeof error.data?.message === "string"
            ? error.data.message
            : "Connection unavailable",
        );
        if (error.data?.retryable && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            s.connect();
          }, retryMs);
          retryMs = Math.min(5000, retryMs * 2);
        }
      },
    );
    s.on("yard.positions", (next: YardView) =>
      setView((old) =>
        !old || old.epoch !== next.epoch || next.tick >= old.tick ? next : old,
      ),
    );
    s.on("match.snapshot", (event) => acceptMatch(event.payload));
    s.on("chat.message", (message: ChatMessage) =>
      setChat((old) =>
        [
          ...old.filter(
            (m) => Date.now() - m.sentAt <= 30000 && m.id !== message.id,
          ),
          message,
        ].slice(-100),
      ),
    );
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      s.disconnect();
      socket.current = null;
    };
  }, [session?.ownerId]);
  useEffect(() => {
    if (!entered || !session) return;
    let cancelled = false;
    const update = async () => {
      try {
        const [inbox, owned] = await Promise.all([
          api("/challenges"),
          session.features.externalBots || session.features.visualBots
            ? api("/bots")
            : Promise.resolve({ bots: [] }),
        ]);
        if (cancelled) return;
        setInvites(inbox.challenges);
        setBots(owned.bots);
        const accepted = inbox.challenges.find(
          (i: Invitation) =>
            i.status === "accepted" &&
            i.match_id &&
            !seenInvites.current.has(i.id),
        );
        if (accepted) {
          seenInvites.current.add(accepted.id);
          setCircleId(accepted.circle_id);
          await watch(accepted.match_id);
        }
        if (matchRef.current)
          acceptMatch(
            await api("/matches/" + matchRef.current + "/observation"),
          );
      } catch (e) {
        if (!cancelled && online)
          setError(e instanceof Error ? e.message : String(e));
      }
    };
    void update();
    const timer = setInterval(() => void update(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [entered, session?.ownerId, online]);
  async function resource(path: string, payload: unknown) {
    const { key } = await api("/command-keys", {});
    return api(path, {
      commandId: crypto.randomUUID(),
      key,
      controllerEpoch: sessionRef.current!.controllerEpoch,
      payload,
    });
  }
  async function joinCircle() {
    const circle = view!.circles.find((c) => c.id === circleId)!;
    const { key } = await api("/command-keys", {});
    const c = {
      key,
      commandId: crypto.randomUUID(),
      controllerEpoch: sessionRef.current!.controllerEpoch,
      ...(botId ? { botId } : {}),
    };
    if (circle.matchId) {
      await api("/matches/" + circle.matchId + "/join", c);
      await watch(circle.matchId);
    } else {
      const created = await api("/matches", {
        ...c,
        circleId: circle.id,
        mode: circle.mode,
        settings: {
          rounds,
          decisionMs: seconds * 1000,
          revealMs: 5000,
          maxSeats,
        },
      });
      await watch(created.id);
    }
  }
  async function command(type: string, payload: unknown) {
    if (!match) return;
    const c = {
      v: 1,
      commandId: crypto.randomUUID(),
      controllerEpoch: sessionRef.current!.controllerEpoch,
      type,
      matchId: match.id,
      round: match.round,
      seatId: match.ownSeatId ?? undefined,
      matchVersion: match.version,
      payload,
    };
    let result;
    try {
      result = await api("/commands", c);
    } catch {
      result = await api("/commands", c);
    }
    if (!result.ok)
      throw new Error(result.error?.message ?? "Command rejected");
    acceptMatch(await api("/matches/" + match.id + "/observation"));
  }
  function motion(payload: { seq: number; axisX: number; axisY: number }) {
    if (!enteredRef.current || !sessionRef.current) return;
    socket.current?.emit(
      "yard.input",
      { controllerEpoch: sessionRef.current.controllerEpoch, payload },
      (r: any) => {
        if (r?.error?.code === "CONTROLLER_STALE") {
          enteredRef.current = false;
          setEntered(false);
          setError(
            "Another tab took control. Enter again to take control here.",
          );
        }
      },
    );
  }
  const me = view?.players.find((p) => p.ownerId === session?.ownerId),
    selected = view?.circles.find((c) => c.id === circleId),
    near = !!me && !!selected && distance(me, selected) <= selected.radius + 32;
  return (
    <main className="yard-page">
      {admissionsPaused && (
        <p role="status">
          New games are paused for maintenance. Existing games can finish; the
          yard and nearby chat remain open.
        </p>
      )}
      <header className="yard-header">
        <div>
          <span className="yard-eyebrow">THE NOODLE ECONOMY</span>
          <h1>Don't Drop The Soap</h1>
          <p>Make friends. Make questionable financial decisions.</p>
        </div>
        <div className="yard-header-actions">
          {session && (
            <span className="pill">
              {session.name} · {online ? "connected" : "reconnecting"}
            </span>
          )}
          {session?.features.league && (
            <Link className="button small" href="/leagues">
              Bot league
            </Link>
          )}
          <Link className="button small" href="/bots">
            Your bots
          </Link>
        </div>
      </header>
      {error && (
        <p role="alert" className="danger yard-alert">
          {error}
        </p>
      )}
      {!session ? (
        <form
          className="panel stack yard-welcome"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api("/session/guest", { name });
              const s = await api("/session");
              sessionRef.current = s;
              setSession(s);
            });
          }}
        >
          <h2>Your yard alias</h2>
          <label className="label">
            Nickname
            <input
              className="input"
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            Save alias
          </button>
          <p className="muted">
            This guest lives in your browser cookie. Losing it loses access to
            the guest and owned bots.
          </p>
        </form>
      ) : !session.features.yard ? (
        <section className="panel">
          <p>The yard is disabled in this service configuration.</p>
          <Link href="/play">Open match demo</Link>
        </section>
      ) : !entered ? (
        <section className="panel stack yard-welcome">
          <h2>Welcome back, {session.name}</h2>
          <p>
            Walk up to a circle, join personally or enter a bot, and stay for
            the fallout.
          </p>
          <button
            className="button primary"
            disabled={busy || !online}
            onClick={() => void run(enter)}
          >
            Enter yard
          </button>
        </section>
      ) : (
        view && (
          <>
            <div className="yard-layout">
              <div className="yard-main">
                <YardCanvas
                  view={view}
                  ownerId={session.ownerId}
                  controlEpoch={session.controllerEpoch}
                  enabled={online && entered}
                  onInput={motion}
                  onInspect={(id) => void run(() => inspect(id))}
                />
                <section className="panel stack nearby-chat">
                  <div className="row">
                    <h2>Nearby text</h2>
                    <span className="pill">8 tiles · last 30s</span>
                  </div>
                  <p className="muted">
                    Player claims can be bluffs. Official outcomes appear at the
                    table.
                  </p>
                  <ol className="list chat-list" aria-label="Nearby messages">
                    {chat
                      .filter(
                        (m) =>
                          Date.now() - m.sentAt <= 30000 &&
                          !blocks.includes(m.ownerId),
                      )
                      .map((m) => (
                        <li key={m.id}>
                          <strong>{m.name}: </strong>
                          <span>{m.text}</span>
                        </li>
                      ))}
                  </ol>
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await rpc("chat.send", {
                          text,
                          controllerEpoch: sessionRef.current!.controllerEpoch,
                        });
                        setText("");
                      });
                    }}
                  >
                    <input
                      aria-label="Nearby message"
                      className="input"
                      maxLength={280}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Trust me. What could go wrong?"
                    />
                    <button
                      className="button small"
                      disabled={busy || !text.trim()}
                    >
                      Send
                    </button>
                  </form>
                </section>
              </div>
              <aside className="yard-sidebar">
                {session.features.voice && (
                  <YardVoicePanel
                    socket={socket.current}
                    epoch={session.controllerEpoch}
                    players={view.players}
                  />
                )}
                <section className="panel stack">
                  <h2>Match circles</h2>
                  <p className="muted">
                    Walk nearer to enter. Inspect or watch without taking a
                    seat.
                  </p>
                  {view.circles.map((c) => (
                    <button
                      key={c.id}
                      className={
                        "circle-card " + (c.id === circleId ? "selected" : "")
                      }
                      onClick={() => void run(() => inspect(c.id))}
                    >
                      <strong>{c.name}</strong>
                      <span>
                        {c.seatCount}/{c.settings.maxSeats} · {c.mode} ·{" "}
                        {c.phase}
                      </span>
                      <small>
                        {me
                          ? Math.round(distance(me, c) / 32) + " tiles away"
                          : ""}
                      </small>
                    </button>
                  ))}
                </section>
                {selected && (
                  <section
                    className="panel stack"
                    aria-label="Circle inspector"
                  >
                    <div className="row">
                      <h2>{selected.name}</h2>
                      <button
                        className="button small"
                        onClick={() => {
                          setCircleId("");
                          matchRef.current = "";
                          setMatch(null);
                        }}
                      >
                        Close circle
                      </button>
                    </div>
                    <p>
                      {selected.settings.rounds} rounds ·{" "}
                      {selected.settings.decisionMs / 1000}s decisions
                    </p>
                    {(!match || !match.ownSeatId) &&
                      selected.phase !== "collecting" &&
                      selected.phase !== "revealing" &&
                      selected.phase !== "countdown" && (
                        <>
                          <label className="label">
                            Enter as
                            <select
                              className="input"
                              value={botId}
                              onChange={(e) => setBotId(e.target.value)}
                            >
                              <option value="">Myself</option>
                              {selected.mode !== "human" &&
                                bots.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    {b.name} ·{" "}
                                    {b.kind === "visual"
                                      ? "visual · ready"
                                      : b.online
                                        ? "online"
                                        : "offline"}
                                  </option>
                                ))}
                            </select>
                          </label>
                          {!selected.matchId && (
                            <>
                              <label className="label">
                                Rounds
                                <input
                                  className="input"
                                  type="number"
                                  min={5}
                                  max={50}
                                  value={rounds}
                                  onChange={(e) =>
                                    setRounds(Number(e.target.value))
                                  }
                                />
                              </label>
                              <label className="label">
                                Decision seconds
                                <input
                                  className="input"
                                  type="number"
                                  min={5}
                                  max={60}
                                  value={seconds}
                                  onChange={(e) =>
                                    setSeconds(Number(e.target.value))
                                  }
                                />
                              </label>
                              <label className="label">
                                Seats
                                <input
                                  className="input"
                                  type="number"
                                  min={2}
                                  max={8}
                                  value={maxSeats}
                                  onChange={(e) =>
                                    setMaxSeats(Number(e.target.value))
                                  }
                                />
                              </label>
                            </>
                          )}
                          <button
                            className="button primary"
                            disabled={
                              busy ||
                              !near ||
                              selected.seatCount >= selected.settings.maxSeats
                            }
                            onClick={() => void run(joinCircle)}
                          >
                            {selected.matchId
                              ? "Join circle"
                              : "Create circle match"}
                          </button>
                          {!near && (
                            <p className="muted">
                              Move nearer to this circle to enter.
                            </p>
                          )}
                        </>
                      )}
                    {selected.matchId && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void run(() => watch(selected.matchId!))}
                      >
                        Watch match
                      </button>
                    )}
                  </section>
                )}
                {match && (
                  <YardMatchPanel
                    match={match}
                    session={session}
                    busy={busy}
                    onCommand={(type, payload) =>
                      void run(() => command(type, payload))
                    }
                    onClose={() => {
                      matchRef.current = "";
                      setMatch(null);
                    }}
                  />
                )}
                <section className="panel stack">
                  <h2>People in the yard</h2>
                  {view.players
                    .filter((p) => p.ownerId !== session.ownerId && p.connected)
                    .map((p) => (
                      <div className="yard-person" key={p.ownerId}>
                        <strong>{p.name}</strong>
                        <div className="row">
                          <button
                            className="button small"
                            disabled={busy || !near || distance(me!, p) > 256}
                            onClick={() =>
                              void run(async () => {
                                await resource("/challenges", {
                                  ownerId: p.ownerId,
                                  ...(botId ? { botId } : {}),
                                  circleId,
                                  settings: {
                                    rounds,
                                    decisionMs: seconds * 1000,
                                    revealMs: 5000,
                                    maxSeats: 2,
                                  },
                                });
                              })
                            }
                          >
                            Challenge {p.name}
                          </button>
                          <button
                            className="button small"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (blocks.includes(p.ownerId))
                                  await api(
                                    "/blocks/" + p.ownerId,
                                    {
                                      controllerEpoch:
                                        sessionRef.current!.controllerEpoch,
                                    },
                                    "DELETE",
                                  );
                                else
                                  await api("/blocks", {
                                    ownerId: p.ownerId,
                                    controllerEpoch:
                                      sessionRef.current!.controllerEpoch,
                                  });
                                setBlocks((await api("/blocks")).blocks);
                              })
                            }
                          >
                            {blocks.includes(p.ownerId) ? "Unblock" : "Block"}{" "}
                            {p.name}
                          </button>
                          <button
                            className="button small"
                            onClick={() => {
                              setReportOwner(p.ownerId);
                              setReason("");
                            }}
                          >
                            Report {p.name}
                          </button>
                        </div>
                      </div>
                    ))}
                </section>
                {invites
                  .filter(
                    (i) =>
                      i.target_id === session.ownerId && i.status === "pending",
                  )
                  .map((i) => (
                    <section className="panel stack" key={i.id}>
                      <h2>Challenge from {i.creator_name}</h2>
                      <label className="label">
                        Accept as
                        <select
                          className="input"
                          value={botId}
                          onChange={(e) => setBotId(e.target.value)}
                        >
                          <option value="">Myself</option>
                          {bots.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        Meet at{" "}
                        {view.circles.find((c) => c.id === i.circle_id)?.name}.
                        Invitation expires in{" "}
                        {Math.max(
                          0,
                          Math.ceil(
                            (new Date(i.expires_at).getTime() - Date.now()) /
                              1000,
                          ),
                        )}
                        s.
                      </p>
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result = await resource(
                              "/challenges/" + i.id + "/accept",
                              botId ? { botId } : {},
                            );
                            seenInvites.current.add(i.id);
                            setCircleId(i.circle_id);
                            await watch(result.matchId);
                          })
                        }
                      >
                        Accept challenge
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await resource(
                              "/challenges/" + i.id + "/decline",
                              {},
                            );
                          })
                        }
                      >
                        Decline challenge
                      </button>
                    </section>
                  ))}
                {reportOwner && (
                  <form
                    className="panel stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await api("/reports", {
                          ownerId: reportOwner,
                          reason,
                          controllerEpoch: sessionRef.current!.controllerEpoch,
                        });
                        setReportOwner("");
                        setReason("");
                      });
                    }}
                  >
                    <h2>Report a player</h2>
                    <label className="label">
                      Reason
                      <textarea
                        className="input"
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={busy || !reason.trim()}
                    >
                      Submit report
                    </button>
                    <button
                      className="button"
                      type="button"
                      onClick={() => setReportOwner("")}
                    >
                      Cancel report
                    </button>
                  </form>
                )}
              </aside>
            </div>
          </>
        )
      )}
    </main>
  );
}
