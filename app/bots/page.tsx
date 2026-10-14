"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Session = {
  features?: { yard: boolean; externalBots?: boolean; visualBots?: boolean };
  csrfToken: string;
  controllerEpoch: number;
  name: string;
};
type Bot = {
  id: string;
  name: string;
  features?: { yard: boolean; externalBots?: boolean; visualBots?: boolean };
  kind: string;
  online: boolean;
  revision: number;
};
export default function Bots() {
  const [session, setSession] = useState<Session | null>(null),
    [bots, setBots] = useState<Bot[]>([]),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [secret, setSecret] = useState(""),
    [credentials, setCredentials] = useState<
      Record<
        string,
        { id: string; expires_at: string; revoked_at: string | null }[]
      >
    >({});
  useEffect(() => {
    fetch("/api/v1/session")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSession);
  }, []);
  async function api(path: string, data?: unknown, method = "POST") {
    const response = await fetch("/api/v1" + path, {
      method: data === undefined ? "GET" : method,
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": session?.csrfToken ?? "",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error?.message ?? "Request failed");
    return result;
  }
  async function refresh() {
    setBots((await api("/bots")).bots);
  }
  useEffect(() => {
    if (!session) return;
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => void refresh().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [session?.csrfToken]);
  async function run(work: (epoch: number) => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      const control = await api("/controller/acquire", {});
      setSession({ ...session!, controllerEpoch: control.controllerEpoch });
      await work(control.controllerEpoch);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function resource(path: string, payload: unknown, epoch: number) {
    const { key } = await api("/command-keys", {});
    return api(path, {
      commandId: crypto.randomUUID(),
      key,
      controllerEpoch: epoch,
      payload,
    });
  }
  return (
    <main className="screen stack">
      <header>
        <h1 className="brand">Your bot stable</h1>
        <p className="subtitle">
          Bring your own machinery. The noodles judge everyone equally.
        </p>
      </header>
      <Link
        className="button"
        href={session?.features?.yard ? "/yard" : "/play"}
      >
        Back to tables
      </Link>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      {!session ? (
        <p>Enter a guest alias on the tables page first.</p>
      ) : (
        <>
          {session.features?.visualBots && (
            <Link className="button primary" href="/bots/build">
              Build a visual bot
            </Link>
          )}
          {session.features?.externalBots !== false && (
            <section className="panel stack">
              <h2>Register an external bot</h2>
              <label className="label">
                Bot name
                <input
                  className="input"
                  value={name}
                  maxLength={32}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !name.trim()}
                onClick={() =>
                  void run(async (epoch) => {
                    await resource("/bots", { name }, epoch);
                    setName("");
                  })
                }
              >
                Register bot
              </button>
              <p className="muted">
                You run the bot on your own machine. It receives official
                observations and submits Cooperate or Betray. Its runtime and
                model costs are yours.
              </p>
            </section>
          )}
          {secret && (
            <section className="panel stack">
              <h2>Save this credential</h2>
              <p>
                Shown once. Store it as SOAP_BOT_TOKEN on the machine running
                your bot.
              </p>
              <textarea
                aria-label="Bot credential"
                className="input"
                readOnly
                value={secret}
              />
              <button
                className="button"
                onClick={() => void navigator.clipboard.writeText(secret)}
              >
                Copy credential
              </button>
              <button className="button" onClick={() => setSecret("")}>
                Hide credential
              </button>
            </section>
          )}
          {bots.map((bot) => (
            <section className="panel stack" key={bot.id}>
              <div className="row">
                <h2>{bot.name}</h2>
                <span className="pill">
                  {bot.online ? "Online" : "Offline"}
                </span>
              </div>
              <p>
                {bot.kind === "visual" ? "Visual" : "External"} · revision{" "}
                {bot.revision}
              </p>
              {bot.kind === "visual" ? (
                <>
                  <Link className="button" href={"/bots/build?bot=" + bot.id}>
                    Edit strategy
                  </Link>
                  <Link className="button" href={"/yard?bot=" + bot.id}>
                    Enter bot in the yard
                  </Link>
                </>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (epoch) => {
                        const result = await resource(
                          "/bots/" + bot.id + "/credentials",
                          {},
                          epoch,
                        );
                        setSecret(result.secret ?? "");
                        if (result.secretUnavailable)
                          throw new Error(
                            "Credential already issued. Revoke it and issue another if you lost the response.",
                          );
                      })
                    }
                  >
                    Issue credential
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      void api("/bots/" + bot.id + "/credentials")
                        .then((r) =>
                          setCredentials((old) => ({
                            ...old,
                            [bot.id]: r.credentials,
                          })),
                        )
                        .catch((e) => setError(e.message))
                    }
                  >
                    Manage credentials
                  </button>
                  {credentials[bot.id]?.map((c) => (
                    <div className="row" key={c.id}>
                      <span>
                        {c.id.slice(0, 8)} ·{" "}
                        {c.revoked_at
                          ? "revoked"
                          : "expires " +
                            new Date(c.expires_at).toLocaleDateString()}
                      </span>
                      {!c.revoked_at && (
                        <button
                          className="button small"
                          disabled={busy}
                          onClick={() =>
                            void run(async (epoch) => {
                              await api(
                                "/bots/" + bot.id + "/credentials/" + c.id,
                                { controllerEpoch: epoch },
                                "DELETE",
                              );
                              const list = await api(
                                "/bots/" + bot.id + "/credentials",
                              );
                              setCredentials((old) => ({
                                ...old,
                                [bot.id]: list.credentials,
                              }));
                            })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="muted">
                    Run the Python or TypeScript reference client with your
                    credential, then enter this bot at a mixed table. Your
                    browser can watch while the bot makes its own decisions.
                  </p>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </main>
  );
}
