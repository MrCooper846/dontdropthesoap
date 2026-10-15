"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Result, Settings } from "../../domain/match/model";
type Session = {
  ownerId: string;
  csrfToken: string;
  features: { league?: boolean };
};
type Batch = {
  id: string;
  name: string;
  state: string;
  ownerId?: string;
  registrationDeadline: string;
  rules: Settings;
};
type Entry = {
  id: string;
  ownerId: string;
  botId: string;
  versionId: string;
  name: string;
  kind: string;
  offlineAt: string | null;
};
type Fixture = {
  id: string;
  ordinal: number;
  a: string;
  b: string;
  state: string;
  attempts: number;
  phase: string | null;
};
type Standing = Entry & {
  rank: number;
  points: number;
  played: number;
  mutualCooperations: number;
};
type Details = {
  batch: Batch;
  entries: Entry[];
  standings: Standing[];
  fixtures: Fixture[];
  next: number | null;
  provisional: boolean;
  provisionalSchedule: { ordinal: number; a: string; b: string }[];
};
type Replay = {
  fixture: { id: string; ordinal: number; attempts: number };
  attempt: number;
  attempts: { attempt: number; phase: string }[];
  match: { id: string; phase: string; historyExpired: boolean } | null;
  seats: { id: string; name: string }[];
  results: Result[];
};
async function read<T>(path: string): Promise<T> {
  const r = await fetch("/api/v1" + path, { cache: "no-store" });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message ?? "Could not load league");
  return data;
}
export default function Leagues() {
  const [session, setSession] = useState<Session | null>(null),
    [bots, setBots] = useState<{ id: string; name: string; kind: string }[]>(
      [],
    );
  const [batches, setBatches] = useState<Batch[]>([]),
    [nextBatch, setNextBatch] = useState<string | null>(null);
  const [selected, setSelected] = useState(""),
    [details, setDetails] = useState<Details | null>(null),
    [after, setAfter] = useState(0);
  const [replayId, setReplayId] = useState(""),
    [attempt, setAttempt] = useState<number | undefined>(),
    [replay, setReplay] = useState<Replay | null>(null);
  const [name, setName] = useState(""),
    [minutes, setMinutes] = useState(5),
    [bot, setBot] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const generation = useRef(0);
  async function refreshList() {
    const data = await read<{ batches: Batch[]; next: string | null }>(
      "/leagues",
    );
    setBatches(data.batches);
    setNextBatch(data.next);
  }
  useEffect(() => {
    const url = new URL(window.location.href);
    setSelected(url.searchParams.get("batch") ?? "");
    let live = true;
    void Promise.all([
      read<Session>("/session")
        .then(async (s) => {
          if (!live) return;
          setSession(s);
          const data = await read<{
            bots: { id: string; name: string; kind: string }[];
          }>("/bots");
          if (live) {
            setBots(data.bots);
            setBot(data.bots[0]?.id ?? "");
          }
        })
        .catch(() => {}),
      refreshList().catch((e) => {
        if (live) setError(e.message);
      }),
    ]).finally(() => {
      if (live) setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    setDetails(null);
    setReplayId("");
    setReplay(null);
    if (!selected) return;
    const url = new URL(window.location.href);
    url.searchParams.set("batch", selected);
    window.history.replaceState(null, "", url);
    let pending = false,
      live = true;
    async function update() {
      if (pending) return;
      pending = true;
      try {
        const data = await read<Details>(
          "/leagues/" + selected + "?after=" + after,
        );
        if (live && generation.current === current) setDetails(data);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        pending = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected, after]);
  useEffect(() => {
    setReplay(null);
    if (!replayId) return;
    let live = true,
      pending = false;
    async function updateReplay() {
      if (pending) return;
      pending = true;
      try {
        const result = await read<Replay>(
          "/leagues/fixtures/" +
            replayId +
            "/replay" +
            (attempt ? "?attempt=" + attempt : ""),
        );
        if (live) setReplay(result);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        pending = false;
      }
    }
    void updateReplay();
    const timer = setInterval(() => void updateReplay(), 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [replayId, attempt, details?.batch.state]);
  async function action(path: string, payload: unknown) {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    const post = async (path: string, data: unknown) => {
      const r = await fetch("/api/v1" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": session.csrfToken,
        },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error?.message ?? "League action failed");
      return result;
    };
    try {
      const control = await post("/controller/acquire", {}),
        { key } = await post("/command-keys", {});
      const envelope = {
        commandId: crypto.randomUUID(),
        key,
        controllerEpoch: control.controllerEpoch,
        payload,
      };
      // Retain one command ID for a network retry; ambiguous responses cannot create duplicate batches/entries.
      let result;
      try {
        result = await post(path, envelope);
      } catch (e) {
        if (!(e instanceof TypeError)) throw e;
        result = await post(path, envelope);
      }
      if (path === "/leagues") {
        setAfter(0);
        setSelected(result.id);
        setName("");
      }
      await refreshList();
      if (selected && path !== "/leagues")
        setDetails(
          await read<Details>("/leagues/" + selected + "?after=" + after),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const mine = details?.entries.find((e) => e.ownerId === session?.ownerId);
  const entrantName = (id: string) =>
    details?.entries.find((e) => e.id === id)?.name ?? "Entrant";
  return (
    <main className="screen stack">
      <header>
        <h1 className="brand">Open bot league</h1>
        <p className="subtitle">Small strategies. Large grudges.</p>
      </header>
      <nav className="row">
        <Link className="button" href="/yard">
          Back to yard
        </Link>
        <Link className="button" href="/bots">
          Your bots
        </Link>
      </nav>
      <section className="panel stack">
        <h2>How the league works</h2>
        <p>
          4–16 bots, one per owner. Every pair plays 20 rounds with 20 seconds
          to choose and a one-second reveal. Only one fixture per bot runs at a
          time.
        </p>
        <p>
          Standings sum net points, then mutual Cooperate/Cooperate rounds.
          Remaining ties share a rank. League points stay separate from casual
          totals.
        </p>
        <p>
          Open experimental competition: external bots may be coached or changed
          between decisions. A declared revision does not prove frozen code.
          Visual strategies freeze at registration. No prizes.
        </p>
      </section>
      {error && (
        <p className="danger" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading leagues…</p>}
      {!session && !loading && (
        <p>
          Results are public.{" "}
          <Link href="/yard">Enter a guest alias in the yard</Link> to register
          a bot. Keep your guest cookie to retain ownership.
        </p>
      )}
      {session?.features.league && (
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action("/leagues", { name, registrationMinutes: minutes });
          }}
        >
          <h2>Host a batch</h2>
          <label className="label">
            Batch name
            <input
              className="input"
              value={name}
              maxLength={64}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="label">
            Registration minutes
            <input
              className="input"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            Open registration
          </button>
        </form>
      )}
      <section className="panel stack">
        <h2>Batches</h2>
        {!loading && !batches.length && <p>No batches yet.</p>}
        {batches.map((b) => (
          <button
            key={b.id}
            className="button"
            aria-pressed={selected === b.id}
            onClick={() => {
              setAfter(0);
              setSelected(b.id);
            }}
          >
            {b.name} · {b.state}
          </button>
        ))}
        {nextBatch && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void read<{ batches: Batch[]; next: string | null }>(
                "/leagues?before=" + nextBatch,
              )
                .then((d) => {
                  setBatches((old) => [...old, ...d.batches]);
                  setNextBatch(d.next);
                })
                .catch((e) => setError(e.message))
            }
          >
            Older batches
          </button>
        )}
      </section>
      {details && (
        <>
          <section className="panel stack" aria-label="Selected batch">
            <h2>{details.batch.name}</h2>
            <p>Status: {details.batch.state}</p>
            <p>
              20 rounds · 20-second choice · one-second reveal · two bots per
              fixture
            </p>
            {details.batch.state === "registration" && (
              <>
                <p>
                  Registration closes{" "}
                  {new Date(
                    details.batch.registrationDeadline,
                  ).toLocaleString()}
                  . Fewer than four entries cancels the batch.
                </p>
                <p>
                  The schedule below is provisional until registration closes.
                  New entries can change its order.
                </p>
                {session &&
                  (!mine ? (
                    <form
                      className="stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action("/leagues/" + selected + "/register", {
                          botId: bot,
                        });
                      }}
                    >
                      <label className="label">
                        Your entrant
                        <select
                          className="input"
                          value={bot}
                          onChange={(e) => setBot(e.target.value)}
                        >
                          {bots.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} · {b.kind}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button primary"
                        disabled={busy || !bot}
                      >
                        Register entrant
                      </button>
                      {!bots.length && (
                        <Link href="/bots">Create a bot first</Link>
                      )}
                    </form>
                  ) : (
                    <>
                      <p>Your entry: {mine.name}</p>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void action("/leagues/" + selected + "/withdraw", {})
                        }
                      >
                        Withdraw entrant
                      </button>
                    </>
                  ))}
                {session?.ownerId === details.batch.ownerId && (
                  <button
                    className="button"
                    disabled={busy || details.entries.length < 4}
                    onClick={() =>
                      void action("/leagues/" + selected + "/close", {})
                    }
                  >
                    Close registration and start
                  </button>
                )}
              </>
            )}
            <h3>Entrants ({details.entries.length}/16)</h3>
            {details.entries.map((e) => (
              <p key={e.id}>
                {e.name} · {e.kind} ·{" "}
                {e.offlineAt ? "Paused after three timeouts" : "Eligible"}
                {e.kind === "visual"
                  ? " · strategy frozen at registration"
                  : " · open external compute"}
              </p>
            ))}
            {mine?.offlineAt && details.batch.state === "running" && (
              <>
                <p>
                  Three consecutive timeouts pause later fixtures.{" "}
                  {mine.kind === "external"
                    ? "Reconnect the external controller before confirming readiness."
                    : "Check your visual strategy before confirming readiness; this batch keeps its registered version."}
                </p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void action("/leagues/" + selected + "/resume", {})
                  }
                >
                  Confirm entrant ready
                </button>
              </>
            )}
          </section>
          <section className="panel stack">
            <h2>Standings</h2>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Bot</th>
                    <th>Points</th>
                    <th>Mutual cooperation</th>
                    <th>Played</th>
                  </tr>
                </thead>
                <tbody>
                  {details.standings.map((s) => (
                    <tr key={s.id}>
                      <td>{s.rank}</td>
                      <td>{s.name}</td>
                      <td>{s.points}</td>
                      <td>{s.mutualCooperations}</td>
                      <td>{s.played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel stack">
            <h2>{details.provisional ? "Provisional schedule" : "Fixtures"}</h2>
            {details.provisional && details.entries.length < 4 && (
              <p>Register at least four owners to preview pairings.</p>
            )}
            {details.provisional
              ? details.provisionalSchedule.map((f) => (
                  <p key={f.ordinal}>
                    #{f.ordinal}: {entrantName(f.a)} vs {entrantName(f.b)}
                  </p>
                ))
              : details.fixtures.map((f) => (
                  <article className="panel stack" key={f.id}>
                    <h3>
                      #{f.ordinal}: {entrantName(f.a)} vs {entrantName(f.b)}
                    </h3>
                    <p>
                      {f.state}
                      {f.phase ? " · " + f.phase : ""} · {f.attempts} attempt(s)
                    </p>
                    <button
                      className="button"
                      disabled={!f.attempts}
                      onClick={() => {
                        setAttempt(undefined);
                        setReplayId(f.id);
                      }}
                    >
                      Inspect fixture {f.ordinal}
                    </button>
                  </article>
                ))}
            {!details.provisional && (
              <div className="row">
                {after > 0 && (
                  <button className="button" onClick={() => setAfter(0)}>
                    First fixtures
                  </button>
                )}
                {details.next !== null && (
                  <button
                    className="button"
                    onClick={() => setAfter(details.next!)}
                  >
                    Next fixtures
                  </button>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {replay && (
        <section className="panel stack" aria-label="Recorded fixture">
          <h2>Recorded fixture #{replay.fixture.ordinal}</h2>
          <p>
            Only stored, resolved rounds appear here. Pending moves stay hidden.
            No agent is rerun.
          </p>
          <label className="label">
            Attempt
            <input
              className="input"
              type="number"
              min={1}
              max={replay.fixture.attempts}
              value={replay.attempt ?? 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (
                  Number.isInteger(n) &&
                  n >= 1 &&
                  n <= replay.fixture.attempts
                )
                  setAttempt(n);
              }}
            />
          </label>
          <p>
            {replay.match?.phase ?? "Not started"} ·{" "}
            {replay.match?.historyExpired
              ? "Round details expired"
              : replay.results.length + "/20 resolved rounds"}
          </p>
          {replay.results.map((r) => (
            <article key={r.pairId}>
              <h3>Round {r.round}</h3>
              <p>
                {replay.seats.find((s) => s.id === r.a)?.name}:{" "}
                {r.aMove === "C" ? "Cooperate" : "Betray"} (
                {r.aNet > 0 ? "+" : ""}
                {r.aNet}) · {replay.seats.find((s) => s.id === r.b)?.name}:{" "}
                {r.bMove === "C" ? "Cooperate" : "Betray"} (
                {r.bNet > 0 ? "+" : ""}
                {r.bNet})
              </p>
              <p>{r.message}</p>
            </article>
          ))}
          {!replay.results.length && (
            <p>
              {replay.match?.historyExpired
                ? "Round details expired after 90 days. Final scores and standings are retained."
                : "No resolved rounds in this attempt."}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
