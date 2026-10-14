# Deployment, security and operations

Status: proposed alpha deployment. No infrastructure is provisioned by these docs.

## Deployment shape

One game-service process with the existing web app, one PostgreSQL instance and a separate media service. Start with Docker Compose for local integration and a single host or equivalent services for a private alpha. Choose the actual host after checking available resources. The media adapter currently uses a native mediasoup child worker. TURN/public network reachability and actual hosting remain deployment validation gates.

Expose only HTTPS/WSS publicly through a reverse proxy. Keep PostgreSQL on a private network. Configure WebSocket upgrades, proxy timeouts and secure cookies. Keep media network requirements separate; HTTPS reachability alone does not prove WebRTC or TURN connectivity.

Proposed environment:
- NODE_ENV, PORT, PUBLIC_ORIGIN
- DATABASE_URL
- SESSION_SECRET_PEPPER, COMMAND_KEY_SIGNING_SECRET
- VOICE_LISTEN_IP, VOICE_ANNOUNCED_ADDRESS, VOICE_MIN_PORT, VOICE_MAX_PORT
- MAX_YARD_PLAYERS, MAX_ACTIVE_MATCHES, LOG_LEVEL
- FEATURE_YARD, FEATURE_EXTERNAL_BOTS, FEATURE_VOICE, FEATURE_LEAGUE

Validate required variables at startup. Secrets live in deployment secret storage, never NEXT_PUBLIC variables, Git or logs. Browser bundles receive only public origins and short-lived participant tokens. Rotate with an explicit overlap/revocation plan.

## Boot and deployment

1. Back up and verify database access.
2. Run migrations once; stop if they fail.
3. Start singleton service and obtain exclusive writer lease.
4. Recover matches and outbox; only then pass readiness.
5. Enable admissions and check synthetic noncompetitive match.

Health endpoints: /health/live means process alive; /health/ready requires database, writer ownership and successful recovery. Voice failure degrades voice without making scoring unsafe.

Graceful shutdown fences new HTTP and primary/yard/voice socket work, emits service.restarting on /game-v1, drains admitted operations and background ticks, removes media participants and exits. The writer lease uses its own PostgreSQL connection; application pool and framework cleanup complete before ownership is released. Deployments should prefer finishing active matches; if interrupted use documented recovery rather than clearing them. Use additive schemas so the previous binary can run during rollback; otherwise restore with an explicit downtime plan.

## Abuse boundaries

Authenticate every action, validate every input and check ownership server-side. Rate-limit resource creation as well as messages, expire empty waiting rooms after 15 minutes, and remove stale presences. Default bot credential cap: five active credentials per owner; bot registration cap: twenty bots per owner in alpha.

Bound pending commands, active tasks, HTTP bodies, observation pages and memory. Do not run uploaded code. No arbitrary bot webhooks. Render player text as text. Use restrictive allowed origins and content-security policy appropriate for the canvas/editor/media integration; test rather than disabling it to fix one dependency.

Guests and one-owner-per-league limits do not stop determined multi-accounting. Initial competition has no prizes; account upgrades and stronger abuse controls are a later public-league requirement.

Operator moderation is separate from gameplay guards. Provide documented owner disable, session/token revocation, voice removal and report review controls with audit records. The whimsical guard idea does not replace these operations.

## Logs and monitoring

Structured logs: request/command ID, match ID, event type, latency and error code. Never log session/bot secrets, unrevealed moves, raw audio or arbitrary bot prompts. Keep private gameplay debug logging off in production.

Measure active presences/seats, commands rejected, ACK latency, event-loop lag, DB transaction latency, outbox age, timeout fraction, worker failures, reconnects and voice policy failures. Alert on repeated resolver failures, growing outbox backlog, disk pressure and loss of writer ownership.

If database writes fail, stop accepting moves and report service unavailable; do not ACK in-memory moves. If degraded beyond a decision window, abort affected active matches as soon as the database returns rather than awarding timeout wins caused by infrastructure failure. The service persists coordinator health and checks the database clock against each match's decision duration. An overdue coordinator makes readiness fail closed; the durable gap survives process death. Aborts retain hidden choices and diagnostic results but receive no settlement, and league fixtures requeue. The same conservative rule applies to long process downtime because the database cannot retrospectively prove the cause. Record the incident for league fixture retry.

If voice authorization updates fail, remove or suspend the affected media participants until permissions reconcile. Client volume is not a fallback access control.

## Backup and rollback

Daily encrypted PostgreSQL backup, seven-day retention initially, off-host copy. Alpha recovery point objective: up to 24 hours under catastrophic DB loss; routine process restart should lose no acknowledged durable commands. Target restore time: under one hour, to be tested, not promised.

Run a restore drill before public alpha. Record backup timestamp, checksums, restore steps and observed recovery time. Do not delete the legacy SQLite archive. Never overwrite a live database with a backup without an explicit maintenance plan.

## Costs and limits

Budget separately for application compute, PostgreSQL, backups and voice bandwidth/participant minutes. External model costs belong to bot owners. No provider pricing is assumed in this plan. Set spending alerts and hard admission caps before sharing broadly; inspect real usage after each playtest.

## Launch gates

A private alpha can ship rough art and basic UI. It must pass hidden-move, identity, deadline, settlement and reconnect tests. Voice requires the media authorization gate. Public sharing additionally needs workable mute/block/report, operational rollback, a restore drill and clear guest-account limitations.

## Verified production package baseline

