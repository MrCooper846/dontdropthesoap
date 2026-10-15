# Don't Drop The Soap

A social betrayal game about humans, bots and questionable noodle-related decisions.

The target is a cartoon 2D prison yard where people hang out, talk, challenge one another and enter bots into matches. Keep the rules predictable and let the participants be unpredictable.

## Actual implementation status

The integration branch now contains a playable authenticated match foundation. PostgreSQL owns guest sessions, matches, accepted moves, round results, command receipts and social score settlement. Players ready up, play simultaneous cooperate/betray rounds, see results and leave or create a new match. Odd tables use the system Clanker.

Owned external bots now participate through scoped HTTP/Socket.IO credentials and a fenced controller lease. The bot page supports registration and credential issuance/revocation, and mixed tables admit an owned bot while its owner watches. Runnable Python and TypeScript clients are in [examples/bots](examples/bots/README.md).

The shared cartoon yard now runs authoritative desktop/mobile movement, four circle entry points, human/mixed matches, spectators, direct challenges, nearby text and block/report. Bot owners keep their human presence and can walk while their bot plays.

Proximity voice is integrated behind FEATURE_VOICE=true, with server-owned media consumers, explicit microphone access, push-to-talk, mute and a spectator filter. Real-browser synthetic RTP privacy checks pass, but the remaining voice/device gates are incomplete. The visual builder now has a verified create/test/publish/play/edit flow, enabled by default. The bot league has a verified mixed-bot registration/schedule/standings/replay flow, including physical crash/retry recovery, and is enabled by default. This is **not a release candidate**. The execution record in [docs/goal-mode-plan.md](docs/goal-mode-plan.md) is the canonical progress checkpoint.

The original party MVP remains a local-only legacy demo. Its unauthenticated handlers are absent from the new game server.

## Run the current match foundation

Prerequisites: Node.js 22 or newer, npm, Docker with Compose, and a browser.

