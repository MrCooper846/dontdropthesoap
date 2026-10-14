"use client";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { VoiceClient, type VoiceStatus } from "../client/voice/VoiceClient";
const initial: VoiceStatus = {
  connected: false,
  talking: false,
  peers: [],
  error: "",
};
export default function YardVoicePanel({
  socket,
  epoch,
  players,
}: {
  socket: Socket | null;
  epoch: number;
  players: { ownerId: string; name: string }[];
}) {
  const client = useRef<VoiceClient | null>(null);
  const [status, setStatus] = useState(initial),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState(""),
    [microphone, setMicrophone] = useState(false),
    [muted, setMuted] = useState(false),
    [spectators, setSpectators] = useState(false);
  const held = useRef(false);
  const release = () => {
    held.current = false;
    void client.current?.speaking(false);
    setStatus((s) => ({ ...s, talking: false }));
  };
  useEffect(() => {
    setStatus(initial);
    setMicrophone(false);
    held.current = false;
    const blur = () => release();
    window.addEventListener("blur", blur);
    const visibility = () => {
      if (document.hidden) release();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      client.current?.close();
      client.current = null;
    };
  }, [socket, epoch]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setLocalError("");
    try {
      await work();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Voice unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack" aria-label="Nearby voice">
      <div className="row">
        <h2>Nearby voice</h2>
        <span className="pill">
          {status.connected ? "connected" : "off"}
          {status.talking ? " · transmitting" : ""}
        </span>
      </div>
      <p className="muted">
        Nearby players may process what they hear through their own bots. The
        game does not record or transcribe voice.
      </p>
      {!status.connected ? (
        <button
          className="button"
          disabled={busy || !socket?.connected}
          onClick={() =>
            void run(async () => {
              client.current?.close();
              setMicrophone(false);
              setMuted(false);
              setSpectators(false);
              const voice = new VoiceClient(socket!, epoch, setStatus);
              client.current = voice;
              await voice.start();
            })
          }
        >
          Join nearby voice
        </button>
      ) : (
        <>
          {!microphone ? (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await client.current!.microphone();
                  setMicrophone(true);
                })
              }
            >
              Enable microphone
            </button>
          ) : (
            <>
              <button
                className={"button " + (status.talking ? "primary" : "")}
                disabled={muted}
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  held.current = true;
                  void client.current?.speaking(true).then(() => {
                    if (held.current)
                      setStatus((s) => ({ ...s, talking: true }));
                  });
                }}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    held.current = true;
                    void client.current?.speaking(true).then(() => {
                      if (held.current)
                        setStatus((s) => ({ ...s, talking: true }));
                    });
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    release();
                  }
                }}
                onBlur={release}
              >
                Hold to talk
              </button>
              <button
                className="button small"
                onClick={() => {
                  release();
                  setMuted(!muted);
                }}
              >
                {muted ? "Unmute microphone" : "Mute microphone"}
              </button>
            </>
          )}
          <label className="label">
            <input
              type="checkbox"
              checked={spectators}
              onChange={(e) => {
                const next = e.target.checked;
                setSpectators(next);
                void run(() => client.current!.settings(next));
              }}
            />{" "}
            Mute spectators while seated
          </label>
          <button
            className="button small"
            onClick={() => void run(() => client.current!.enableAudio())}
          >
            Enable audio
          </button>
          <button
            className="button small"
            onClick={() => {
              release();
              client.current?.close();
              client.current = null;
              setMicrophone(false);
              setStatus(initial);
            }}
          >
            Leave voice
          </button>
          <ul className="list" aria-label="Voice participants">
            {status.peers.map((p) => (
              <li key={p.ownerId}>
                {players.find((o) => o.ownerId === p.ownerId)?.name ??
                  "Nearby player"}{" "}
                · {p.transmitting ? "transmitting" : "listening"}
              </li>
            ))}
          </ul>
        </>
      )}
      {(localError || status.error) && (
        <p role="alert" className="danger">
          {localError || status.error}
        </p>
      )}
      <p className="muted">
        Voice reaches up to 8 tiles. Blocks apply in both directions. Nearby
        text stays available if audio fails.
      </p>
    </section>
  );
}
