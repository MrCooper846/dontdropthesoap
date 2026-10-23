"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BlocklyEditor from "../../../client/bots/BlocklyEditor";
import { starter } from "../../../shared/bots/presets";
import { compileWorkspace } from "../../../domain/bots/workspace";
import { summarize } from "../../../domain/bots/summary";
import type { BrowserSession } from "../../../shared/yard/types";
export default function Builder() {
  const [session, setSession] = useState<BrowserSession | null>(null),
    [loading, setLoading] = useState(true),
    [workspace, setWorkspace] = useState<unknown>(starter("cooperate")),
    [loadToken, setLoadToken] = useState(0),
    [name, setName] = useState("My first strategy"),
    [botId, setBotId] = useState(""),
    [returnMatch, setReturnMatch] = useState(""),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [scenario, setScenario] = useState("none"),
    [round, setRound] = useState(1),
    [preview, setPreview] = useState<{ move: string; trace: string[] } | null>(
      null,
    ),
    [preset, setPreset] = useState("cooperate"),
    [tab, setTab] = useState<"build" | "test" | "summary">("build");
  const previewRead = useRef(0);
  const practiceRoundError =
    Number.isInteger(round) && round >= 1 && round <= 50
      ? ""
      : "Practice round must be a whole number from 1 to 50.";
  useEffect(() => {
    previewRead.current++;
    setPreview(null);
  }, [workspace, round, scenario]);
  let summary = "",
    validation = "";
  try {
    summary = summarize(compileWorkspace(workspace));
  } catch (e) {
    validation = e instanceof Error ? e.message : "Connect every decision path";
  }
  async function api(path: string, data?: unknown) {
    const response = await fetch("/api/v1" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-csrf-token": session.csrfToken } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Request failed");
    return body;
  }
  useEffect(() => {
    let stopped = false;
    const requestedMatch = new URLSearchParams(location.search).get("match");
    if (requestedMatch && /^[a-f0-9-]{36}$/i.test(requestedMatch))
      setReturnMatch(requestedMatch);
    void (async () => {
      const response = await fetch("/api/v1/session");
      if (!response.ok) return;
      const s = await response.json();
      if (stopped) return;
      setSession(s);
      const id = new URLSearchParams(location.search).get("bot");
      if (id) {
        const response = await fetch(
          "/api/v1/bots/" + encodeURIComponent(id) + "/versions/latest",
        );
        const version = await response.json();
        if (!response.ok)
          throw new Error(version.error?.message ?? "Cannot load strategy");
        if (stopped) return;
        setWorkspace(version.workspace_json);
        setName(version.name);
        setBotId(version.bot_id);
        setRevision(version.revision);
        setLoadToken((x) => x + 1);
      } else {
        try {
          const draft = JSON.parse(
            localStorage.getItem("soap.visual.draft:" + s.ownerId) ?? "null",
          );
          if (draft) {
            setWorkspace(draft.workspace);
            setName(draft.name);
            setLoadToken((x) => x + 1);
          }
        } catch {}
      }
    })()
      .catch((e) => {
        if (!stopped) setError(e.message);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, []);
  useEffect(() => {
    if (session && !botId && !loading) {
      try {
        localStorage.setItem(
          "soap.visual.draft:" + session.ownerId,
          JSON.stringify({ workspace, name }),
        );
      } catch {}
    }
  }, [workspace, name, session?.ownerId, botId, loading]);
  async function run(work: (epoch: number) => Promise<void>) {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const control = await api("/controller/acquire", {});
      setSession((s) =>
        s ? { ...s, controllerEpoch: control.controllerEpoch } : s,
      );
      await work(control.controllerEpoch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="bot-builder workshop-page">
      <header className="workshop-header">
        <Link
          className="workshop-brand"
          href={"/yard" + (returnMatch ? "?match=" + returnMatch : "")}
          aria-label="Don't Drop the Soap — the yard"
        >
          <span className="workshop-mark" aria-hidden="true">
            S
          </span>
          <span>
            DON&apos;T DROP
            <br />
            THE SOAP
          </span>
        </Link>
        <nav className="workshop-navigation" aria-label="Workshop navigation">
          <Link className="button" href="/bots">
            Your bots
          </Link>
          <Link
            className="button"
            href={"/yard" + (returnMatch ? "?match=" + returnMatch : "")}
          >
            Back to yard
          </Link>
        </nav>
        {session && <span className="workshop-identity">{session.name}</span>}
      </header>
      {loading ? (
        <p role="status">Loading your strategy…</p>
      ) : !session ? (
        <p>
          Save a guest alias in the yard first.{" "}
          <Link href="/yard">Enter yard</Link>
        </p>
      ) : !session.features.visualBots ? (
        <p>The visual builder is disabled in this service configuration.</p>
      ) : (
        <>
          <section
            className="workshop-heading"
            aria-label="Strategy publication"
          >
            <div className="workshop-title">
              <h1 className="yard-eyebrow workshop-page-title">Bot workshop</h1>
              <label className="label workshop-name">
                Bot name
                <input
                  className="input"
                  maxLength={32}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setSaved("");
                  }}
                />
              </label>
              <p className="workshop-status">
                <span className="workshop-revision">
                  {botId ? "Published revision " + revision : "New draft"}
                </span>
                {botId
                  ? " · Edits publish a new version. Running games keep their original strategy."
                  : " · Your draft stays in this browser until you publish it."}
              </p>
            </div>
            <div className="workshop-publish">
              <button
                className="button primary"
                disabled={busy || !!validation || !name.trim()}
                onClick={() =>
                  void run(async (epoch) => {
                    const { key } = await api("/command-keys", {});
                    const result = await api(
                      botId ? "/bots/" + botId + "/versions" : "/bots/visual",
                      {
                        commandId: crypto.randomUUID(),
                        key,
                        controllerEpoch: epoch,
                        payload: { name, workspace },
                      },
                    );
                    setBotId(result.id);
                    setRevision(result.revision);
                    setSaved(
                      "Published revision " +
                        result.revision +
                        ". Enter this bot at a mixed circle.",
                    );
                    history.replaceState(
                      null,
                      "",
                      "/bots/build?bot=" +
                        result.id +
                        (returnMatch ? "&match=" + returnMatch : ""),
                    );
                  })
                }
              >
                Publish strategy
              </button>
              {botId && (
                <Link
                  className="button"
                  href={
                    "/yard?bot=" +
                    botId +
                    (returnMatch ? "&match=" + returnMatch : "")
                  }
                >
                  Enter bot in the yard
                </Link>
              )}
            </div>
          </section>
          <div className="workshop-notices">
            {saved && <p role="status">{saved}</p>}
            {error && (
              <p role="alert" className="danger">
                {error}
              </p>
            )}
            {validation && (
              <p role="status" className="danger">
                {validation}
              </p>
            )}
          </div>
          <div
            className="workshop-tabs"
            role="tablist"
            aria-label="Bot workshop"
          >
            {(["build", "test", "summary"] as const).map((name) => (
              <button
                key={name}
                id={"workshop-tab-" + name}
                className="button"
                role="tab"
                aria-selected={tab === name}
                aria-controls={"workshop-panel-" + name}
                tabIndex={tab === name ? 0 : -1}
                onClick={() => setTab(name)}
                onKeyDown={(e) => {
                  const tabs = ["build", "test", "summary"] as const;
                  const index = tabs.indexOf(name);
                  const next =
                    e.key === "ArrowRight"
                      ? tabs[(index + 1) % tabs.length]
                      : e.key === "ArrowLeft"
                        ? tabs[(index + tabs.length - 1) % tabs.length]
                        : e.key === "Home"
                          ? tabs[0]
                          : e.key === "End"
                            ? tabs[tabs.length - 1]
                            : null;
                  if (next) {
                    e.preventDefault();
                    setTab(next);
                    document.getElementById("workshop-tab-" + next)?.focus();
                  }
                }}
              >
                {name === "build"
                  ? "Build"
                  : name === "test"
                    ? "Test"
                    : "Summary"}
              </button>
            ))}
            <span
              className={"workshop-validity" + (validation ? " danger" : "")}
            >
              {validation ? "Check connections" : "All paths connected"}
            </span>
          </div>
          <div className="workshop-body">
            <section
              className="workshop-build"
              id="workshop-panel-build"
              role="tabpanel"
              aria-labelledby="workshop-tab-build"
              hidden={tab !== "build"}
            >
              <div className="workshop-starters">
                <label className="label">
                  Starter strategy
                  <select
                    className="input"
                    aria-label="Starter strategy"
                    value={preset}
                    onChange={(e) => setPreset(e.target.value)}
                  >
                    <option value="cooperate">Always cooperate</option>
                    <option value="betray">Always betray</option>
                    <option value="tit-for-tat">Tit for tat</option>
                    <option value="random">Seeded random</option>
                  </select>
                </label>
                <button
                  className="button"
                  onClick={() => {
                    setWorkspace(
                      starter(preset as Parameters<typeof starter>[0]),
                    );
                    setLoadToken((x) => x + 1);
                    setPreview(null);
                  }}
                >
                  Load starter
                </button>
                <p className="muted">
                  Connect blocks in the workspace or use Edit blocks.
                </p>
              </div>
              <BlocklyEditor
                initial={workspace}
                loadToken={loadToken}
                onChange={(value) => {
                  setWorkspace(value);
                  setSaved("");
                  setPreview(null);
                }}
              />
            </section>
            <section
              className="workshop-test"
              id="workshop-panel-test"
              role="tabpanel"
              aria-labelledby="workshop-tab-test"
              hidden={tab !== "test"}
            >
              <div className="workshop-test-inputs stack">
                <span className="yard-eyebrow">PRACTICE SCENARIO</span>
                <h2>Try a decision</h2>
                <p className="muted">
                  A private practice round. It never changes a live game.
                </p>
                <label className="label">
                  Opponent last revealed move
                  <select
                    className="input"
                    aria-label="Opponent last revealed move"
                    value={scenario}
                    onChange={(e) => setScenario(e.target.value)}
                  >
                    <option value="none">No earlier encounter</option>
                    <option value="C">Cooperate</option>
                    <option value="D">Betray</option>
                  </select>
                </label>
                <label className="label">
                  Practice round
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    aria-invalid={!!practiceRoundError}
                    aria-describedby={
                      practiceRoundError ? "practice-round-error" : undefined
                    }
                    value={round}
                    onChange={(e) => setRound(Number(e.target.value))}
                  />
                </label>
                {practiceRoundError && (
                  <p id="practice-round-error" role="alert" className="danger">
                    {practiceRoundError}
                  </p>
                )}
                <button
                  className="button"
                  disabled={busy || !!validation || !!practiceRoundError}
                  onClick={() => {
                    if (practiceRoundError) return;
                    setPreview(null);
                    const read = ++previewRead.current;
                    void run(async (epoch) => {
                      const result = await api("/bots/preview", {
                        controllerEpoch: epoch,
                        workspace,
                        observation: {
                          round,
                          ownScore: 0,
                          opponentScore: 0,
                          lastOpponentMove:
                            scenario === "none" ? null : scenario,
                          ownCooperations: 0,
                          ownBetrayals: 0,
                          opponentCooperations: scenario === "C" ? 1 : 0,
                          opponentBetrayals: scenario === "D" ? 1 : 0,
                        },
                      });
                      if (read === previewRead.current) setPreview(result);
                    });
                  }}
                >
                  Test decision
                </button>
              </div>
              <div className="workshop-test-output stack" aria-live="polite">
                <span className="yard-eyebrow">DECISION PREVIEW</span>
                {preview ? (
                  <div aria-label="Practice result">
                    <h2>
                      Chooses {preview.move === "C" ? "Cooperate" : "Betray"}
                    </h2>
                    <ol className="workshop-trace">
                      {preview.trace.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <>
                    <h2>No test run yet</h2>
                    <p className="muted">
                      Set a scenario, then test this draft.
                    </p>
                  </>
                )}
              </div>
            </section>
            <section
              className="workshop-summary stack"
              id="workshop-panel-summary"
              role="tabpanel"
              aria-labelledby="workshop-tab-summary"
              hidden={tab !== "summary"}
            >
              <span className="yard-eyebrow">
                YOUR STRATEGY, IN PLAIN ENGLISH
              </span>
              <h2>Strategy summary</h2>
              {!validation && (
                <pre aria-label="Strategy summary">{summary}</pre>
              )}
              <p className="muted">
                Test a scenario to see which path your strategy takes.
              </p>
              <button
                className="button"
                onClick={() => {
                  setTab("test");
                  document.getElementById("workshop-tab-test")?.focus();
                }}
              >
                Try a scenario
              </button>
            </section>
          </div>
          <footer className="workshop-footer">
            <span className="muted">
              {botId
                ? "Published revision " + revision + " · edits need publishing."
                : "Draft saved in this browser."}{" "}
              Losing your guest cookie loses access to published bots.
            </span>
            {returnMatch && (
              <Link className="button" href={"/yard?match=" + returnMatch}>
                Return to my table
              </Link>
            )}
          </footer>
        </>
      )}
    </main>
  );
}
