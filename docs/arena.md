# Local multiplayer arena

The arena is an isolated copy of the production game for several browser players and locally executed visual bots. It has its own persistent PostgreSQL database, overseer, issue ledger and evidence directory. Microphone, touch and physical-device testing are outside its scope.

Run commands inside Ubuntu, from `/home/monke/Dev/Active/dontdropthesoap`.

## Start and run

```sh
npm run arena:prepare
npm run arena:up
npm run arena:overseer:start
npm run arena:run
```

Open the overseer at **http://127.0.0.1:3146**. The arena game is **https://127.0.0.1:3445/yard**. Both are loopback only. The game uses a dedicated Caddy test CA; the runner accepts this local certificate without changing Windows/browser trust. No microphone or media ports are opened.

`arena:prepare` creates `.env.arena` once with random secrets, then preserves it. Do not remove or regenerate this file casually: the persisted database password and player sessions depend on it.

The Compose project is `soap-arena`; PostgreSQL is `soap_arena` on loopback port 55435, with named volume `soap-arena_arena-db`. Its certificate volume is `soap-arena_arena-caddy`. The phone playtest and development databases are separate. Docker storage remains on D:. The game and in-game bots execute on the laptop; Codex agent reasoning still requires its normal online service.

To repeat the scenario set three times:

```sh
npm run arena:run -- 3
npm run arena:status
```

Cycles are bounded to 1â€“20. One suite runs at a time, with four separate browser identities sharing one Chromium process. Different tables run concurrently. A failed scenario ends the run with a nonzero CLI exit status, captures evidence and attempts to release its seats. A cleanup failure is explicitly logged. It does not truncate the database or erase old games/issues. An interrupted active game may need to reach its normal deadlines before its table becomes available again.

Stop without deleting data:

```sh
npm run arena:overseer:stop
npm run arena:down
```

The overseer is a Ubuntu systemd user service, not a scheduled automation. `arena:overseer:start` keeps it running after the command exits and restarts it on process failure. After a laptop/WSL shutdown, start the stack and overseer again. Foreground alternative: `npm run arena:overseer`. Logs: `journalctl --user -u soap-arena-overseer`. Do not run `docker compose down -v`, prune these volumes, or treat the recovery copy of Docker's disk as a fresh arena backup.

## Included multiplayer scenarios

1. Two humans finish a five-round match while two bot owners publish and deploy Cooperate versus Betray at another table. One human reloads/re-enters, finds the table and continues with the same seat.
2. All four players deploy bots at two concurrent tables: Tit-for-tat versus Betray, and Cooperate versus Betray. An owner publishes a revised strategy after seating the old revision; the running seat must keep its original published revision.
3. Three players race for the final seat of a two-seat table. Exactly one succeeds; other players receive the documented capacity rejection, with no duplicate owners or excess seats.

Publication and initial deployment use the real builder and yard UI. Timing configuration, some readiness/start operations and the deliberate join race use the public authenticated game API, not direct state injection. The observer reads the arena database to compare committed results. The runner does not fabricate bot decisions: actual visual-bot workers choose them.

Assertions check both players' final views, known independent scores, seat types, zero timeouts, pinned bot revisions, five round results and exactly-once persisted results. Bot decision feedback is retained. JavaScript page errors and game HTTP 5xx responses become issues as they happen. Browser traces provide the lower-level UI/network history alongside the high-level event ledger.

## Parallel Codex players

The harness does not spawn or schedule Codex agents. A coordinator starts an agent session, then gives each agent a distinct player and claimant name. Each agent uses the CLI/API against its own browser; actions on one player are serialised, while separate players can act concurrently. The current local cap is 12 live browser players.

```sh
npm run arena -- call POST /api/sessions '{"name":"bot tournament exploration"}'
# Use the returned runId for every player in this shared session.
npm run arena -- call POST /api/players '{"runId":"RUN_UUID","name":"Builder Ada","claimant":"agent-ada"}'
npm run arena -- call POST /api/players '{"runId":"RUN_UUID","name":"Builder Bert","claimant":"agent-bert"}'
```

Player creation returns the player UUID, screen text, current visible controls/options, authoritative yard view and screenshot filename. Continue through the player's action endpoint:

```sh
npm run arena -- call POST /api/players/PLAYER_UUID/actions '{"claimant":"agent-ada","action":{"op":"goto","path":"/bots/build"}}'
npm run arena -- call POST /api/players/PLAYER_UUID/actions '{"claimant":"agent-ada","action":{"op":"fill","label":"Bot name","value":"Ada mirror"}}'
npm run arena -- call POST /api/players/PLAYER_UUID/actions '{"claimant":"agent-ada","action":{"op":"select","label":"Starter strategy","value":"tit-for-tat"}}'
npm run arena -- call POST /api/players/PLAYER_UUID/actions '{"claimant":"agent-ada","action":{"op":"click","target":{"role":"button","name":"Load starter"}}}'
npm run arena -- call POST /api/players/PLAYER_UUID/actions '{"claimant":"agent-ada","action":{"op":"click","target":{"role":"button","name":"Publish strategy"}}}'
```

Additional actions:

