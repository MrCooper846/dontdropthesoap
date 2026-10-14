"use client";
import { useEffect, useState } from "react";
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
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(""),
    [scenario, setScenario] = useState("none"),
    [round, setRound] = useState(1),
    [preview, setPreview] = useState<{ move: string; trace: string[] } | null>(
      null,
    ),
    [preset, setPreset] = useState("cooperate");
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
    <main className="bot-builder yard-page">
      <header className="yard-header">
        <div>
          <span className="yard-eyebrow">NO CODING REQUIRED</span>
          <h1>Build a questionable strategy</h1>
          <p>
            Connect a decision. Test the consequences. Let your bot take the
            blame.
          </p>
        </div>
        <Link className="button" href="/bots">
          Your bots
        </Link>
        <Link className="button" href="/yard">
          Back to yard
        </Link>
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
          <section className="panel stack">
            <div className="builder-actions">
              <label className="label">
                Bot name
                <input
                  className="input"
                  maxLength={32}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
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
            </div>
            <p className="muted">
              {botId
                ? "Editing published revision " +
                  revision +
                  ". Publishing creates a new version; running games keep their original strategy."
                : "This new draft stays in this browser until you publish it."}{" "}
              Losing your guest cookie loses access to published bots.
            </p>
          </section>
          <BlocklyEditor
            initial={workspace}
            loadToken={loadToken}
            onChange={(value) => {
              setWorkspace(value);
              setSaved("");
              setPreview(null);
            }}
          />
          <div className="builder-results">
            <section className="panel stack">
              <h2>Strategy summary</h2>
              {validation ? (
                <p role="status" className="danger">
                  {validation}
                </p>
              ) : (
                <pre aria-label="Strategy summary">{summary}</pre>
              )}
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
                      "/bots/build?bot=" + result.id,
                    );
                  })
                }
              >
                Publish strategy
              </button>
              {saved && <p role="status">{saved}</p>}
              {botId && (
                <Link className="button" href={"/yard?bot=" + botId}>
                  Enter bot in the yard
                </Link>
              )}
            </section>
            <section className="panel stack">
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
                  value={round}
                  onChange={(e) => setRound(Number(e.target.value))}
                />
              </label>
              <button
                className="button"
                disabled={busy || !!validation}
                onClick={() =>
                  void run(async (epoch) =>
                    setPreview(
                      await api("/bots/preview", {
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
                      }),
                    ),
                  )
                }
              >
                Test decision
              </button>
              {preview && (
                <div aria-label="Practice result">
                  <strong>
                    Chooses {preview.move === "C" ? "Cooperate" : "Betray"}
                  </strong>
                  <ol>
                    {preview.trace.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          </div>
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  );
}
