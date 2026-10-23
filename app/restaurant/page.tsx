"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RESTAURANT_ROLES,
  RESTAURANT_ZONES,
  type RestaurantAction,
  type RestaurantLobby,
  type RestaurantObservation,
  type RestaurantZone,
} from "../../shared/restaurant/types";
import type { BrowserSession } from "../../shared/yard/types";
import "./restaurant.css";

type Reply = { shift: RestaurantObservation; wallet: number };
type Pending = {
  path: string;
  body: {
    commandId: string;
    key: string;
    controllerEpoch: number;
    payload: unknown;
  };
};
const zones: Record<
  RestaurantZone,
  { title: string; icon: string; help: string }
> = {
  dining: {
    title: "Dining room",
    icon: "▦",
    help: "Waiter: serve orders once food and drink are ready.",
  },
  kitchen: {
    title: "Kitchen",
    icon: "♨",
    help: "Chef: prepare the food on each order.",
  },
  bar: {
    title: "Bar",
    icon: "▥",
    help: "Barman: mix the drinks on each order.",
  },
  washup: {
    title: "Wash-up",
    icon: "◉",
    help: "Runner: wash dirty plates for the next service.",
  },
  stockroom: {
    title: "Stockroom",
    icon: "▤",
    help: "Runner: replenish the kitchen and bar supplies.",
  },
  office: {
    title: "Office",
    icon: "▣",
    help: "Deposit takings, check the books, or risk a little theft.",
  },
};
const seconds = (n: number) => Math.max(0, Math.ceil(n / 1000));
const clock = (n: number) =>
  `${Math.floor(seconds(n) / 60)}:${String(seconds(n) % 60).padStart(2, "0")}`;