| Action | Fields | Purpose |
| --- | --- | --- |
| `observe` | none | Screen, controls/options, screenshot and yard snapshot |
| `goto` | `path` | Allowed game pages only, including `/yard?bot=BOT_UUID` |
| `click` | `target: {role,name}` | Exact accessible button/link/etc. |
| `clickText` | `text` | Exact visible text, such as a circle name or settings summary |
| `fill` | `label,value` | Fill a labelled field |
| `select` | `label,value` | Select a returned option value |
| `press` | `key` | Enter, Escape, Tab or arrow key |
| `walk` | `x,y` | Walk with game keyboard input, no teleporting |
| `pane` | `name` | Open Tables, Chat or People |
| `circle` | `name` | Inspect a named circle through its table-list button |
| `reload` | none | Reload the actual player page |

Use observations to select controls. Do not assume a successful click means the intended game action succeeded. After a reload or navigating back to the yard, click Enter yard. `walk` closes overlays, then walks horizontally followed by vertically; choose waypoints around obstacles. Opening Match settings exposes the Rounds, Decision seconds and Seats fields. Use the `circle` action to inspect a circle by name; it distinguishes the table-list button from the map prompt. The returned select options supply bot identifiers for Enter as. A failed exploratory instruction is recorded as `action.failed`, not automatically classified as a game bug.

Suggested agent briefs: one agent publishes and hosts; another challenges with a different bot; a third tries to join occupied tables or watches, then hosts its own; the coordinator compares observations and asks for reproductions. Keep account identities and claimant names separate. Claimants prevent accidental cross-control; all agents share the local overseer trust boundary, rather than receiving mutually hostile security accounts. Do not blindly retry a timed-out mutation: observe first.

Finish the agent session explicitly:

```sh
npm run arena -- call POST /api/sessions/finish '{"runId":"RUN_UUID","outcome":"passed"}'
```

This releases owned active seats where possible, saves traces and closes browsers. The game records, session history and issues remain. Overseer restarts mark unfinished runs interrupted and live player handles disconnected; they do not claim an interrupted run passed or resume agent reasoning automatically.

## Issue tracking and evidence

Report a suspected kink immediately, then add follow-up evidence through another report using the same stable fingerprint:

```sh
npm run arena -- call POST /api/issues '{"runId":"RUN_UUID","title":"Joining leaves players seeing different seats","severity":"bug","fingerprint":"join-seat-divergence","detail":{"playerIds":["PLAYER_UUID"],"matchId":"MATCH_UUID","expected":"Both see the same two seats","actual":"One sees three","steps":["..."],"screenshot":"data/arena/RUN_UUID/FILE.png"}}'
npm run arena -- call POST /api/issues/ISSUE_UUID '{"status":"investigating","note":"Reproducing with a third player"}'
```

Severities: `bug`, `needs-triage`, `usability`. Statuses: `open`, `investigating`, `resolved`, `dismissed`. Matching fingerprints increment occurrences and preserve each occurrence's run and detail. A recurring resolved issue reopens. Mark harness mistakes dismissed with an explanatory note; do not call them confirmed game bugs. Triage notes are recorded as events.

The dashboard polls live state and lists issues, runs and recent activity. `arena:status` exposes the same information. Data lives in the database's `arena` schema, separate from game tables. Evidence files live in ignored `data/arena/RUN_UUID/`: screenshots, Playwright trace ZIPs, player session files and a scripted-run JSON report. Database persistence does not replace those files; retain both the volume and directory when backing up.

Traces and session files contain synthetic test credentials. Keep them local. The HTTP evidence route refuses session files; trace files still contain sensitive test-session material. Agent mutations require the private local overseer token, loaded by the CLI from `.env.arena`. Do not paste that file or publish trace archives. The dashboard is read-only; issue triage and player actions use the CLI. Foreign browser origins and non-loopback Host headers are rejected.

The database is never automatically reset between runs. This catches accumulated state problems, but histories and traces grow; review disk usage before sustained testing. No cleanup task silently deletes evidence. The initial scenarios are deterministic regression probes, not proof of exhaustive exploratory coverage, external-bot clients or all league behaviour. Agents can explore those flows using the provided UI controls, and new scenarios can be added to `scripts/arena/scenarios.ts` as bugs become reproducible.


## Verified checkpoint â€” 22 October 2026

The arena and overseer are running locally. Final repeated run `21f1ced9-904a-4c42-9de2-ef2deb8cb640` passed two cycles: six scenario executions, eight completed five-round matches (six bot-versus-bot and two human-versus-human), and two last-seat races. All player-view, expected-score, revision-pinning and database result assertions passed. The separate agent-interface run `d15c4fcf-48e0-4c0d-aa34-4bb382003925` used two independent controllers to publish and deploy visual bots through the same local action API available to agents, then verified completion and scores. These were automated controller checks, not a claim that autonomous Codex agents explored the whole game.

The database and overseer were stopped/restarted; existing game records, issue occurrence history and triage status survived, and unfinished work was marked interrupted. Independent-player control, claimant fencing, foreign-origin rejection, unauthenticated-mutation rejection, issue deduplication and reopening passed. Six focused verifier/isolation tests, TypeScript, repository formatting, 75 documentation paths and a live dashboard browser check passed. Windows can reach the dashboard on loopback.

