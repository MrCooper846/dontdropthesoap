"use client";
import { useRef } from "react";
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
  const receipt = useRef({
    serverTime: match.serverTime,
    receivedAt: Date.now(),
  });
  if (receipt.current.serverTime !== match.serverTime)
    receipt.current = { serverTime: match.serverTime, receivedAt: Date.now() };
  const own = match.seats.find((s) => s.id === match.ownSeatId),
    pair = match.pairs.find((p) => p.a === own?.id || p.b === own?.id),
    opponent = match.seats.find(
      (s) => s.id === (pair?.a === own?.id ? pair?.b : pair?.a),
    ),
    terminal = ["finished", "aborted", "cancelled"].includes(match.phase);
  return (
    <section className="panel stack yard-match" aria-label="Match panel">
      <div className="row">
        <h2>
          {terminal
            ? "Final results"
            : "Round " + match.round + "/" + match.settings.rounds}
        </h2>
        <button className="button small" onClick={onClose}>
          Close match view
        </button>
      </div>
      <p className="pill">
        {match.phase} ·{" "}
        {match.deadline
          ? Math.max(
              0,
              Math.ceil(
                (match.deadline -
                  match.serverTime -
                  (Date.now() - receipt.current.receivedAt)) /
                  1000,
              ),
            ) + "s"
          : ""}
      </p>
      {match.phase === "waiting" && (
        <>
          <p>Seats or settings changing clears readiness.</p>
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
        <>
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
          {own?.kind === "external" && (
            <p>
              Your bot {own.name} controls its own choices. You can keep
              walking.
            </p>
          )}
        </>
      )}
      {(match.phase === "revealing" || terminal) &&
        match.results
          .filter((r) => r.round === match.round)
          .map((r) => (
            <div className="lockCard" key={r.pairId}>
              <strong>
                {match.seats.find((s) => s.id === r.a)?.name}: {r.aMove} vs{" "}
                {match.seats.find((s) => s.id === r.b)?.name}: {r.bMove}
              </strong>
              <p>{r.message}</p>
              <span>
                {r.aNet >= 0 ? "+" : ""}
                {r.aNet} / {r.bNet >= 0 ? "+" : ""}
                {r.bNet} noodles
              </span>
            </div>
          ))}
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
              {s.abandoned ? "left" : s.ready ? "ready" : "not ready"}
            </span>
          </li>
        ))}
      </ul>
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
      {terminal && <p>Return to the yard or arrange another game.</p>}
    </section>
  );
}