```bash
npm ci
cp .env.example .env
npm run services:up
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Save a guest alias, enter the yard, and use WASD/arrows or the touch joystick. Approach a circle and inspect it using its map marker, E/Interact, or the accessible circle list. Create/join personally or enter an owned bot at mixed tables. Each owner readies their entrant before the host starts. Other yard members can watch; a human seat stays anchored, while a bot owner remains free to walk. Nearby players can exchange expiring direct challenges. A new browser tab can explicitly take controller authority; earlier controller epochs cannot write.

Defaults are 10 rounds, 20-second decisions, five-second reveals and at most eight entrants. The first accepted move locks. Missing moves become C at the deadline. Leaving an active match retains the seat and accepted move; future moves become timeout C. Match scores start at zero; completed social scores settle to a separate lifetime ledger.

Guest access depends on the HttpOnly session cookie. Losing that cookie loses access; account recovery is not implemented.

Compose binds local PostgreSQL to 127.0.0.1:55432. Its sample credentials and development secrets are local-only. Production validates HTTPS and requires unique secrets. Hosting/media setup and public deployment remain separate gates.

## Verification

```bash
npx playwright install --with-deps chromium
npm run test:setup
npm test
npm run typecheck
npm run lint
npm run test:integration
npm run test:browser
npm run test:alpha
npm run test:yard
npm run test:visual
npm run test:league
npm run test:league-recovery
npm run test:migrations
npm run test:voice
npm run test:recovery
npm run test:database-outage
npm run build
npm run test:shutdown
npm audit
```

Run browser, physical-recovery and production-build checks sequentially: their Next.js processes share the checkout's .next directory. test:integration uses the isolated soap_test database; test:alpha uses soap_browser; test:recovery uses soap_recovery; test:yard uses soap_yard_browser; test:visual uses soap_visual_browser. The integration suite refuses another database and truncates only that test database.

test:browser exercises the local legacy baseline and Phaser/Blockly lifecycle and emulated touch spikes. These are prototypes, not completed yard/editor features. test:alpha exercises the authenticated match UI, actual HTTP/socket visibility, hostile commands, Clanker, bot management and real Python/TypeScript processes against a human. test:recovery kills and restarts real game processes, verifies committed hidden human/bot moves, controller fencing, bot-process reconnection and singleton exclusion.

lint checks new source formatting; typecheck checks TypeScript. test:yard verifies real keyboard/touch movement, circle admission/capacity, malicious teleport/controller packets, direct challenge completion/expiry, a roaming external-bot owner, spectators, markup-safe proximity text, bidirectional blocks, durable reports, resize and alias-preserving reload.

test:voice uses real browser WebRTC and the native mediasoup worker, including a listener that ignores closure events, distance/block denial, stalled-policy closure, native fake-device push-to-talk and native permission denial. Synthetic tracks and fake devices do not prove real mobile audio. Republish, controller takeover, session expiry/revocation, owner disable, bot exclusion and seated spectator routing are also exercised. Physical-device gates remain pending.

For local voice, set FEATURE_VOICE=true in .env and restart the service. Join nearby voice explicitly, then enable the microphone and hold the talk button (pointer, Space or Enter). The native worker uses the configured UDP/TCP range; local defaults bind to loopback. For local Firefox media, set VOICE_LISTEN_IP to the machine's local network-interface address; the localhost-only ICE setup did not connect in Firefox. The browser suite uses a local interface and includes Chromium, Firefox and WebKit engine checks. Production requires HTTPS and an announced reachable media address. Real mobile devices, human playtests, full load/soak and deployment-environment recovery remain pending; local restore and actual-binary rollback checks pass.

## Visual bot builder

The builder is enabled by default (FEATURE_VISUAL_BOTS=false disables it). Open Your bots → Build a visual bot. Connect blocks by dragging or with the labelled block controls. Every branch needs a Cooperate/Betray choice. Try a private practice decision, then publish and enter the bot at a mixed circle. Its owner stays free to move and sees private execution feedback at the table.

Published versions are immutable. Editing creates a version for later games; current seats retain the admitted version. Named memory and seeded randomness persist within the match and reset for a new match. Guest-cookie loss still loses access.

The build/dev/test commands compile the trusted worker into dist/workers/visual-worker.mjs. Include dist/workers in a release package. Uploaded Blockly JSON is compiled into a restricted program; uploaded JavaScript is never executed.

test:visual covers manual tit-for-tat construction, private practice, publication, full human-versus-visual play, feedback, revision, native HTTP security and emulated-touch construction/drag/rotation/reload. test:migrations creates and removes a uniquely named temporary database on the local development PostgreSQL only, proving fresh and repeated schema application. Real-device editor usability remains a release gate.

## Legacy data and demo

```bash
npm run dev:legacy
npm run legacy:archive
```

The legacy demo binds only to localhost and refuses production mode. Run it with a distinct port if the new server is running. It uses browser localStorage identities and the old SQLite ledger; these IDs never authenticate new guests.

legacy:archive leaves the source untouched and writes a versioned export, copied SQLite file, row counts and SHA-256 under ignored data/legacy-archives. Private archives must not be committed. The initial checkout had no legacy ledger; the first archived ledger contains synthetic baseline-browser records.

## Code map

| Path | Responsibility |
| --- | --- |
| server.ts | Authenticated HTTP/Socket.IO composition, singleton ownership, recovery and deadlines |
| server/auth/ | Guest cookies, CSRF, session validation and controller fencing |
| server/commands/ | Common command service, receipts, admission and match transitions |
| server/persistence/ | PostgreSQL pool, migrations, transactions and writer lock |
| server/matches/ | Durable state, normalized seats/moves/pairings/results and outbox |
| domain/match/ | Deterministic rules, scoring, lifecycle and projections |
| shared/protocol/ | Runtime-validated command contracts and snapshot types |
| app/yard/, client/yard/ | Shared Phaser yard and accessible React social/match overlays |
| server/yards/, domain/yard/, shared/yard/ | Presence, movement, circles, proximity recipients, challenges, block/report |
| app/play/ | Standalone match regression screen when FEATURE_YARD=false |
| app/lab/ | Renderer/editor lifecycle prototypes |
| tests/ | Domain, PostgreSQL, browser and physical-recovery checks |
| legacy-server.ts, lib/game.ts | Isolated original MVP |

Read the [game vision](docs/game-vision.md), [technical index](docs/README.md) and [execution brief](docs/goal-mode-plan.md) before extending the game. Guards, clans, payments, hosted AI inference and broader prison simulation remain outside v1.

## Open bot league preview

The league is enabled by default; FEATURE_LEAGUE=false disables /leagues and its yard/bot links. Register one owned bot per owner in a 4–16-entry batch. Rules and provisional pairings are visible during registration; the host can close early once four owners have registered. The final schedule freezes on closure. Each pair plays 20 rounds with 20-second decisions and one-second reveals. Only one league fixture per bot runs at a time, with a default global cap of four fixtures.

Visual versions freeze at registration. External code can be changed or coached; revision labels are metadata, not verified code identity. This is an open experimental competition with no prizes. Points stay separate from casual totals; ties use mutual-cooperation rounds and then shared ranks. Three consecutive timeouts pause later fixtures; reconnect the external controller, or explicitly confirm a visual entrant's readiness, to resume admission.

Anonymous visitors can inspect standings, fixtures and attempts. Recordings show stored resolved rounds only and never rerun an agent. Cancelled/aborted attempts contribute no points and retry as new matches. The physical recovery gate passes with a disconnected external process and repeated server kills; real-device/playtest and operational release gates remain pending.

npm run test:league uses isolated soap_league_browser on local port 55432 and starts the app on port 3109. It registers two visual bots and runs the real Python and TypeScript clients through a full six-fixture batch, then inspects public recordings in an emulated mobile viewport. This proves live mixed-bot execution and UI flow, not physical-device usability or server-crash recovery. Run it sequentially with other browser/build/recovery checks.

npm run test:league-recovery uses only local soap_league_recovery and port 3110. It pauses an actual external bot process, kills the game server after a committed hidden visual move, checks recovery, kills it again to force abort/retry, resumes the client and finishes the batch. A final post-settlement crash checks unchanged ledger rows and standings. Both league test commands reset their named isolated fixture databases. Run them sequentially with browser/build/recovery commands.

## Infrastructure interruptions

Brief server interruptions retain committed choices and renew the decision window once. If the durable deadline-coordinator gap reaches a match's decision duration, collecting/revealing matches abort without lifetime or league credit; countdowns return to waiting. Hidden accepted choices remain private. Long process downtime follows the same policy as a database outage, so finish games before lengthy maintenance. League attempts retry as new matches.

npm run test:database-outage requires the existing local postgres:17-alpine image. It creates a uniquely named, labelled PostgreSQL container on loopback port 55434 and runs the game on port 3112. It commits a hidden move, stops only that test database beyond the five-second decision window, verifies no timeout result or settlement after restart, and removes its own labelled container/volume. The shared Compose database is untouched. Run it sequentially with other browser/build/recovery checks.

## Restore and rollback checks

With the completed integration/league-recovery fixtures and a production build, npm run test:restore validates encrypted PostgreSQL snapshots in new isolated databases. For a real binary rollback, run npm run prepare:rollback, set SOAP_ROLLBACK_DIR to its printed package path, then run npm run test:rollback. The strict command requires that package and verifies its committed source. Existing pre-backup cookies and settled results must survive current → previous → current. Private drill archives/reports are ignored; ephemeral test keys are discarded. See docs/operations.md for prerequisites, scope and measured results. Deployment backup scheduling, off-host storage and secret management still need the eventual hosting environment.

## Graceful service shutdown

SIGTERM/SIGINT fence new requests and commands, send service.restarting on /game-v1, and finish admitted HTTP/socket work plus background coordinators. Visual previews can finish before their pool closes; voice is removed while pending policy refreshes drain. Polling and WebSocket acknowledgements flush before transport closure. The independent PostgreSQL writer connection stays owned through application-pool and framework cleanup.

SHUTDOWN_GRACE_MS defaults to 30000 (valid range 1000–60000). Give the host supervisor a longer stop timeout. A normal drain exits 0; a timeout or cleanup failure exits 1 and uses the existing crash-recovery policy. npm run test:shutdown requires Ubuntu, local soap_shutdown from test:setup and a production build. It blocks real row locks, checks HTTP/socket/preview completion and second-writer exclusion, tests native voice closure behind a policy lock, and exercises an unfinished-body timeout with a two-second test grace.

## Local moderation

Audited host-side operator controls support owner disable/enable, individual session and bot credential revocation, current voice removal and report review. Set SOAP_OPERATOR_ID and use npm run operator with the private deployment database configuration. See [the operator procedure](docs/operations.md#audited-local-operator-controls) for target checks, input format, retry semantics and access boundaries. No public administration route is provided. Audited matches.pause/matches.resume stop new games while accepted games finish; operator status reports when active games have drained. The paused state survives restart.

## Load-readiness measurements

The server emits bounded aggregate latency/event-loop/memory windows and limits admitted HTTP/socket work with MAX_PENDING_WORK (initial default 256). npm run test:overload exercises actual saturation/recovery on isolated soap_load with a production build; it does not establish nominal capacity or the required 60-minute soak. See [measurement scope](docs/operations.md#bounded-admitted-work-and-aggregate-measurements).

The production mixed-bot workload is reproducible with npm run test:load; -- --twice tests 64 presences and duplicate durable traffic with four tables. Both local profiles pass latency/deadline/settlement checks. The required 60-minute soak, physical-device and deployment gates remain pending. See [the workload and measurements](docs/testing.md#production-mixed-bot-workload).

## Resource isolation

Per-owner work/socket budgets, absolute receive/header deadlines and global/peer TCP ceilings protect the service. npm run test:resources proves real denial and recovery on local fixtures. test:voice now automatically builds and uses an ephemeral loopback HTTPS fixture with the production backend; OpenSSL is required. See [limits and verification](docs/operations.md#owner-isolation-receive-deadlines-and-connection-limits). Deserted non-league waiting rooms now expire after fifteen minutes without connected participants; their absence timer survives restart and returning players see the reason. Remaining privacy/CSP checks and the sustained soak remain pending.


Idle limiter/controller state is bounded and pruned; expired external bot controllers explicitly reacquire. Volatile position frames avoid stale-frame queues, and reliable output has packet/byte ceilings with normal reconnect/snapshot recovery. See [ephemeral and output bounds](docs/operations.md#bounded-ephemeral-state-and-socket-output). Remaining privacy/CSP and bounded-read checks plus the full reconnect soak remain pending.


## Persistent history retention

Terminal round details expire after ninety days while final scores and league standings remain. Match panels and recorded replay explain the archived state. The singleton also removes old receipts, expired keys/sessions/credentials, reports and invitations in bounded batches; retries and score uniqueness remain protected. See [retention rules and producer scope](docs/data.md#implemented-persistent-retention). Deployment backup expiry, remaining privacy/CSP/bounded-read checks, sustained soak and actual-device/human gates remain pending.