Harness-development failures and the intentional ledger self-check remain recorded with dismissal notes. No confirmed game defect was found by the final passing scenarios. This is a starting regression set plus an agent control surface; broader exploratory sessions and additional adversarial game scenarios remain useful work.

Harness validation utilities: `npx tsx scripts/arena/verify-agents.ts` runs a complete two-controller bot deployment; `npx tsx scripts/arena/verify.ts before` sets up the control/ledger checkpoint, and `after` verifies it following a deliberate arena-only database/overseer restart. Run these only when no other arena session is active. They preserve labelled validation history rather than deleting it.


The first actual parallel-agent exploration is recorded in [the 22 October findings](arena-exploration-2026-10-22.md), including six issues subsequently fixed and an independent audit of three completed games.


## Six-finding regression check

Run `npx tsx scripts/arena/verify-six-fixes.ts` against the running, otherwise idle arena to exercise the first exploration's fixes. It publishes and seats two bots with a human, checks independent-owner history visibility, preserves My table while inspecting an empty circle, round-trips through the editor/reload, reopens recent results, rejects invalid settings with field guidance, checks challenge rejection wording and active Clanker status, and deliberately times the human out to verify automatic-Cooperate feedback. It uses a fresh arena run and identities and preserves its game data/evidence. It does not clear other tests' records.

The yard now keeps its owned-table dock independently of its currently watched/inspected table. Tables includes Your recent tables, supplied by an authenticated owner-filtered listing. The human entrant's active game takes dock priority if an owner is also fielding a bot. My table has a stable accessible label for agents. Result decision-source metadata is public only after resolution; a locked choice's own source remains private to its seat.

On 22 October, run `989136ca-f7e4-4283-a128-3e005dd2fd04` passed all six reproduction checks and history ownership isolation. TypeScript, formatting and 113 unit tests passed. Three independent agents subsequently verified all six fixes and completed four further games. Original findings are resolved; one new spectator-navigation usability issue remains open. See the [fix verification report](arena-fix-verification-2026-10-22.md) for evidence and coverage limits.


## Spectator shortcut verification

Commit `14d8d5d` retains Watching separately from My table across in-yard panels and table switches. Three independent agents verified the fix, including background updates to completed results. They played three further games, including simultaneous human/bot tables, departure/rejoin and revised-bot rematches. The independent 35-round/70-move audit passed. One new open usability issue concerns Bot playing on an abandoned seat. See the [spectator verification report](arena-spectator-verification-2026-10-22.md) for evidence and limits.


## Bot maker exploration

Commit `1213bea` labels departed active seats Left table before showing Results at completion. The arena selector in `90d18d0` uses exact labels for editor controls. Three agents built distinct custom bots through the actual maker: round threshold, persistent counter and 25% random cooperation. Two games passed independent scoring and custom-decision audits (15 rounds, 40 moves); departure/reload/result labels passed, with no new confirmed finding. See the [bot maker report](arena-bot-maker-verification-2026-10-22.md) for evidence and coverage.


## Complex bot stress exploration

Three agents built 19â€“22-block nested, history/score-based, stochastic and two-memory strategies through the actual maker, then played two maximum-length 50-round games. All 400 moves and 300 visual decisions passed independent scoring and strategy replay; revisions stayed frozen and fresh-game memory reset passed. Two open usability findings concern the undisclosed five-decision feedback window and generic invalid-practice failure beside stale results. A selector limitation is separately recorded as harness needs-triage. See the [complex bot stress report](arena-complex-bot-stress-2026-10-22.md) for evidence, coverage and the controller fallback used.


## Stress-finding fix verification

Commit `a1d73c8` adds disclosed/expandable bot feedback, practice-round validation and stale-response protection, and stable labelled dropdown selection. Run `npx tsx scripts/arena/verify-stress-fixes.ts` against an otherwise idle arena to check all three fixes, including delayed preview responses and a real 12-round game. The driver respects the two-previews-per-second limit and preserves its records.

The browser regression passed, followed by three independent agents building fresh complex bots and playing two 50-round games. All 400 moves and 300 visual decisions passed scoring and strategy replay with zero timeouts; history expansion/collapse/reset, practice guidance/clearing and short selectors passed. Original findings are resolved. One new open usability finding concerns generic arithmetic-overflow practice diagnostics. See the [stress fix verification report](arena-stress-fix-verification-2026-10-22.md).


## Overflow diagnostic verification

Commit `6ba1a89` gives arithmetic overflow actionable numeric/memory guidance. A real-worker overflow/recovery regression and all 114 tests passed. Three agents independently verified the fix, built fresh 18–21-block policies and completed two 50-round games. All 400 moves and 300 visual decisions passed independent scoring and strategy replay with zero timeouts/errors. One new open usability issue concerns nonfinite literal `1e309` reporting only Invalid JSON value. See the [overflow verification report](arena-overflow-fix-verification-2026-10-22.md) for evidence and live branch-coverage limits.
