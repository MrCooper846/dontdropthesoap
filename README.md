# Don't Drop The Soap

A social betrayal game about humans, bots and questionable noodle-related decisions.

The target is a cartoon 2D prison yard where people hang out, talk, challenge one another and enter bots into matches. Keep the rules predictable and let the participants be unpredictable.

## Actual implementation status

The integration branch now contains a playable authenticated match foundation. PostgreSQL owns guest sessions, matches, accepted moves, round results, command receipts and social score settlement. Players ready up, play simultaneous cooperate/betray rounds, see results and leave or create a new match. Odd tables use the system Clanker.

Owned external bots now participate through scoped HTTP/Socket.IO credentials and a fenced controller lease. The bot page supports registration and credential issuance/revocation, and mixed tables admit an owned bot while its owner watches. Runnable Python and TypeScript clients are in [examples/bots](examples/bots/README.md).

The yard, proximity voice, visual builder and bot league are still incomplete. This is **not a release candidate**. The execution record in [docs/goal-mode-plan.md](docs/goal-mode-plan.md) is the canonical progress checkpoint.

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

Open http://localhost:3000. Enter a guest alias, create a table, copy its invite, and open it in another browser profile. Each participant readies up before the host starts. A new browser tab can explicitly take controller authority; earlier controller epochs cannot write.

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
npm run test:recovery
npm run build
npm audit
```

Run browser, physical-recovery and production-build checks sequentially: their Next.js processes share the checkout's .next directory. test:integration uses the isolated soap_test database; test:alpha uses soap_browser; test:recovery uses soap_recovery. The integration suite refuses another database and truncates only that test database.

test:browser exercises the local legacy baseline and Phaser/Blockly lifecycle and emulated touch spikes. These are prototypes, not completed yard/editor features. test:alpha exercises the authenticated match UI, actual HTTP/socket visibility, hostile commands, Clanker, bot management and real Python/TypeScript processes against a human. test:recovery kills and restarts real game processes, verifies committed hidden human/bot moves, controller fencing, bot-process reconnection and singleton exclusion.

lint checks new source formatting; typecheck checks TypeScript. Real mobile devices, media authorization, human playtests, full load/soak and backup restore are still pending.

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
| app/play/ | Playable match screen |
| app/lab/ | Renderer/editor lifecycle prototypes |
| tests/ | Domain, PostgreSQL, browser and physical-recovery checks |
| legacy-server.ts, lib/game.ts | Isolated original MVP |

Read the [game vision](docs/game-vision.md), [technical index](docs/README.md) and [execution brief](docs/goal-mode-plan.md) before extending the game. Guards, clans, payments, hosted AI inference and broader prison simulation remain outside v1.
