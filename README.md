# Don't Drop The Soap

A multiplayer social strategy game set in a cartoon prison yard, where humans and player-built bots compete over noodles by choosing whether to cooperate or betray.

This is an in-development portfolio project exploring real-time multiplayer, visual programming, persistent game state and adversarial testing. The browser game is the main project. The Unity restaurant builds are separate experiments in 3D interaction and multiplayer, rather than a replacement for the browser game.

## The game

Walk around the yard, talk to nearby prisoners, approach a match circle and play against people or their bots. Each round pairs opponents who secretly choose **Cooperate** or **Betray**. Mutual cooperation benefits both; a successful betrayal pays more, but mutual betrayal leaves both worse off. Choices lock before results are revealed.

Players can write a bot, build one visually, or simply play and spectate. The goal is to make a small, predictable ruleset interesting through bluffing, rivalry and competing strategies.

## What is built

| Area                         | Current implementation                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiplayer yard             | Shared 2D prison yard, server-controlled movement, match circles, spectators, direct challenges and contextual panels. Keyboard and touch controls are implemented.                   |
| Strategy matches             | Human and mixed human/bot tables, simultaneous hidden choices, timed rounds, deterministic scoring and persistent completed-match totals.                                             |
| Visual bot maker             | Blockly editor, private practice, publishing, versioned programs, match memory and execution feedback. Programs run through a restricted interpreter rather than uploaded JavaScript. |
| External bots                | Owner-scoped credentials and HTTP/Socket.IO control, with runnable Python and TypeScript examples. Owners can roam while their bot plays.                                             |
| Bot leagues                  | Round-robin batches, frozen visual bot versions, standings, resolved-round recordings and interrupted-fixture retries.                                                                |
| Social features              | Nearby text, block/report controls and optional proximity voice with push-to-talk and server-controlled listening eligibility.                                                        |
| Browser restaurant prototype | Four cooperative roles, timed jobs, shared supplies, a noodle vault, optional theft, supported searches and persistent payouts.                                                       |
| Test arena                   | Separate browser players and deployed bots, persistent issue/evidence tracking, and repeatable concurrent playtests.                                                                  |

The game is a playable prototype, **not a production release**. Public hosting, physical-device coverage and broader human usability testing remain unfinished. Voice is off by default and needs HTTPS/media configuration. Guest identities have no account-recovery flow.

Restaurant earnings, casual match scores and league standings currently use separate ledgers. Earning noodles through prison activities and spending them in yard games is a design direction, not an integrated economy yet. The browser restaurant uses room selection and timed tasks; free walking and tray carrying belong to the separate Unity experiment.

## Engineering focus

The project covers both gameplay and the failure cases behind a multiplayer service:

- **Authoritative state:** clients submit actions; the server checks identity, permissions, movement, deadlines and game rules.
- **Durable decisions:** PostgreSQL transactions commit accepted choices and results before acknowledgement. Command receipts make retries safe, and unique settlement records prevent duplicate credits.
- **Private information:** separate public and owner-specific projections keep unrevealed moves and private bot observations out of other players' snapshots.
- **Reconnect and recovery:** controller epochs fence stale clients; durable match state supports recovery after process or database interruptions.
- **Bounded bot execution:** visual programs are validated and run in workers with execution limits. External bots use scoped credentials and controller leases.
- **Testing under real interaction:** browser automation, separate bot processes, crash/restart tests and multi-agent playtests exercise complete flows alongside unit tests.

See the [architecture](docs/architecture.md), [data model](docs/data.md), [protocol](docs/protocol.md) and [testing guide](docs/testing.md) for the implementation details and evidence boundaries.

## Stack

| Layer                          | Technologies                                                        |
| ------------------------------ | ------------------------------------------------------------------- |
| Browser interface              | TypeScript, Next.js, React, Phaser                                  |
| Realtime game server           | Node.js, Socket.IO, Zod                                             |
| Persistence                    | PostgreSQL, SQL migrations, node-postgres                           |
| Visual programming             | Blockly, restricted JSON programs, worker execution                 |
| Optional voice                 | WebRTC, mediasoup                                                   |
| Verification and local tooling | Vitest, Playwright, Docker Compose, Python/TypeScript bot clients   |
| Separate 3D experiments        | Unity, C#, local TypeScript server and isolated PostgreSQL database |

Dependency versions are recorded in [package.json](package.json) and the lockfile.

## Run locally

Use Node.js 22 or newer, npm and Docker Compose. Ubuntu/WSL is the tested development environment; some native-media and recovery tests require Linux tooling.

```bash
npm ci
cp .env.example .env
npm run services:up
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000), choose a guest alias and enter the yard. Move with WASD/arrows or the touch joystick. Approach a circle to join a match, or open **Your bots** to build an entrant. Each owner readies their entrant before the host starts.

The example configuration is for local development only. PostgreSQL binds to loopback port `55432`; public deployment requires unique secrets, HTTPS and appropriate media networking. Losing the guest-session cookie loses access to that identity.

For bot clients, see [examples/bots](examples/bots/README.md). For voice, isolated test databases, legacy mode and deployment checks, use the [development guide](docs/development-guide.md).

## Verification

```bash
npm run typecheck
npm test
npm run test:docs
```

The larger suites use real PostgreSQL, browser sessions and native media workers. Follow the [testing guide](docs/testing.md) and [development guide](docs/development-guide.md) for setup before running them. Browser/build/recovery suites share build output and should run sequentially. Fixture databases are isolated from normal development data.

Recorded verification includes mixed human/bot games, visual-bot publication and revision, league recovery, privacy checks, process/database interruptions, and a local hour-long presence/reconnect soak. These are scoped development results, not a guarantee of public-server capacity or real-device usability. Dated [release audit](docs/release-audit.md), [UI verification](docs/ui-implementation-verification-2026-10-23.md) and [restaurant acceptance](docs/restaurant-first-playable-2026-10-23.md) reports describe what was actually exercised.

The [local arena](docs/arena.md) lets multiple agents play through browser controls and records findings in its own persistent test database. It is development tooling; players do not need an AI account to use the main game.

## Experimental work

The [Unity experiments](docs/unity-experiments.md) explore how a prison restaurant activity might feel in 3D. They include a single-player physics sketch and a multiplayer prototype with walking, carrying, role tasks, theft and local persistence. They remain experimental: placeholder art, a separate runtime and database, no integration with the browser yard, and no claim that the main game has migrated to Unity.

The original local-only party demo is also retained as legacy code, separate from the authenticated game server.

## Explore the repository

| Path                                                              | Purpose                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `app/`, `components/`, `client/`                                  | Browser pages, React overlays, Phaser yard and bot editor       |
| `domain/`, `shared/`                                              | Game rules, validated contracts and public/private types        |
| `server/`                                                         | Authentication, game coordination, persistence, bots and voice  |
| `examples/bots/`                                                  | Runnable external bot clients                                   |
| `tests/`                                                          | Domain, integration, browser, security and recovery checks      |
| `scripts/arena/`                                                  | Browser-agent playtests and issue tracking                      |
| `prototypes/`, `server/unity-restaurant/`, `scripts/unity-arena/` | Separate Unity experiments and their test tooling               |
| `docs/`                                                           | Design, architecture, operational procedures and dated evidence |

Start with the [documentation index](docs/README.md), [game vision](docs/game-vision.md) or [development guide](docs/development-guide.md).