export default function Restaurant() {
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [loading, setLoading] = useState(true),
    [name, setName] = useState("");
  const [id, setId] = useState(""),
    [shift, setShift] = useState<RestaurantObservation | null>(null);
  const [lobbies, setLobbies] = useState<RestaurantLobby[]>([]),
    [wallet, setWallet] = useState(0);
  const [duration, setDuration] = useState(120),
    [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null),
    [now, setNow] = useState(Date.now());
  const generation = useRef(0),
    alive = useRef(true),
    locked = useRef(false),
    offset = useRef(0);
  async function api(path: string, body?: unknown) {
    const response = await fetch("/api/v1" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-csrf-token": session.csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "The server response was interrupted. Retry the same request.",
      );
    }
    if (!response.ok) {
      const failure = new Error(
        result.error?.message ?? "That action could not be completed.",
      );
      Object.assign(failure, { definitive: true });
      throw failure;
    }
    return result;
  }
  function accept(result: Reply) {
    generation.current++;
    setShift(result.shift);
    setWallet(result.wallet);
    offset.current = result.shift.serverTime - Date.now();
    setNow(result.shift.serverTime);
    setId(result.shift.id);
    history.replaceState(null, "", "/restaurant?shift=" + result.shift.id);
  }
  useEffect(() => {
    alive.current = true;
    setId(new URLSearchParams(location.search).get("shift") ?? "");
    fetch("/api/v1/session")
      .then(async (r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (alive.current) setSession(s);
      })
      .catch(() => {
        if (alive.current) setError("Cannot connect. Refresh to try again.");
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    const ticker = setInterval(() => setNow(Date.now() + offset.current), 200);
    return () => {
      alive.current = false;
      generation.current++;
      clearInterval(ticker);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const g = generation.current;
      try {
        const data = await api(
          id ? "/restaurant/" + encodeURIComponent(id) : "/restaurant",
        );
        if (!stopped && g === generation.current) {
          setWallet(data.wallet);
          if (id) {
            setShift(data.shift);
            offset.current = data.shift.serverTime - Date.now();
          } else setLobbies(data.shifts);
        }
      } catch (e) {
        if (!stopped && g === generation.current)
          setError(
            e instanceof Error ? e.message : "Cannot refresh the shift.",
          );
      }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [id, session?.ownerId]);
  async function send(action?: RestaurantAction, retry = false) {
    if (locked.current || (!retry && pending)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    generation.current++;
    let request = retry ? pending : null;
    try {
      if (!request) {
        const control = await api("/controller/acquire", {});
        const { key } = await api("/command-keys", {});
        request = {
          path: action ? "/restaurant/" + id + "/commands" : "/restaurant",
          body: {
            commandId: crypto.randomUUID(),
            key,
            controllerEpoch: control.controllerEpoch,
            payload: action ?? { durationSeconds: duration },
          },
        };
        setPending(request);
      }
      if (!request) return;
      const result = await api(request.path, request.body);
      if (alive.current) {
        setPending(null);
        accept(result);
      }
    } catch (e) {
      if (alive.current) {
        if ((e as { definitive?: boolean }).definitive || !request)
          setPending(null);
        setError(
          e instanceof Error
            ? e.message
            : "Connection lost. Retry this request to safely find its result.",
        );
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function open(next: string) {
    generation.current++;
    setShift(null);
    setError("");
    setId(next);
    history.replaceState(
      null,
      "",
      next ? "/restaurant?shift=" + next : "/restaurant",
    );
  }
  const disabled = busy || !!pending;
  const active = shift?.phase === "active",
    me = shift?.me,
    task = me?.task;
  const sameZone =
    shift?.crew.filter(
      (c) => c.active && c.id !== me?.id && c.zone === me?.zone,
    ) ?? [];
  const canStart =
    !!shift &&
    shift.crew.filter((c) => c.active).length >= 4 &&
    shift.crew.filter((c) => c.active).every((c) => c.ready) &&
    RESTAURANT_ROLES.every((role) =>
      shift.crew.some((c) => c.active && c.role === role),
    );
  const actionButton = (
    label: string,
    action: RestaurantAction,
    unavailable = false,
  ) => (
    <button
      disabled={disabled || unavailable}
      onClick={() => void send(action)}
    >
      {label}
    </button>
  );
  return (
    <main className="restaurant-app">
      <header className="rest-header">
        <Link href="/yard" className="rest-brand">
          DON’T DROP
          <br />
          <strong>THE SOAP</strong>
        </Link>
        <div>
          <p className="rest-eyebrow">Prison enterprise</p>
          <h1>The restaurant</h1>
        </div>
        <div className="rest-wallet">
          Your wallet<strong>{wallet} noodles</strong>
          <small>Persistent funds · free entry</small>
        </div>
      </header>
      {error && (
        <div className="rest-error" role="alert">
          {error}
        </div>
      )}
      {pending && !busy && (
        <div className="rest-notice">
          The outcome of your last request is uncertain. Retry safely before
          doing anything else.{" "}
          <button onClick={() => void send(undefined, true)}>
            Retry last request
          </button>
        </div>
      )}
      {busy && (
        <p className="rest-status" role="status">
          Sending…
        </p>
      )}
      {loading ? (
        <p role="status">Opening the restaurant…</p>
      ) : !session ? (
        <section className="rest-card">
          <h2>Clock in</h2>
          <p>
            Choose a prisoner nickname to join a shift. Your guest identity
            stays in this browser.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (locked.current) return;
              locked.current = true;
              setBusy(true);
              try {
                await api("/session/guest", { name });
                const s = await api("/session");
                setSession(s);
                setError("");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Cannot save nickname.",
                );
              } finally {
                locked.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              Nickname
              <input
                required
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy || !name.trim()}>Save nickname</button>
          </form>
        </section>
      ) : (
        <>
          <nav className="rest-nav">
            <Link href="/yard">Back to yard</Link>
            <span>{session.name}</span>
            {id && (
              <button disabled={disabled} onClick={() => open("")}>
                All shifts
              </button>
            )}
          </nav>
          {!id ? (
            <section className="rest-card">
              <h2>Pick a shift</h2>
              <p>
                4–8 prisoners. One chef, waiter, barman and runner are needed to
                open. Work together, bank the takings, watch your pockets.
              </p>
              <div className="rest-create">
                <label>
                  Shift duration
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  >
                    <option value={120}>Quick · 2 minutes</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                    <option value={900}>15 minutes</option>
                  </select>
                </label>
                <button disabled={disabled} onClick={() => void send()}>
                  Create shift
                </button>
              </div>
              <div className="rest-lobbies">
                {lobbies.length === 0 && (
                  <p>No shifts yet. Open the first one.</p>
                )}
                {lobbies.map((l) => (
                  <article key={l.id}>
                    <div>
                      <strong>{l.hostName}’s shift</strong>
                      <p>
                        {clock(l.durationMs)} · {l.players}/8 crew · {l.phase}
                      </p>
                    </div>
                    <button
                      disabled={disabled || (!l.mine && l.phase !== "waiting")}
                      onClick={() => open(l.id)}
                    >
                      {l.mine ? "Open shift" : "View lobby"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : !shift ? (
            <p role="status">Loading shift…</p>
          ) : (
            <>
              <section className="rest-shiftbar">
                <div>
                  <span className="rest-eyebrow">
                    {shift.phase === "waiting"
                      ? "Before service"
                      : shift.phase === "finished"
                        ? "Shift complete"
                        : "Service is live"}
                  </span>
                  <h2>
                    {shift.phase === "active"
                      ? clock((shift.endsAt ?? now) - now)
                      : clock(shift.durationMs)}
                  </h2>
                </div>
                <span>
                  Vault <strong>{shift.vault}</strong>
                </span>
                <span>
                  Revenue <strong>{shift.revenue}</strong>
                </span>
                <span>
                  Served <strong>{shift.served}</strong>
                </span>
                <span>
                  Stock <strong>{shift.stock}</strong>
                </span>
                <span>
                  Clean / dirty plates{" "}
                  <strong>
                    {shift.cleanPlates} / {shift.dirtyPlates}
                  </strong>
                </span>
              </section>
              {shift.phase === "waiting" && (
                <section className="rest-card">
                  <h2>Assemble the crew</h2>
                  {!me?.active ? (
                    actionButton("Join shift", { type: "join" })
                  ) : (
                    <>
                      <label>
                        Your role
                        <select
                          disabled={disabled}
                          value={me.role}
                          onChange={(e) =>
                            void send({
                              type: "role",
                              role: e.target.value as typeof me.role,
                            })
                          }
                        >
                          {RESTAURANT_ROLES.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      {actionButton(me.ready ? "Not ready" : "Ready up", {
                        type: "ready",
                        ready: !me.ready,
                      })}
                    </>
                  )}
                  <p>
                    Opening requires 4–8 ready crew and all four roles. Changing
                    the crew may require readying up again.
                  </p>
                  {shift.hostId === session.ownerId &&
                    actionButton("Start shift", { type: "start" }, !canStart)}
                </section>
              )}
              <div className="rest-layout">
                <div>
                  <section className="rest-card">
                    <h2>Restaurant floor</h2>
                    <p>
                      Choose a room to move. Striped figures show who is there;
                      your room is outlined in yellow.
                    </p>
                    <div className="rest-floor">
                      {RESTAURANT_ZONES.map((z) => (
                        <button
                          key={z}
                          className={
                            "rest-room " + (me?.zone === z ? "is-here" : "")
                          }
                          disabled={
                            disabled ||
                            !active ||
                            !me?.active ||
                            !!task ||
                            !!me.pendingTheft
                          }
                          onClick={() => void send({ type: "move", zone: z })}
                          aria-label={"Move to " + zones[z].title}
                        >
                          <span className="rest-room-icon" aria-hidden="true">
                            {zones[z].icon}
                          </span>
                          <strong>{zones[z].title}</strong>
                          <span className="rest-prisoners">
                            {shift.crew
                              .filter((c) => c.active && c.zone === z)
                              .map((c) => (
                                <span className="rest-prisoner" key={c.id}>
                                  <i aria-hidden="true" />
                                  <span>
                                    {c.name}
                                    {c.id === me?.id ? " (you)" : ""}
                                  </span>
                                </span>
                              ))}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                  {active && me?.active && (
                    <section className="rest-card rest-work">
                      <p className="rest-eyebrow">
                        {me.role} · {zones[me.zone].title}
                      </p>
                      <h2>{task ? "Your task" : "On the job"}</h2>
                      <p>{zones[me.zone].help}</p>
                      {task ? (
                        <>
                          <p>
                            Step {task.index + 1} of {task.steps.length} ·{" "}
                            {task.kind}
                          </p>
                          <ol className="rest-sequence">
                            {task.steps.map((s, i) => (
                              <li
                                key={i}
                                className={
                                  i === task.index
                                    ? "current"
                                    : i < task.index
                                      ? "done"
                                      : ""
                                }
                              >
                                {s}
                              </li>
                            ))}
                          </ol>
                          <p role="status">
                            {now < task.nextAt
                              ? `Wait ${seconds(task.nextAt - now)}s for the timing window…`
                              : `Choose the next step · ${seconds(task.expiresAt - now)}s left`}
                          </p>
                          <div className="rest-actions">
                            {task.choices.map((value) => (
                              <button
                                key={value}
                                disabled={
                                  disabled ||
                                  now < task.nextAt ||
                                  now >= task.expiresAt
                                }
                                onClick={() =>
                                  void send({ type: "step", value })
                                }
                              >
                                {value}
                              </button>
                            ))}
                            {actionButton("Cancel task", { type: "cancel" })}
                          </div>
                        </>
                      ) : (
                        <>
                          {me.role === "runner" &&
                            me.zone === "washup" &&
                            actionButton(
                              "Wash plates",
                              { type: "begin", kind: "wash" },
                              shift.dirtyPlates === 0,
                            )}
                          {me.role === "runner" &&
                            me.zone === "stockroom" &&
                            actionButton("Restock supplies", {
                              type: "begin",
                              kind: "restock",
                            })}
                          {(me.zone === "kitchen" ||
                            me.zone === "bar" ||
                            me.zone === "dining") && (
                            <p>Use an order below to begin your role’s task.</p>
                          )}
                        </>
                      )}
                      <div className="rest-private">
                        <h3>Your pockets · private</h3>
                        <p>
                          Takings pouch <strong>{me.pouch}</strong> · Stolen{" "}
                          <strong>{me.stolen}</strong> · Risk{" "}
                          <strong>{me.risk}</strong>
                        </p>
                      </div>
                      {me.zone === "office" && (
                        <div className="rest-actions">
                          {actionButton(
                            "Deposit takings",
                            { type: "deposit" },
                            me.pouch === 0 || !!task,
                          )}
                          {actionButton(
                            "Reconcile books",
                            { type: "reconcile" },
                            !!task,
                          )}
                          <label>
                            Amount
                            <input
                              type="number"
                              min={1}
                              max={5}
                              step={1}
                              value={amount}
                              onChange={(e) =>
                                setAmount(Number(e.target.value))
                              }
                            />
                          </label>
                          {me.pendingTheft ? (
                            <>
                              <p>
                                {now < me.pendingTheft.readyAt
                                  ? `Preparing… ${seconds(me.pendingTheft.readyAt - now)}s`
                                  : "Ready to take. You can still cancel."}
                              </p>
                              {actionButton(
                                "Take noodles",
                                { type: "take" },
                                now < me.pendingTheft.readyAt,
                              )}
                              {actionButton("Cancel theft", { type: "cancel" })}
                            </>
                          ) : (
                            actionButton(
                              "Prepare theft",
                              { type: "steal", amount },
                              !me.canSteal ||
                                !!task ||
                                !Number.isInteger(amount) ||
                                amount < 1 ||
                                amount > 5,
                            )
                          )}
                          {actionButton(
                            "Return stolen noodles",
                            { type: "return", amount },
                            me.stolen < amount ||
                              amount < 1 ||
                              amount > 5 ||
                              !Number.isInteger(amount) ||
                              !!task,
                          )}
                          <p>
                            Theft has consequences. Searches can catch you; your
                            stolen total is private until your own receipt.
                          </p>
                        </div>
                      )}
                      {shift.drops
                        .filter((d) => d.zone === me.zone)
                        .map((d) => (
                          <div key={d.id} className="rest-notice">
                            Dropped pouch · {d.amount} noodles ·{" "}
                            {seconds(d.expiresAt - now)}s left{" "}
                            {actionButton(
                              "Recover pouch",
                              { type: "recover", dropId: d.id },
                              !!task,
                            )}
                          </div>
                        ))}
                      <h3>Search this room</h3>
                      <p>
                        Choose a crewmate in your room. A false accusation can
                        cost you. The server enforces support, timing and
                        cooldowns.
                      </p>
                      <div className="rest-actions">
                        {sameZone.map((c) => (
                          <button
                            key={c.id}
                            disabled={
                              disabled ||
                              !!task ||
                              now < me.searchAvailableAt ||
                              !!shift.search
                            }
                            onClick={() =>
                              void send({ type: "search", targetId: c.id })
                            }
                          >
                            Search {c.name}
                          </button>
                        ))}
                        {sameZone.length === 0 && (
                          <span>No other crewmates here.</span>
                        )}
                      </div>
                      {shift.search && (
                        <div className="rest-notice">
                          Search called by{" "}
                          {
                            shift.crew.find(
                              (c) => c.id === shift.search?.callerId,
                            )?.name
                          }{" "}
                          for{" "}
                          {
                            shift.crew.find(
                              (c) => c.id === shift.search?.targetId,
                            )?.name
                          }
                          . Supporters: {shift.search.supporters.length}.{" "}
                          {actionButton(
                            "Support search",
                            { type: "support" },
                            !!task,
                          )}
                        </div>
                      )}
                      {shift.lastReconciliation && (
                        <p>
                          Last reconciliation:{" "}
                          {shift.lastReconciliation.missing} noodles missing.
                        </p>
                      )}
                    </section>
                  )}
                  <section className="rest-card">
                    <h2>Orders</h2>
                    {shift.orders.filter((o) => o.status === "open").length ===
                      0 && <p>No open orders right now.</p>}
                    <div className="rest-orders">
                      {shift.orders
                        .filter((o) => o.status === "open")
                        .map((o) => (
                          <article
                            key={o.id}
                            role="group"
                            aria-label={"Order " + o.id}
                            data-testid={"restaurant-order-" + o.id}
                          >
                            <header>
                              <strong>Table {o.table}</strong>
                              <span>{seconds(o.expiresAt - now)}s left</span>
                            </header>
                            <p>
                              {o.dish}{" "}
                              <span>
                                {o.foodReady ? "✓ Ready" : "Food needed"}
                              </span>
                            </p>
                            <p>
                              {o.drink}{" "}
                              <span>
                                {o.drinkReady ? "✓ Ready" : "Drink needed"}
                              </span>
                            </p>
                            {active &&
                              me?.active &&
                              me.role === "chef" &&
                              me.zone === "kitchen" &&
                              actionButton(
                                "Cook for table " + o.table,
                                { type: "begin", kind: "cook", orderId: o.id },
                                o.foodReady || !!task,
                              )}
                            {active &&
                              me?.active &&
                              me.role === "barman" &&
                              me.zone === "bar" &&
                              actionButton(
                                "Mix for table " + o.table,
                                { type: "begin", kind: "drink", orderId: o.id },
                                o.drinkReady || !!task,
                              )}
                            {active &&
                              me?.active &&
                              me.role === "waiter" &&
                              me.zone === "dining" &&
                              actionButton(
                                "Serve table " + o.table,
                                { type: "begin", kind: "serve", orderId: o.id },
                                !o.foodReady || !o.drinkReady || !!task,
                              )}
                          </article>
                        ))}
                    </div>
                  </section>
                </div>
                <aside>
                  <section className="rest-card">
                    <h2>Crew</h2>
                    <ul className="rest-roster">
                      {shift.crew.map((c) => (
                        <li key={c.id}>
                          <strong>
                            {c.name}
                            {c.id === session.ownerId ? " · you" : ""}
                          </strong>
                          <span>
                            {c.role} · {zones[c.zone].title}
                          </span>
                          <small>
                            {!c.active
                              ? "Left shift"
                              : c.caught
                                ? "Caught"
                                : shift.phase === "waiting"
                                  ? c.ready
                                    ? "Ready"
                                    : "Not ready"
                                  : `${c.contribution} contribution`}
                          </small>
                        </li>
                      ))}
                    </ul>
                    {me?.active &&
                      shift.phase !== "finished" &&
                      actionButton("Leave shift", { type: "leave" })}
                  </section>
                  <section className="rest-card">
                    <h2>Shift notices</h2>
                    <ol className="rest-events" aria-live="polite">
                      {shift.events
                        .slice(-12)
                        .reverse()
                        .map((e) => (
                          <li key={e.id}>{e.text}</li>
                        ))}
                    </ol>
                  </section>
                </aside>
              </div>
              {shift.phase === "finished" && (
                <section className="rest-card">
                  <h2>Shift receipts</h2>
                  <p>
                    Your settlement is saved to your wallet. Your own theft
                    total stays private.
                  </p>
                  <div className="rest-receipts">
                    {shift.receipts?.map((r) => (
                      <article key={r.ownerId}>
                        <h3>
                          {r.name}
                          {r.ownerId === session.ownerId
                            ? " · your receipt"
                            : ""}
                        </h3>
                        <p>
                          Base {r.base} · Penalty {r.penalty} · Redistribution{" "}
                          {r.redistribution}
                        </p>
                        {r.ownerId === session.ownerId && (
                          <p>Stolen noodles {r.theft}</p>
                        )}
                        <strong>Total {r.total} noodles</strong>
                      </article>
                    ))}
                  </div>
                  <button disabled={disabled} onClick={() => open("")}>
                    Find another shift
                  </button>
                </section>
              )}
            </>
          )}
          <details className="rest-card">
            <summary>How to play & room legend</summary>
            <p>
              Chef → Kitchen. Barman → Bar. Waiter → Dining room. Runner →
              Wash-up and Stockroom. Select a room, begin a task, then follow
              its sequence at the indicated timing. Wrong choices or missed
              windows can spoil the job. Tasks never complete automatically.
            </p>
            <p>
              Waiters serve when both parts are ready, then carry takings to the
              Office. Deposit to grow the shared vault. Theft is optional:
              prepare, wait, then take; return stolen noodles before a search if
              you change your mind. Recover dropped pouches in the same room.
              Reconcile the books and coordinate searches rather than guessing.
            </p>
            <p>
              This first playable floor uses room buttons instead of free
              walking. The server decides movement, task timing, searches and
              settlement. Entry costs nothing; new wallets begin at zero.
            </p>
          </details>
        </>
      )}
    </main>
  );
}
