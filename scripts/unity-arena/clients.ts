import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, openSync, closeSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { UnityStore } from "./store";
import { Bridge } from "./bridge";
import { settings } from "./config";
export type Client = {
  id: string;
  run_id: string;
  name: string;
  claimant: string;
  port: number;
  pid: number | null;
  executable: string;
  profile: string;
  status: string;
};

export async function launch(
  store: UnityStore,
  run: string,
  index: number,
  name: string,
  claimant: string,
) {
  const cfg = settings();
  if (process.platform !== "win32")
    throw Error("Launch native Windows Unity clients using Windows Node");
  if (
    !cfg.executable ||
    !existsSync(cfg.executable) ||
    !cfg.executable.toLowerCase().endsWith(".exe")
  )
    throw Error(
      "UNITY_ARENA_EXECUTABLE must identify the actual Unity Windows build",
    );
  if (!Number.isInteger(index) || index < 0 || index > 3)
    throw Error("Client slot must be0..3");
  const port = 21101 + index;
  const active = await store.db.query(
    "SELECT id FROM unity_arena.clients WHERE port=$1 AND status<>'closed'",
    [port],
  );
  if (active.rowCount)
    throw Error("Client slot already reserved; finish its owned session first");
  const id = randomUUID(),
    profile = resolve(cfg.profiles, run, id);
  const evidence = join(cfg.evidence, run);
  mkdirSync(profile, { recursive: true });
  mkdirSync(evidence, { recursive: true });
  await store.db.query(
    "INSERT INTO unity_arena.clients(id,run_id,name,claimant,port,executable,profile) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, run, name, claimant, port, cfg.executable, profile],
  );
  const output = openSync(join(evidence, id + ".stdout.log"), "a");
  const errors = openSync(join(evidence, id + ".stderr.log"), "a");
  try {
    const child = spawn(
      cfg.executable,
      [
        "--agent-port",
        String(port),
        "--profile",
        profile,
        "--server",
        cfg.server,
        "-logFile",
        join(evidence, id + ".unity.log"),
      ],
      { detached: true, windowsHide: false, stdio: ["ignore", output, errors] },
    );
    await new Promise<void>((resolveReady, reject) => {
      child.once("spawn", resolveReady);
      child.once("error", reject);
    });
    await store.db.query("UPDATE unity_arena.clients SET pid=$2 WHERE id=$1", [
      id,
      child.pid,
    ]);
    child.unref();
    const bridge = new Bridge(port),
      end = Date.now() + 60000;
    while (true) {
      try {
        await bridge.observe();
        break;
      } catch (error) {
        if (Date.now() > end) throw error;
        await delay(500);
      }
    }
    const observation = await bridge.act({ op: "nickname", value: name });
    await store.db.query(
      "UPDATE unity_arena.clients SET status='active' WHERE id=$1",
      [id],
    );
    await store.event(run, id, "client.started", {
      port,
      pid: child.pid,
      profile,
      observation,
    });
    return { id, port, pid: child.pid, observation };
  } catch (error) {
    await store.db.query(
      "UPDATE unity_arena.clients SET status='launch-failed' WHERE id=$1",
      [id],
    );
    await store.event(run, id, "client.launch-failed", {
      error: String(error),
    });
    throw error;
  } finally {
    closeSync(output);
    closeSync(errors);
  }
}

export async function stopOwned(store: UnityStore, client: Client) {
  if (client.pid) {
    if (process.platform !== "win32")
      throw Error("Owned Windows client cleanup requires Windows Node");
    const script = `Get-CimInstance Win32_Process -Filter 'ProcessId = ${client.pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
    const raw = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (raw) {
      const current = JSON.parse(raw) as {
        ExecutablePath: string;
        CommandLine: string;
      };
      if (
        resolve(current.ExecutablePath).toLowerCase() !==
          resolve(client.executable).toLowerCase() ||
        !current.CommandLine.includes(client.profile)
      )
        throw Error(
          "PID ownership changed; refusing to stop unrelated process",
        );
      process.kill(client.pid);
      const end = Date.now() + 10000;
      while (true) {
        try {
          process.kill(client.pid, 0);
        } catch {
          break;
        }
        if (Date.now() > end) throw Error("Owned Unity process did not exit");
        await delay(100);
      }
    }
  }
  await store.db.query(
    "UPDATE unity_arena.clients SET status='closed' WHERE id=$1",
    [client.id],
  );
  await store.event(client.run_id, client.id, "client.closed", {});
}

export async function restartOwned(store: UnityStore, client: Client) {
  let previous: Awaited<ReturnType<Bridge["observe"]>> | undefined;
  try {
    previous = await new Bridge(client.port).observe();
  } catch {
    /* Restart also recovers an unreachable owned process. */
  }
  await stopOwned(store, client);
  const cfg = settings(),
    evidence = join(cfg.evidence, client.run_id);
  const output = openSync(join(evidence, client.id + ".stdout.log"), "a");
  const errors = openSync(join(evidence, client.id + ".stderr.log"), "a");
  try {
    await store.db.query(
      "UPDATE unity_arena.clients SET status='starting',pid=NULL WHERE id=$1",
      [client.id],
    );
    const child = spawn(
      client.executable,
      [
        "--agent-port",
        String(client.port),
        "--profile",
        client.profile,
        "--server",
        cfg.server,
        "-logFile",
        join(evidence, client.id + ".unity-reconnect.log"),
      ],
      { detached: true, windowsHide: false, stdio: ["ignore", output, errors] },
    );
    await new Promise<void>((ok, reject) => {
      child.once("spawn", ok);
      child.once("error", reject);
    });
    child.unref();
    await store.db.query("UPDATE unity_arena.clients SET pid=$2 WHERE id=$1", [
      client.id,
      child.pid,
    ]);
    const bridge = new Bridge(client.port),
      end = Date.now() + 60000;
    let observation;
    while (true) {
      try {
        observation = await bridge.observe();
        if (reconnectReady(observation, previous)) break;
        if (Date.now() > end)
          throw Error("Native reconnect did not restore its profile/session");
        await delay(200);
      } catch (error) {
        if (Date.now() > end) throw error;
        await delay(500);
      }
    }
    await store.db.query(
      "UPDATE unity_arena.clients SET status='active' WHERE id=$1",
      [client.id],
    );
    await store.event(client.run_id, client.id, "client.reconnected", {
      pid: child.pid,
      observation,
    });
    return { id: client.id, pid: child.pid, observation };
  } catch (error) {
    await store.db.query(
      "UPDATE unity_arena.clients SET status='launch-failed' WHERE id=$1",
      [client.id],
    );
    throw error;
  } finally {
    closeSync(output);
    closeSync(errors);
  }
}

export function reconnectReady(
  state: Awaited<ReturnType<Bridge["observe"]>>,
  previous?: Awaited<ReturnType<Bridge["observe"]>>,
) {
  return (
    state.connected === true &&
    !!state.playerId &&
    !!state.screen &&
    !state.busy &&
    (!previous?.playerId || state.playerId === previous.playerId) &&
    (!previous?.shiftId ||
      (state.shiftId === previous.shiftId &&
        ["waiting", "active", "finished"].includes(String(state.shift?.phase))))
  );
}
