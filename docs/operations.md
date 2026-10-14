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

Graceful shutdown stops new admissions, emits restart notice, commits in-flight work, disconnects media participants and exits. Deployments should prefer finishing active matches; if interrupted use documented recovery rather than clearing them. Use additive schemas so the previous binary can run during rollback; otherwise restore with an explicit downtime plan.

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
