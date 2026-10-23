# Native Unity arena

This harness controls four **actual Windows Unity executables** through their
loopback agent bridge. It never sends gameplay mutations to the restaurant API.
`interact` requires an enabled visible control before dispatch and invokes the
same native handler as a human click. Movement uses the native movement input.

Bundle with WSL's installed esbuild, then execute with **Windows Node**. The
Linux-installed tsx runtime cannot run directly on Windows because its esbuild
binary is platform-specific. Portable Node packages remain external.

```
wsl -d Ubuntu --cd /home/monke/Dev/Active/dontdropthesoap -- node_modules/.bin/esbuild scripts/unity-arena/main.ts --bundle --platform=node --format=cjs --packages=external --outfile=data/unity-arena/control.cjs
```

Use Windows working directory
`\\wsl.localhost\Ubuntu\home\monke\Dev\Active\dontdropthesoap` so the private
`.env.unity` resolves correctly. Execute `node data/unity-arena/control.cjs`
there, or use the full UNC bundle path. The private `.env.unity` supplies
`UNITY_DATABASE_URL`; it must point at the isolated local
`127.0.0.1:55436/soap_unity_restaurant`. Credentials are never printed.
Optional `UNITY_ARENA_EXECUTABLE`, `UNITY_ARENA_SERVER`, `UNITY_ARENA_PROFILES`,
and `UNITY_ARENA_EVIDENCE` override the local build/profile/evidence locations.
The default native build is
`D:/Unity/Projects/SoapMultiplayer/Build/SoapMultiplayer.exe`.

```
node data/unity-arena/control.cjs start native-four-player-acceptance
node data/unity-arena/control.cjs observe CLIENT_UUID CLAIMANT
node data/unity-arena/control.cjs act CLIENT_UUID CLAIMANT '{"op":"interact","name":"VISIBLE CONTROL"}'
node data/unity-arena/control.cjs act CLIENT_UUID CLAIMANT '{"op":"walkTo","name":"STATION ID"}'
node data/unity-arena/control.cjs act CLIENT_UUID CLAIMANT '{"op":"task","name":"Mix table 1"}'
node data/unity-arena/control.cjs reconnect CLIENT_UUID CLAIMANT
node data/unity-arena/control.cjs issue RUN_UUID usability fingerprint "Title" "Steps, actual/expected, screenshot paths"
node data/unity-arena/control.cjs triage ISSUE_UUID resolved "Retest evidence"
node data/unity-arena/control.cjs audit SHIFT_UUID
node data/unity-arena/control.cjs finish RUN_UUID passed
```

`start` reserves ports21101–21104 and independent profiles for Ada/Bert/Cora/Overseer.
`finish` stops only the recorded executable PID whose current executable path
and command line still identify its owned profile. It retains profiles, logs,
screenshots, runs, events, and issue occurrences. It refuses to kill a reused PID.
An unreachable/stale reserved port requires explicit owner cleanup, not takeover.

Persistent tables live in `unity_arena` within the Unity database. Opening the CLI
does not reset data or falsely interrupt another agent's running session.
The economic audit reads canonical shift JSON and immutable wallet entries,
checks one credit per participant, duplicate credits and revenue-minus-expenses
conservation. It does not repair state.

## First playable acceptance

Use four different roles and at least one real120-second shift; do not force
the clock. Coordinate to cover the following using visible native controls:

1. Create/join/assign roles/ready; host starts only when all four are ready.
2. Chef makes food, barman makes drink, waiter physically collects/hands off
   and serves the same order, runner washes and restocks only when needed.
3. Walk into stations and other players; verify collision and reachable paths.
   Drop an item, observe it in world, have another eligible player collect it.
4. Deposit proceeds; prepare theft, wait the actual deadline, take and return.
   Then coordinate caller+support search, caught funds restored, theft blocked.
5. Restart a single owned native client with the same profile, recover identity,
   active shift, position and wallet without duplicate payout. Do not reset data.
6. Capture all four private receipts after normal finish; run `audit SHIFT_UUID`.
   Restart the service/client only with overseer authorisation, then verify the
   immutable credits and wallets persisted. Retain screenshot/trace paths.

Expected rule rejection, human-control timing mistakes, launch/bridge failures,
and actual game defects must be distinguished in ledger notes. Unfinished or
interrupted sessions must never be marked passed.

The harness-only `task` macro clicks the visible begin control and expected token buttons at their actual server deadlines, recording every step; it never sends a task opcode to Unity or mutates gameplay over HTTP. Native windows remain visible so full HUD screenshots can render. Screenshot completion requires an actual nonempty file, not merely a returned path.
