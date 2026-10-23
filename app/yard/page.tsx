"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { useMatchCountdown } from "../../client/useMatchCountdown";
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
import {
  type OwnedMatch,
  preferredOwnedMatch,
  matchSettingsError,
  isActiveMatch,
} from "../../shared/yard/matches";
type Bot = { id: string; name: string; online: boolean; kind: string };
export default function YardPage() {
  type Pane =
    "tables" | "chat" | "people" | "circle" | "match" | "menu" | "voice" | null;
  const [pane, setPane] = useState<Pane>(null);
  const shellRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      shellRef.current?.style.setProperty(
        "--yard-viewport-height",
        viewport.height + "px",
      );
      shellRef.current?.style.setProperty(
        "--yard-viewport-top",
        viewport.offsetTop + "px",
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const announcedRound = useRef("");
  function openPane(next: Pane) {
    if (document.activeElement instanceof HTMLElement)
      triggerRef.current = document.activeElement;
    setPane(next);
  }
  useEffect(() => {
    if (pane && pane !== "voice")
      panelRef.current?.focus({ preventScroll: true });
    if (!pane) {
      const target = triggerRef.current?.getClientRects().length
        ? triggerRef.current
        : document.querySelector<HTMLElement>(".yard-dock button");
      target?.focus({ preventScroll: true });
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPane(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [pane]);
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
    [ownedMatch, setOwnedMatch] = useState<Snapshot | null>(null),
    [spectatedMatch, setSpectatedMatch] = useState<Snapshot | null>(null),
    [myMatches, setMyMatches] = useState<OwnedMatch[]>([]),
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
    ownedMatchRef = useRef(""),
    spectatedMatchRef = useRef(""),
    myMatchesRead = useRef(0),
    restoreOwnedView = useRef(false),
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
  const blockRead = useRef(0);
  async function refreshOwnBlocks() {
    const revision = ++blockRead.current;
    const response = await api("/blocks?scope=yard");
    if (revision === blockRead.current) setBlocks(response.blocks);
  }
  const blockMembers =
    view?.players
      .map((p) => p.ownerId)
      .sort()
      .join(",") ?? "";
  useEffect(() => {
    if (!entered || !online) return;
    let live = true;
    void refreshOwnBlocks().catch(() => {
      if (live) setError("Cannot refresh block controls");
    });
    return () => {
      live = false;
      blockRead.current++;
    };
  }, [entered, online, blockMembers, session?.ownerId]);
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
      await refreshOwnBlocks();
      if (matchRef.current) await watch(matchRef.current);
      else if (inviteMatch.current) {
        const requested = inviteMatch.current;
        inviteMatch.current = "";
        const observed = await api("/matches/" + requested + "/observation");
        setCircleId(observed.circleId ?? "");
        await watch(requested);
      }
      await refreshMyMatches(true);
    } finally {
      enterWork.current = false;
    }
  }
  function acceptMatch(next: Snapshot) {
    if (!next.ownSeatId && next.id === matchRef.current)
      spectatedMatchRef.current = next.id;
    if (next.ownSeatId && next.id === spectatedMatchRef.current)
      spectatedMatchRef.current = "";
    setSpectatedMatch((old) => {
      if (next.ownSeatId) return old?.id === next.id ? null : old;
      if (next.id !== matchRef.current && old?.id !== next.id) return old;
      return old?.id === next.id && old.version > next.version ? old : next;
    });
    if (next.id === ownedMatchRef.current)
      setOwnedMatch((old) =>
        old && old.id === next.id && old.version > next.version ? old : next,
      );
    if (next.id !== matchRef.current) return;
    setMatch((old) =>
      old && old.id === next.id && old.version > next.version ? old : next,
    );
  }
  async function refreshMyMatches(restore = false) {
    if (restore) restoreOwnedView.current = true;
    const read = ++myMatchesRead.current;
    const response = await api("/matches/mine");
    if (read !== myMatchesRead.current) return;
    const matches = response.matches as OwnedMatch[];
    setMyMatches(matches);
    const preferred = preferredOwnedMatch(matches, ownedMatchRef.current);
    if (!preferred) {
      ownedMatchRef.current = "";
      restoreOwnedView.current = false;
      setOwnedMatch(null);
      return;
    }
    ownedMatchRef.current = preferred.id;
    const next = await api("/matches/" + preferred.id + "/observation");
    if (read !== myMatchesRead.current) return;
    acceptMatch(next);
    if (restoreOwnedView.current) {
      restoreOwnedView.current = false;
      if (!matchRef.current) await watch(preferred.id);
    }
  }
  async function watch(id: string) {
    openPane("match");
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
    openPane("circle");
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
        if (
          spectatedMatchRef.current &&
          spectatedMatchRef.current !== matchRef.current
        )
          acceptMatch(
            await api("/matches/" + spectatedMatchRef.current + "/observation"),
          );
        await refreshMyMatches();
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
    if (!circle.matchId && settingsError) throw new Error(settingsError);
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
    await refreshMyMatches();
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
    if (
      !enteredRef.current ||
      !sessionRef.current ||
      !socket.current?.connected
    )
      return;
    // Movement is latest-state intent, not a durable command. Never buffer old
    // input offline or retain an acknowledgement indefinitely after a lost frame.
    socket.current.volatile
      .timeout(1000)
      .emit(
        "yard.input",
        { controllerEpoch: sessionRef.current.controllerEpoch, payload },
        (_error: Error | null, r: any) => {
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
  useEffect(() => {
    const own = ownedMatch?.seats.find(
      (seat) => seat.id === ownedMatch.ownSeatId,
    );
    const key =
      ownedMatch?.id + ":" + ownedMatch?.round + ":" + ownedMatch?.phase;
    if (
      own?.kind === "human" &&
      !own.abandoned &&
      ownedMatch?.phase === "collecting" &&
      announcedRound.current !== key
    ) {
      announcedRound.current = key;
      void run(() => watch(ownedMatch.id));
    }
  }, [
    ownedMatch?.id,
    ownedMatch?.round,
    ownedMatch?.phase,
    ownedMatch?.ownSeatId,
  ]);
  const settingsError = matchSettingsError(rounds, seconds, maxSeats);
  const me = view?.players.find((p) => p.ownerId === session?.ownerId),
    selected = view?.circles.find((c) => c.id === circleId),
    near = !!me && !!selected && distance(me, selected) <= selected.radius + 32;
  return (
    <main
      ref={shellRef}
      className={"yard-page" + (entered ? " yard-active" : "")}
    >
      {admissionsPaused && (
        <p role="status">
          New games are paused for maintenance. Existing games can finish; the
          yard and nearby chat remain open.
        </p>
      )}
      {entered ? (
        <header className="yard-status-bar">
          <Link
            className="yard-brand"
            href="/yard"
            aria-label="Don't Drop the Soap home"
          >
            <span className="yard-brand-mark" aria-hidden="true">
              S
            </span>
            <span className="yard-brand-name">
              DON’T DROP
              <br />
              THE SOAP
            </span>
          </Link>
          <nav className="yard-primary-nav" aria-label="Game navigation">
            <button
              className="button small"
              aria-current="page"
              onClick={() => setPane(null)}
            >
              The yard
            </button>
            <Link
              className="button small"
              href={
                "/bots/build" + (ownedMatch ? "?match=" + ownedMatch.id : "")
              }
            >
              Bot workshop
            </Link>
            <Link className="button small" href="/restaurant">
              Restaurant
            </Link>
          </nav>
          <span className="yard-identity" role="status">
            <span
              className={"yard-online-dot" + (online ? " is-online" : "")}
              aria-hidden="true"
            />
            {session?.name}
            <small>{online ? "Connected" : "Reconnecting…"}</small>
          </span>
          <button
            className="button small"
            aria-expanded={pane === "menu"}
            onClick={() => openPane(pane === "menu" ? null : "menu")}
          >
            Menu
          </button>
        </header>
      ) : (
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
      )}
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
            <div
              className={
                "yard-layout" + (pane && pane !== "voice" ? " has-pane" : "")
              }
            >
              <div className="yard-main">
                <div className="yard-map-heading" aria-hidden="true">
                  <div>
                    <span className="yard-eyebrow">REC TIME</span>
                    <h1>The yard</h1>
                  </div>
                  <span className="yard-map-count">
                    {view.players.filter((player) => player.connected).length}{" "}
                    in the yard
                  </span>
                </div>
                <YardCanvas
                  view={view}
                  ownerId={session.ownerId}
                  controlEpoch={session.controllerEpoch}
                  enabled={online && entered && !pane}
                  onInput={motion}
                  onInspect={(id) => void run(() => inspect(id))}
                />
                {session.features.voice && (
                  <div className="yard-voice-anchor">
                    <YardVoicePanel
                      socket={socket.current}
                      epoch={session.controllerEpoch}
                      players={view.players}
                      compact
                      expanded={pane === "voice"}
                      onToggle={() =>
                        openPane(pane === "voice" ? null : "voice")
                      }
                    />
                  </div>
                )}
              </div>
              <aside
                id="yard-context-panel"
                className="yard-sidebar"
                ref={panelRef}
                tabIndex={-1}
                aria-label="Yard controls"
                hidden={!pane || pane === "voice"}
              >
                <nav className="yard-panel-tabs" aria-label="Table navigation">
                  {(ownedMatch || match?.ownSeatId) && (
                    <button
                      className="yard-panel-tab"
                      aria-label="Open my table"
                      aria-pressed={pane === "match" && !!match?.ownSeatId}
                      onClick={() =>
                        void run(() => watch((ownedMatch || match)!.id))
                      }
                    >
                      My table
                    </button>
                  )}
                  <button
                    className="yard-panel-tab"
                    aria-pressed={pane === "tables" || pane === "circle"}
                    onClick={() => openPane("tables")}
                  >
                    Find a table
                  </button>
                  {spectatedMatch && (
                    <button
                      className="yard-panel-tab"
                      aria-label="Open watched table"
                      aria-pressed={
                        pane === "match" &&
                        match?.id === spectatedMatch.id &&
                        !match?.ownSeatId
                      }
                      onClick={() => void run(() => watch(spectatedMatch.id))}
                    >
                      Watching
                    </button>
                  )}
                </nav>
                <div className="yard-pane-heading" hidden={pane === "match"}>
                  <strong>
                    {pane === "match"
                      ? "Your table"
                      : pane === "circle"
                        ? "Circle"
                        : pane === "chat"
                          ? "Nearby chat"
                          : pane === "people"
                            ? "People & challenges"
                            : pane === "menu"
                              ? "Yard menu"
                              : "Tables"}
                  </strong>
                  <button
                    className="button small"
                    onClick={() => setPane(null)}
                  >
                    Close panel
                  </button>
                </div>
                <section className="panel stack" hidden={pane !== "menu"}>
                  <Link className="button" href="/bots">
                    Your bots
                  </Link>
                  {session.features.league && (
                    <Link className="button" href="/leagues">
                      Bot league
                    </Link>
                  )}
                  <p>
                    Walk with the joystick or WASD/arrows. Approach a circle and
                    choose Interact, or browse Tables.
                  </p>
                  <p className="muted">
                    Your guest identity lives in this browser cookie. Losing it
                    loses access to your bots.
                  </p>
                </section>
                <section
                  className="panel stack nearby-chat"
                  hidden={pane !== "chat"}
                >
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
                <section className="panel stack" hidden={pane !== "tables"}>
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
                  <h3>Your recent tables</h3>
                  <p className="muted">
                    Your active games and latest results stay here when you
                    leave the yard or edit a bot.
                  </p>
                  {myMatches.length === 0 && <p>No tables yet.</p>}
                  {myMatches.map((recent) => (
                    <button
                      className="button"
                      key={recent.id}
                      onClick={() => void run(() => watch(recent.id))}
                    >
                      Open {recent.name} ·{" "}
                      {view.circles.find((c) => c.id === recent.circleId)
                        ?.name ?? "Table"}{" "}
                      ·{" "}
                      {isActiveMatch(recent.phase)
                        ? recent.phase
                        : recent.phase === "finished"
                          ? "results"
                          : recent.phase}{" "}
                      · {recent.score} noodles
                      <small>
                        {new Date(recent.createdAt).toLocaleString()}
                      </small>
                    </button>
                  ))}
                </section>
                {selected && (
                  <section
                    className="panel stack"
                    aria-label="Circle inspector"
                    hidden={pane !== "circle"}
                  >
                    <div className="row">
                      <h2>{selected.name}</h2>
                      <button
                        className="button small"
                        onClick={() => {
                          setPane(null);
                        }}
                      >
                        Close circle
                      </button>
                    </div>
                    <p>
                      {selected.settings.rounds} rounds ·{" "}
                      {selected.settings.decisionMs / 1000}s decisions
                    </p>
                    {(!match ||
                      match.id !== selected.matchId ||
                      !match.ownSeatId) &&
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
                            <details className="yard-settings">
                              <summary>Match settings</summary>
                              <label className="label">
                                Rounds
                                <input
                                  className="input"
                                  type="number"
                                  min={5}
                                  max={50}
                                  value={rounds}
                                  aria-invalid={
                                    !Number.isInteger(rounds) ||
                                    rounds < 5 ||
                                    rounds > 50
                                  }
                                  aria-describedby="yard-settings-error"
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
                                  aria-invalid={
                                    !Number.isInteger(seconds) ||
                                    seconds < 5 ||
                                    seconds > 60
                                  }
                                  aria-describedby="yard-settings-error"
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
                                  aria-invalid={
                                    !Number.isInteger(maxSeats) ||
                                    maxSeats < 2 ||
                                    maxSeats > 8
                                  }
                                  aria-describedby="yard-settings-error"
                                  onChange={(e) =>
                                    setMaxSeats(Number(e.target.value))
                                  }
                                />
                              </label>
                            </details>
                          )}
                          {!selected.matchId && settingsError && (
                            <p
                              id="yard-settings-error"
                              role="status"
                              className="danger"
                            >
                              {settingsError}
                            </p>
                          )}
                          <button
                            className="button primary"
                            disabled={
                              busy ||
                              !near ||
                              (!selected.matchId && !!settingsError) ||
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
                  <div hidden={pane !== "match"}>
                    <YardMatchPanel
                      match={match}
                      session={session}
                      busy={busy}
                      onCommand={(type, payload) =>
                        void run(() => command(type, payload))
                      }
                      onClose={() => setPane(null)}
                    />
                  </div>
                )}
                <section className="panel stack" hidden={pane !== "people"}>
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
                                if (settingsError)
                                  throw new Error(settingsError);
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
                                await refreshOwnBlocks();
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
                    <section
                      className="panel stack"
                      key={i.id}
                      hidden={pane !== "people"}
                    >
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
                    hidden={pane !== "people"}
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
            <nav className="yard-dock" aria-label="Yard actions">
              {[ownedMatch || (match?.ownSeatId ? match : null), spectatedMatch]
                .filter((target): target is Snapshot => target !== null)
                .map((target) => (
                  <TableDockButton
                    key={target.id}
                    match={target}
                    open={pane === "match" && match?.id === target.id}
                    onToggle={() => {
                      if (pane === "match" && match?.id === target.id)
                        setPane(null);
                      else void run(() => watch(target.id));
                    }}
                  />
                ))}
              {(["tables", "chat", "people"] as const).map((item) => (
                <button
                  key={item}
                  className="button small"
                  aria-controls="yard-context-panel"
                  aria-expanded={pane === item}
                  onClick={() => openPane(pane === item ? null : item)}
                >
                  {item === "chat"
                    ? "Chat"
                    : item === "tables"
                      ? "Tables"
                      : "People"}
                  {item === "people" &&
                  invites.some(
                    (i) =>
                      i.target_id === session.ownerId && i.status === "pending",
                  ) ? (
                    <span aria-hidden="true"> •</span>
                  ) : (
                    ""
                  )}
                </button>
              ))}
            </nav>
          </>
        )
      )}
    </main>
  );
}

function TableDockButton({
  match,
  open,
  onToggle,
}: {
  match: Snapshot;
  open: boolean;
  onToggle: () => void;
}) {
  const seconds = useMatchCountdown(match.deadline, match.serverTime);
  const own = match.seats.find((seat) => seat.id === match.ownSeatId);
  const choosing =
    own?.kind === "human" && !own.abandoned && match.phase === "collecting";
  const state = choosing
    ? match.ownMove
      ? "Locked"
      : seconds + "s · Choose"
    : match.phase === "waiting"
      ? "Waiting"
      : match.phase === "finished"
        ? "Results"
        : own?.abandoned
          ? "Left table"
          : own?.kind === "visual" || own?.kind === "external"
            ? "Bot playing"
            : match.phase;
  return (
    <button
      className="button small primary yard-table-button"
      aria-label={match.ownSeatId ? "My table" : "Watching table"}
      aria-expanded={open}
      onClick={onToggle}
    >
      <span>{match.ownSeatId ? "My table" : "Watching"}</span>
      <small>{state}</small>
    </button>
  );
}
