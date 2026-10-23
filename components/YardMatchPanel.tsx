"use client";
import { useEffect, useRef, useState } from "react";
import { useMatchCountdown } from "../client/useMatchCountdown";
import Link from "next/link";
import type { Snapshot } from "../shared/protocol/commands";
import type { BrowserSession } from "../shared/yard/types";
export default function YardMatchPanel({
  match,
  session,
  busy,
  onCommand,
  onClose,
}: {
  match: Snapshot;
  session: BrowserSession;
  busy: boolean;
  onCommand: (type: string, payload: unknown) => void;
  onClose: () => void;
}) {
  const scoresRef = useRef<HTMLDetailsElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const payoffRef = useRef<HTMLDetailsElement>(null);
  const [infoSection, setInfoSection] = useState("scores");
  function openInfo(section: "scores" | "history" | "payoffs") {
    setInfoSection(section);
    const target =
      section === "scores"
        ? scoresRef.current
        : section === "history"
          ? historyRef.current
          : payoffRef.current;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }
  const seconds = useMatchCountdown(match.deadline, match.serverTime);
  const own = match.seats.find((s) => s.id === match.ownSeatId),
    pair = match.pairs.find((p) => p.a === own?.id || p.b === own?.id),
    opponent = match.seats.find(
      (s) => s.id === (pair?.a === own?.id ? pair?.b : pair?.a),
    ),
    terminal = ["finished", "aborted", "cancelled"].includes(match.phase);
  const [feedback, setFeedback] = useState<
    {
      round_number: number;
      status: string;
      error_code: string | null;
      trace_json: string[];
    }[]
  >([]);
  const [showAllFeedback, setShowAllFeedback] = useState(false);
  useEffect(() => {
    setFeedback([]);
    setShowAllFeedback(false);
    if (own?.kind !== "visual") {
      setFeedback([]);
      return;
    }
    let stopped = false;
    const update = () =>
      fetch(
        "/api/v1/matches/" + match.id + "/seats/" + own.id + "/visual-feedback",
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((r) => {
          if (!stopped && r) setFeedback(r.decisions);
        })
        .catch(() => {});
    void update();
    const timer = setInterval(() => void update(), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [match.id, own?.id, own?.kind]);
  return (
    <section className="panel stack yard-match" aria-label="Match panel">
      <div className="row match-overview">
        <div>
          <span className="yard-eyebrow">
            {match.ownSeatId ? "YOUR TABLE" : "WATCHING"}
          </span>
          <h2>
            {terminal
              ? "Final results"
              : "Round " + match.round + "/" + match.settings.rounds}
          </h2>
        </div>
        <button className="button small" onClick={onClose}>
          Close match view
        </button>
      </div>
      <p className={"pill match-phase phase-" + match.phase}>
        {match.phase} · {seconds === null ? "" : seconds + "s"}
      </p>
      {match.phase === "waiting" && (
        <>
          <p className="match-status-copy">
            Ready when everyone is here. Seats or settings changing clears
            readiness.
          </p>
          {own && !own.abandoned && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => onCommand("seat.ready", { ready: !own.ready })}
            >
              {own.ready ? "Not ready" : "Ready up"}
            </button>
          )}
          {match.hostOwnerId === session.ownerId && (
            <button
              className="button"
              disabled={
                busy ||
                match.seats.length < 2 ||
                match.seats.some((s) => !s.ready)
              }
              onClick={() => onCommand("match.start", {})}
            >
              Start game
            </button>
          )}
        </>
      )}
      {match.phase === "collecting" && (
        <div className="match-action-card">
          <h3>
            {own?.kind === "human"
              ? "You face " + opponent?.name
              : "Watching the noodle decisions"}
          </h3>
          <p>
            {match.lockedCount}/{match.seats.length} locked
          </p>
          {own?.kind === "human" &&
            !own.abandoned &&
            (match.ownMove ? (
              <p role="status">
                Locked: {match.ownMove === "C" ? "Cooperate" : "Betray"}
              </p>
            ) : (
              <div className="splitActions">
                <button
                  className="button good choiceButton"
                  disabled={busy}
                  onClick={() => onCommand("move.submit", { move: "C" })}
                >
                  Cooperate
                </button>
                <button
                  className="button bad choiceButton"
                  disabled={busy}
                  onClick={() => onCommand("move.submit", { move: "D" })}
                >
                  Betray
                </button>
              </div>
            ))}
          {own?.kind === "visual" && !own.abandoned && (
            <p className="match-status-copy">
              Your bot is choosing for you. You can explore the yard while it
              plays.
            </p>
          )}
          {own?.kind === "external" && (
            <p>
              Your bot {own.name} controls its own choices. You can keep
              walking.
            </p>
          )}
        </div>
      )}
      {(match.phase === "revealing" || terminal) &&
        match.results
          .filter((r) => r.round === match.round)
          .map((r) => (
            <div className="lockCard" key={r.pairId}>
              <strong>
                {match.seats.find((s) => s.id === r.a)?.name}: {r.aMove}
                {r.aSource === "timeout" &&
                  " (automatic Cooperate — timed out)"}{" "}
                vs {match.seats.find((s) => s.id === r.b)?.name}: {r.bMove}
                {r.bSource === "timeout" &&
                  " (automatic Cooperate — timed out)"}
              </strong>
              <p>{r.message}</p>
              <span>
                {r.aNet >= 0 ? "+" : ""}
                {r.aNet} / {r.bNet >= 0 ? "+" : ""}
                {r.bNet} noodles
              </span>
            </div>
          ))}
      <nav className="match-info-nav" aria-label="Match information">
        <button
          className="button small"
          aria-pressed={infoSection === "scores"}
          onClick={() => openInfo("scores")}
        >
          Scores
        </button>
        <button
          className="button small"
          aria-pressed={infoSection === "history"}
          onClick={() => openInfo("history")}
        >
          History
        </button>
        <button
          className="button small"
          aria-pressed={infoSection === "payoffs"}
          onClick={() => openInfo("payoffs")}
        >
          Payoffs
        </button>
      </nav>
      <details
        ref={scoresRef}
        tabIndex={-1}
        open={match.phase === "waiting" || terminal}
        className="match-roster"
      >
        <summary>Players & scores</summary>
        <ul className="list">
          {match.seats.map((s) => (
            <li className="listItem" key={s.id}>
              <strong>
                {s.name} · {s.kind}
                {s.kind === "external" || s.kind === "visual"
                  ? " · owned by " + (s.ownerName ?? s.ownerId?.slice(0, 6))
                  : ""}
              </strong>
              <span>
                {s.score} noodles ·{" "}
                {s.abandoned
                  ? "left"
                  : s.botError
                    ? "bot error · timeout Cooperate if no decision"
                    : s.kind === "system"
                      ? terminal
                        ? "system player · finished"
                        : "system player · playing"
                      : match.phase === "waiting"
                        ? s.ready
                          ? "ready"
                          : "not ready"
                        : terminal
                          ? "finished"
                          : "playing"}
                {s.timeouts > 0 &&
                  ` · ${s.timeouts} automatic Cooperate (${s.timeouts === 1 ? "missed deadline" : "missed deadlines"})`}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <section
        ref={historyRef}
        tabIndex={-1}
        className="stack match-history"
        aria-label="Match history"
      >
        {own?.kind === "visual" && (
          <section
            aria-label="Your bot decisions"
            className="stack match-bot-feedback"
          >
            <h3>Your bot decisions</h3>
            <p className="muted">
              Private feedback for your frozen match strategy. Editing publishes
              a version for later games.
            </p>
            <Link href={"/bots/build?bot=" + own.botId + "&match=" + match.id}>
              Edit for the next game
            </Link>
            <p className="muted" role="status">
              {showAllFeedback
                ? `Showing all ${feedback.length} recorded decisions.`
                : `Showing latest ${Math.min(5, feedback.length)} of ${feedback.length} recorded decisions.`}
            </p>
            {feedback.length > 5 && (
              <button
                className="button small"
                onClick={() => setShowAllFeedback(!showAllFeedback)}
              >
                {showAllFeedback
                  ? "Show latest 5 decisions"
                  : "Show older decisions"}
              </button>
            )}
            {(showAllFeedback ? feedback : feedback.slice(0, 5)).map((d) => (
              <details key={d.round_number}>
                <summary>
                  Round {d.round_number} ·{" "}
                  {d.status === "error" ? "bot error" : "decision locked"}
                </summary>
                {d.error_code && (
                  <p className="danger">
                    {d.error_code} · missing decisions become timeout Cooperate.
                  </p>
                )}
                <ol>
                  {d.trace_json.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ol>
              </details>
            ))}
          </section>
        )}
        <details className="match-round-history">
          <summary>Round history</summary>
          {match.results.length === 0 ? (
            <p className="muted">
              Revealed rounds will appear here. Choices stay private until the
              reveal.
            </p>
          ) : (
            [...new Set(match.results.map((result) => result.round))]
              .sort((a, b) => b - a)
              .map((round) => (
                <details key={round}>
                  <summary>Round {round} results</summary>
                  {match.results
                    .filter((result) => result.round === round)
                    .map((result) => (
                      <div className="lockCard" key={result.pairId}>
                        <strong>
                          {
                            match.seats.find((seat) => seat.id === result.a)
                              ?.name
                          }
                          : {result.aMove}
                          {result.aSource === "timeout" &&
                            " (automatic Cooperate — timed out)"}{" "}
                          vs{" "}
                          {
                            match.seats.find((seat) => seat.id === result.b)
                              ?.name
                          }
                          : {result.bMove}
                          {result.bSource === "timeout" &&
                            " (automatic Cooperate — timed out)"}
                        </strong>
                        <p>{result.message}</p>
                        <span>
                          {result.aNet >= 0 ? "+" : ""}
                          {result.aNet} / {result.bNet >= 0 ? "+" : ""}
                          {result.bNet} noodles
                        </span>
                      </div>
                    ))}
                </details>
              ))
          )}
        </details>
      </section>
      <details ref={payoffRef} tabIndex={-1} className="match-payoffs">
        <summary>How the noodles add up</summary>
        <p className="muted">
          Net noodles for you and your opponent, after the round cost.
        </p>
        <div className="match-payoff-grid">
          <div className="match-payoff-cell">
            <strong>Both cooperate</strong>
            <span>+1 each</span>
          </div>
          <div className="match-payoff-cell">
            <strong>You betray, they cooperate</strong>
            <span>You +3 · them −2</span>
          </div>
          <div className="match-payoff-cell">
            <strong>You cooperate, they betray</strong>
            <span>You −2 · them +3</span>
          </div>
          <div className="match-payoff-cell">
            <strong>Both betray</strong>
            <span>−1 each</span>
          </div>
        </div>
      </details>
      {match.historyExpired && (
        <p role="status">
          Round details expired after 90 days. Final scores are retained.
        </p>
      )}
      {match.cancelReason === "empty" && (
        <p role="status">
          This waiting room closed after 15 minutes without connected
          participants. No points were credited. Start a new table to play.
        </p>
      )}
      {match.abortReason === "infrastructure" && (
        <p role="status">
          Match ended after a service interruption. No points were credited.
        </p>
      )}
      {match.interruptions > 0 && (
        <p className="danger">
          Service interrupted. Accepted moves were preserved.
        </p>
      )}
      {own && !own.abandoned && !terminal && (
        <>
          <p className="muted">
            Leaving preserves your locked decision and fills future rounds with
            timeout Cooperate. Scores still settle.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => onCommand("seat.leave", {})}
          >
            Leave table
          </button>
        </>
      )}
      {own?.kind === "human" && own.timeouts > 0 && (
        <p role="status">
          You missed {own.timeouts} decision{" "}
          {own.timeouts === 1 ? "deadline" : "deadlines"}. Those rounds used
          automatic Cooperate.
        </p>
      )}
      {terminal && (
        <p>Reopen these results from Your recent tables in Tables.</p>
      )}
    </section>
  );
}