The custom server uses pinned runtime tsx 4.21.0; next.config.mjs loads without installing TypeScript at service startup. On the build machine, use npm ci and npm run build. The release must retain the versioned application/server/domain/shared source and assets, package.json/package-lock.json/next.config.mjs, .next and dist/workers. Keep .env, credentials, local databases, test outputs and existing node_modules out of the artifact. Install its locked runtime dependencies with npm ci --omit=dev, configure production environment/secrets, then use npm start. A public deployment still needs the proxy/media/restore/rollback gates above.

A clean temporary package has passed npm ci --omit=dev and actual production npm start against a dedicated local database. scripts/production-smoke.ts can be run from that package with node --import tsx scripts/production-smoke.ts. It deliberately refuses a development install containing Vitest and targets only local soap_release_smoke on Compose port 55432, with application port 3111. It checks built pages, migrations/readiness, Secure cookie issuance, compiled visual-worker execution and native media binary startup. It does not test public HTTPS, media connectivity, load or deployment. The first run discovered the runtime next.config.ts compiler dependency; the JavaScript config fixes it without a runtime package-install step.

## Local restore and binary rollback drill

Run these checks sequentially in Ubuntu after npm ci, services:up, test:setup, test:integration, test:league-recovery and build. The two completed test suites provide real casual settlements and a full six-fixture league. npm run test:restore creates encrypted snapshots of only the fixed local soap_test and soap_league_recovery fixture databases, restores into new soap_restore_<uuid> databases, validates all application rows and schema, and boots the current production app on port 3113. It migrates those fixture sources and creates one disposable guest through the real session helper before backup; after exporting the snapshot, it removes only that guest from the source. The backed-up cookie must authenticate after restoration with the same externally supplied test secrets.

For the binary rollback gate:

1. Run npm run prepare:rollback (the tested default reference is 26d38b3; an explicit ancestor can be passed after --).
2. Set SOAP_ROLLBACK_DIR to the rollbackPackage path printed by that command.
3. Run npm run test:rollback.

Preparation creates a new /tmp package from the actual committed Git tree, installs build dependencies, builds in production mode, then performs npm ci --omit=dev. The drill verifies the ancestor revision, committed source hashes and a distinct build ID before starting it. It boots current → previous → current against the same restored database without downgrading migrations. Active games must be drained; waiting/terminal records, existing guest identity, public results and immutable score ledgers are checked through the process changes. The strict rollback command rejects a missing package; the restore-only command reports rollback as NOT_RUN when none is supplied.

The exported PostgreSQL snapshot binds source fingerprints and pg_dump to one database snapshot. Every application table's ordered row fingerprint, canonical constraints, triggers, stored functions and indexes must match after pg_restore. PostgreSQL's own pretty deparser supplies canonical constraint text. The archive uses AES-256-GCM, and a tampered ciphertext must fail authentication; SHA-256 identifies the saved encrypted archive. The fixture drill caps its in-memory archive at 64 MiB. Private archives, diagnostics and reports live under ignored data/restore-drills with restrictive permissions. Fixture encryption keys remain only in memory and are discarded, so these files are drill evidence. Actual deployment backups require separately managed encryption/session secrets, a daily job, off-host storage and the seven-day retention policy.

Observed on 14 October 2026: both 30-table fixture databases restored and booted, existing cookies survived rollback to 26d38b3 and roll-forward, two casual credits and six league credits remained unchanged, and all generated restore databases were removed. The final measured dump/encrypt/restore/compare phase took roughly 0.9–1.0 seconds per small fixture; restored production readiness and authenticated reads took roughly 2.4 seconds from snapshot start. These fixture measurements do not establish production RTO, off-host recovery or public HTTPS. Repeat the drill with the actual release, volume and hosting environment before deployment.

## Verified signal drain

SIGTERM/SIGINT make readiness return 503 and fence new work while already admitted requests settle. A shared tracker covers HTTP handling, socket authentication/commands/state sync, yard routes and ordered voice commands. Background league, visual, yard/block refresh and main deadline/outbox jobs are stopped and awaited. Voice closes immediately and its in-flight policy query still drains; preview pools close after admitted preview requests so a late pool allocation cannot outlive shutdown. Authenticated polling and WebSocket connections close gracefully after acknowledgements.

The exclusive writer lease is a dedicated PostgreSQL client, separate from the application pool. Cleanup drains the pool and closes Next before releasing that lease, so another writer cannot overlap unfinished work. Repeated signals are idempotent. Structured events service.drain.started/complete/timeout/failed contain only counters/status, never bodies or moves. SHUTDOWN_GRACE_MS defaults to 30 seconds, configurable from 1–60 seconds; supervisor/container stop timeout should exceed it. Timeout/failure exits 1; process teardown closes any remaining ownership/connections, with ordinary durable crash recovery. Normal completion exits 0.

After a production build and test:setup, npm run test:shutdown exercises only isolated soap_shutdown on local port 3114. Both WebSocket and HTTP-polling cases hold match/owner locks while real HTTP moves, socket moves and private previews are admitted, then signal shutdown. Late commands are rejected, the second writer fails, existing ACKs/results complete, and restart preserves exactly two moves and one round result. A preview creates its actual worker only after drain starts and still finishes before cleanup. The native voice case allocates a real receive transport, blocks owner-block policy refresh, checks voice removal and waiting ownership, then verifies native worker exit. An unfinished HTTP body demonstrates bounded failure at a two-second test grace and preserved identity after restart. This validates signal draining; operator-triggered admission maintenance and audited moderation remain separate work.
