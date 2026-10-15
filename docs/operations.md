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

Preparation creates a new /tmp package from the actual committed Git tree, installs build dependencies, builds in production mode, then performs npm ci --omit=dev. The drill verifies the ancestor revision, committed source hashes and a distinct build ID before starting it. It boots current → previous → current against the same restored database without downgrading migrations. Active games must be drained; waiting/terminal records, existing guest identity, public results and immutable score ledgers are checked through the process changes. Preparation and strict rollback preflight require the Next build ID/prerender/routes/required-server-files manifests and compiled visual worker. Rebuild incomplete temporary artifacts; a marker alone is insufficient. The strict rollback command rejects a missing package; the restore-only command reports rollback as NOT_RUN when none is supplied.

The exported PostgreSQL snapshot binds source fingerprints and pg_dump to one database snapshot. Every application table's ordered row fingerprint, canonical constraints, triggers, stored functions and indexes must match after pg_restore. PostgreSQL's own pretty deparser supplies canonical constraint text. The archive uses AES-256-GCM, and a tampered ciphertext must fail authentication; SHA-256 identifies the saved encrypted archive. The fixture drill caps its in-memory archive at 64 MiB. Private archives, diagnostics and reports live under ignored data/restore-drills with restrictive permissions. Fixture encryption keys remain only in memory and are discarded, so these files are drill evidence. Actual deployment backups require separately managed encryption/session secrets, a daily job, off-host storage and the seven-day retention policy.

Observed on 14 October 2026: both 30-table fixture databases restored and booted, existing cookies survived rollback to 26d38b3 and roll-forward, two casual credits and six league credits remained unchanged, and all generated restore databases were removed. The final measured dump/encrypt/restore/compare phase took roughly 0.9–1.0 seconds per small fixture; restored production readiness and authenticated reads took roughly 2.4 seconds from snapshot start. These fixture measurements do not establish production RTO, off-host recovery or public HTTPS. Repeat the drill with the actual release, volume and hosting environment before deployment.

## Verified signal drain

SIGTERM/SIGINT make readiness return 503 and fence new work while already admitted requests settle. A shared tracker covers HTTP handling, socket authentication/commands/state sync, yard routes and ordered voice commands. Background league, visual, yard/block refresh and main deadline/outbox jobs are stopped and awaited. Voice closes immediately and its in-flight policy query still drains; preview pools close after admitted preview requests so a late pool allocation cannot outlive shutdown. Authenticated polling and WebSocket connections close gracefully after acknowledgements.

The exclusive writer lease is a dedicated PostgreSQL client, separate from the application pool. Cleanup drains the pool and closes Next before releasing that lease, so another writer cannot overlap unfinished work. Repeated signals are idempotent. Structured events service.drain.started/complete/timeout/failed contain only counters/status, never bodies or moves. SHUTDOWN_GRACE_MS defaults to 30 seconds, configurable from 1–60 seconds; supervisor/container stop timeout should exceed it. Timeout/failure exits 1; process teardown closes any remaining ownership/connections, with ordinary durable crash recovery. Normal completion exits 0.

After a production build and test:setup, npm run test:shutdown exercises only isolated soap_shutdown on local port 3114. Both WebSocket and HTTP-polling cases hold match/owner locks while real HTTP moves, socket moves and private previews are admitted, then signal shutdown. Late commands are rejected, the second writer fails, existing ACKs/results complete, and restart preserves exactly two moves and one round result. A preview creates its actual worker only after drain starts and still finishes before cleanup. The native voice case allocates a real receive transport, blocks owner-block policy refresh, checks voice removal and waiting ownership, then verifies native worker exit. An unfinished HTTP body demonstrates bounded failure at a two-second test grace and preserved identity after restart. This validates signal draining; operator-triggered admission maintenance and audited moderation are documented below.

## Audited local operator controls

Run from the release checkout with its configured DATABASE_URL and SOAP_OPERATOR_ID set to an attributable operator label. Access is controlled by the host account and private database credentials; the label is audit metadata, not authentication. There is no public operator HTTP/socket route.

npm run operator -- apply reads one JSON object from stdin (maximum 16 KiB):
```json
{
  "commandId": "<fresh UUID>",
  "action": "owner.disable",
  "targetId": "<owner UUID>",
  "reason": "Explain the moderation action"
}
```
Use actual UUIDs. Moderation actions are owner.disable, owner.enable, session.revoke, credential.revoke, voice.remove and report.review. Targets are the corresponding owner/session/credential/report public identifiers, never secrets. report.review additionally requires status reviewed, dismissed or actioned; it preserves the original report text. The operator reason is required, limited to 500 characters and stored privately in the audit.

List reports with npm run operator -- reports open, optionally adding its returned next cursor; list audit records with npm run operator -- audit, optionally adding its next sequence. Pages contain at most 100 records. Treat report content as untrusted player text; it does not authorize an action. Before acting, confirm the target identifier against the report and relevant record. No action edits moves, outcomes or score ledgers.

Each action and its immutable audit record commit atomically. Repeat the same commandId, operator label and payload after an uncertain outcome to receive the stored response; changed payloads reject. SQL UPDATE/DELETE of audit rows is prohibited. A privileged database administrator can still alter schema or bypass protections; these records are not tamper-proof against that administrator.

Owner disable blocks browser and bot authentication; enable restores access only to otherwise valid, unrevoked credentials. Individual session/credential revocation stays permanent. voice.remove is a one-time removal: it advances the durable owner controller epoch and closes older voice identities. A user can explicitly acquire fresh authority and join again. Use owner.disable when continued account access must be prevented.

The singleton polls unapplied audit effects every 250 ms, closes matching live sockets and clears the revoked credential's ephemeral lease. Voice authority/watchdog checks independently fail closed. Failed delivery remains pending for retry; effects are idempotent and do not close a newer credential/controller identity. Shutdown awaits in-flight delivery before releasing writer ownership. Enforcement has bounded routing latency; already heard audio cannot be retracted.

Automated evidence: real PostgreSQL authority/audit rollback, retry, immutable rows, scoped credentials, delayed effects and report pagination; actual operator CLI with Chromium synthetic RTP, hostile retained voice, fresh reentry, owner disable/enable, report review, session revocation and connected bot credential revocation. These tests run on isolated local fixture databases. Physical audio devices and human moderation usability remain separate release validation. Admission maintenance is described below.

## Pause new games for maintenance

With the same trusted operator environment, run npm run operator -- status to read serviceId, matchesOpen, activeGames and waitingGames. Submit an audited apply action with action matches.pause, targetId equal to serviceId (00000000-0000-4000-8000-000000000001), a fresh commandId and a reason. Use matches.resume with the same service target to reopen. Identical retries return the original response.

Pause blocks creation of matches, admission of new non-system seats and starts from waiting rooms. It does not kick yard members, disable chat, cancel games or block already admitted countdowns/rounds/results. System Clanker admission for an accepted odd-table countdown still works. League registration can continue; new fixture attempts wait, and active attempts and batch completion continue. Waiting rooms can be left or configured while paused.

PostgreSQL row locks serialize pause with admissions: an earlier admission transaction finishes before pause commits; an admission behind the pause sees the closed state and rolls back. SQL triggers enforce this even on the previous binary during additive-schema rollback. Current HTTP requests return ADMISSIONS_PAUSED/409 with a readable message. Older binaries return their generic retryable service error while the database still rejects the admission. Public GET /api/v1/service exposes only matchesOpen; the yard checks it every two seconds and shows maintenance clearly, while writes always recheck in PostgreSQL.

For planned deployment: pause, wait until operator status reports activeGames=0, then send SIGTERM and allow the documented graceful drain. Leave the durable control closed through restart and smoke checks; explicitly resume when ready. Waiting rooms persist. The paused flag intentionally survives process restart/rollback, so a health-ready service does not automatically admit games.

The restore/rollback harness boots the current and actual previous production binaries in standalone match regression mode, uses a pre-backup authenticated cookie, and attempts real HTTP match creation while paused. It checks rejection and unchanged match count on current → previous → current, alongside existing identity, schema/data and ledger checks. These are local fixture gates; deployment readiness still requires the actual environment.

## Bounded admitted work and aggregate measurements

MAX_PENDING_WORK bounds in-flight work admitted by the shared HTTP/socket/yard/voice tracker. It defaults to 256 (configuration range 32–4096); this is an initial bound, not a measured public capacity claim. Capacity is reserved before callbacks execute, including reentrant work. Overloaded requests receive retryable SERVICE_UNAVAILABLE: HTTP 503 with Retry-After: 1, or the corresponding socket error. New Socket.IO authentication reports SERVICE_UNAVAILABLE rather than misidentifying overload as invalid credentials. Liveness remains available without a database or work slot; readiness can fail during saturation.

Already admitted work retains its transaction and drain semantics. Capacity releases after success/failure/cancellation settles, and final drain measurements follow admitted completion. Per-owner/socket/receive limits are documented below. Remaining bounded-read/privacy checks are separate release work; the persistent retention producer is documented below.

service.metrics emits aggregate windows every ten seconds and once after a normal drain. It reports in-flight work, socket count, readiness/draining, pool connections/waiters, parent-process RSS/heap/external memory, native event-loop-delay p95/max at 10-ms resolution, accepted-command/transaction timings and rejected-command/overload counts. Duration histograms use a fixed bucket array and report conservative p95UpperMs, not an exact percentile; counters/histograms reset each window. No request body, owner name, token, move or program is sampled.

command.accepted measures the common command service, including its transaction/connection wait and successful receipt retries. It excludes HTTP pre-authentication and transport/network RTT. db.transaction includes connection wait on successful acquisition and both successful/failed transactions. Nominal ACK acceptance still requires the full actual transport load harness, and startup/warmup windows must be separated. Parent memory excludes native media-child memory; synthetic socket traffic does not establish SFU capacity.

After test:setup and a production build, npm run test:overload runs only local soap_load on port 3116. It admits 32 real incomplete HTTP bodies with an injected MAX_PENDING_WORK=32, checks the logged pending ceiling and zero DB pool waiters, proves excess HTTP/socket rejection and live health, then releases requests and proves the existing guest/session/socket recover. The server drains normally and its log excludes the session secret. This verifies bounded overload, not the nominal 32-human/four-table, 2x target, 60-minute soak or physical-device/media gates. Those remain pending.

## Owner isolation, receive deadlines and connection limits

The shared tracker also limits each authenticated owner's pending work to MAX_PENDING_PER_OWNER (default 8, configurable 2–64). HTTP work binds to the verified owner returned by session/bot authentication; known socket callers reserve the same canonical owner before queueing. Browser sessions and owned bot credentials share this budget. Repeated authentication within one request does not reserve again. A request cannot change authenticated owners. Counts release when its full promise settles, including failure/cancellation, so one owner's slow work does not occupy another owner's budget. Unauthenticated work remains covered by global work, peer/rate and receive limits.

MAX_SOCKETS_PER_OWNER (default 8, range 2–32) separately bounds persistent /game-v1 connections across an owner's browser and bot credentials. Namespace disconnect or underlying transport closure releases a reservation exactly once. Excess authentication retains the stable SERVICE_UNAVAILABLE code with structured readable/retryable data. The yard displays the connection-limit action and retries at bounded 1–5-second intervals; success/unmount clears timers. This is separate from active-seat/credential limits.

HTTP_REQUEST_TIMEOUT_MS defaults to 30000 (range 1000–120000). Node enforces an absolute receive deadline, checked every second, so periodic body bytes do not extend it. The first-header limit is min(10000, request timeout), including sockets that never send complete headers. Aborted body readers release their work and do not attempt a second response after Node's 408/connection closure. Existing byte limits remain in place.

MAX_TCP_CONNECTIONS defaults to 1024 (range 4–16384); MAX_TCP_PER_IP defaults to 256 (range 4–4096). These bound all accepted HTTP/upgrade/idle connections. The real TCP peer address determines the group; forwarded headers do not bypass it. A reverse proxy's upstream connections share its address budget, so validate the actual proxy/cohort configuration before deployment. At a raw TCP ceiling new connections can reset before an HTTP error is available, including a new health probe; liveness still bypasses work quotas on an admitted connection. These are resource guards, not promises of 1024 playable humans.

test:resources uses only local soap_load/production port 3118. Injected owner-work/socket budgets of two prove shared browser/bot denial, unrelated-owner access, slot reuse and namespace recovery. A three-second injected deadline closes real dripping bodies with 408. Eight global/four-per-peer TCP slots across loopback addresses prove both ceilings, forwarded-header denial, incomplete-header expiry and replacement admission. No live database is reset by that test. Private fixture keys/cookies are not logged.


## Deserted waiting-room expiry

A non-league waiting room is empty for expiry purposes when no seated owner's authenticated browser connection remains and none of its external bot controllers has a live heartbeat lease. An owner connected elsewhere in the yard still counts; an owned visual bot needs its human owner present. This releases circles abandoned by disconnected seats without cancelling an occupied social room.

The singleton checks up to 100 rooms per page every five seconds, advancing a UUID cursor so later rooms are not starved. PostgreSQL stores waiting_empty_since. A returning participant clears it; a later absence starts a fresh fifteen-minute period. A stored absence survives restart and normal waiting-room recovery. The phase is rechecked under the match lock, so an already admitted countdown or active game cannot be expired by a stale scan. League queues are exempt. Moving out of waiting clears an earlier absence even when an older binary performs the transition.

Expiry transitions waiting → cancelled once, publishes match.waiting-expired and an ordinary terminal snapshot with cancelReason empty, clears readiness and releases the circle/active-seat limits. It retains the room and seats for history and writes no results or score credits. The returning player's match panel explains the closure. The fixed fifteen-minute duration is not a decision deadline or a configurable shortened production timeout. With more than 100 waiting rooms, the sweep cadence includes subsequent pages. Ordinary leaving of the last seat still cancels immediately.


## Bounded ephemeral state and socket output

Monotonic TTL stores replace owner-ID maps that otherwise retained old guests indefinitely. HTTP rate windows have at most 10000 keys (one-second TTL), chat token buckets at most 4096 owners (three-second full-refill TTL), invitation windows at most 4096 owners (60-second TTL), and bot controllers at most 4096 leases (15-second TTL). New identities reject with retryable SERVICE_UNAVAILABLE when all slots are live; a live limit/controller is never silently evicted. Existing identities can use or renew their own live slot. A one-second independent timer prunes idle records even while database work is stalled; lazy lookup/insertion also reclaims expired records. Shutdown stops that timer.

Bot heartbeats remain every five seconds. Once the fifteen-second monotonic lease expires, heartbeat cannot revive its old epoch; the client explicitly reacquires, advancing the database epoch. Both reference clients recover from CONTROLLER_STALE/BOT_OFFLINE. A full controller store can reject after a durable epoch advance; no lease is granted, and the caller retries acquire. Persistent authority is never rolled backward.

The 30-second/256-message nearby text buffer now expires by monotonic retention time, including idle periods and wall-clock changes. Visible sentAt timestamps remain wall-clock values. Chat is not persisted or transcribed.

Yard position broadcasts use volatile delivery so intermediate frames do not accumulate behind a slow reader. Browser movement intent is also volatile, requires an already connected socket and has a one-second acknowledgement lifetime; offline or dropped frames cannot accumulate stale input/callbacks. Reliable Engine.IO output is observed through public packetCreate/flush/close events, without reading private buffers. Initial ceilings are 128 queued packets or 1 MiB per connection and 16 MiB across connections. A per-connection breach closes that transport; aggregate pressure closes the peer with the largest queued byte count. Flush/close releases accounting. The connection.backpressure counter contains no identities or payloads. These limits cover the Engine.IO queue; one flushed transport batch and OS/network buffers are separate, with existing heartbeat/transport lifecycle bounds. They are not a complete process-RSS claim.

Actual loopback Socket.IO tests leave polling clients without receive polls: byte/count/global ceilings close them, flushed payloads release capacity, another real WebSocket still acknowledges, and replacement clients work. Real PostgreSQL acceptance also waits the full fifteen seconds before proving late-heartbeat denial and successful epoch-advancing reacquisition. Synthetic transport tests do not replace the full sustained reconnect soak or physical media load.


## Persistent retention producer

The singleton starts and drains the retention producer automatically. It runs indexed, row-locked batches without network/model calls: 100 rows per metadata table and one terminal match's history per transaction, skipping conflicting row locks. It yields/checks a 250-ms budget between transactions, retries remaining backlog/errors after one second and idles for one minute once caught up. Existing database statement timeouts remain in force; a transaction may exceed the inter-batch budget. Logs contain only retention.complete counts or a fixed retention.failed code, with aggregate retention.batch duration and retention.history count. Investigate recurring errors/backlog rather than assuming a wall-clock deletion guarantee during outages.

The exact live-data rules and retained summaries are in [data](data.md#implemented-persistent-retention). Archived match panels and public league replay explicitly say round details expired; scores/standings remain. Lost notification delivery is recovered by ordinary observation/cursor reset. Session/token hashes and old receipts are deleted at their documented ages, while expired resource creation keys cannot be reused after deletion.

Reports are deleted after thirty days in every review state. Immutable operator audit records remain; report-review audit captures status, not original report text. Keep operator reasons focused on action/record references rather than copying private report text. Explicit owner/bot deletion policy and deployment backup copies/expiry remain separate. This producer neither deletes score ledgers nor manages filesystem/off-host backups.

## Bounded social and credential reads

Credential history and outgoing block history use 100-record keyset pages. Live bidirectional block routing loads only edges whose two endpoints belong to the capacity-bounded yard; historical offline relationships do not accumulate in the routing cache. Unknown members and failed refreshes deny delivery until a successful refresh. Generation checks prevent stale reads from undoing a later block. Recent chat replay separately queries only original-recipient senders in the thirty-second, 256-message buffer, preserving legitimate departed-sender history while honoring subsequent blocks.

All non-league unfinished matches, including the standalone screen, consume the same MAX_ACTIVE_MATCHES admission budget. Match creation and accepted challenges share the existing serialized admission lock. Failed capacity admission consumes neither the creation key nor a successful receipt. League offline-readiness scans consider running batches only; yard voice routing considers circle matches only.

## Browser content policy and private diagnostics

The custom server replaces any inbound CSP/nonce headers and generates a cryptographically random per-request script nonce before Next renders. Production scripts require that nonce and strict-dynamic; runtime eval and inline event handlers are denied. Pages render dynamically and must not be cached as shared HTML. Static bundles remain cacheable. Development alone permits unsafe-eval for the framework debugger. See [Next's nonce rendering contract](https://nextjs.org/docs/app/guides/content-security-policy).

Connections are restricted to the same origin and its explicit WebSocket origin. Images may use local/data/blob resources, media local/blob and workers local/blob. Objects, embedding, foreign form actions and base-URL changes are denied. The microphone is limited to the current origin; camera/geolocation are disabled. Referrers are suppressed. Inline styles remain allowed because Blockly/Phaser position elements and inject styles at runtime; this is a style exception, not script permission.

Blockly 13.4.0 media is vendored unmodified under public/blockly with its license and served locally. Refresh those assets together with an intentional dependency upgrade. The editor and lifecycle lab do not depend on the default external Blockly asset host.

server.ts installs fixed startup/fatal diagnostic sinks before dynamically importing server/main.ts. Configuration/import/database failures emit service.startup.failed; uncaught exceptions and unhandled rejections emit service.fatal and exit 1. Only a typed writer conflict uses WRITER_ALREADY_RUNNING; other startup/fatal failures use SERVICE_UNAVAILABLE. The readiness log contains a fixed event rather than an environment URL. The migration CLI likewise emits a fixed migration.failed diagnostic. HTTP infrastructure logs omit raw exception messages, names and frames, including multiline error content. These application boundaries do not configure a hosting provider's proxy/access logs.

npm run test:security builds and runs production HTTPS Chromium checks for nonce hydration, forged-header replacement, blocked inline handlers/eval/foreign connects, real desktop/touch builder flows and a complete visual-versus-human game. npm run test:startup-privacy spawns real application/migration processes with sentinel configuration/database errors plus uncaught exceptions/rejections. Native media and physical drain/recovery remain separate commands; synthetic media is not real-device audio evidence.

## Aggregate release diagnostics

Ten-second service.metrics windows use fixed counter names, bounded histograms and numeric/boolean gauges. No owner, session, credential, match, message or move identifiers/values become metric labels. Counters saturate at the safe integer ceiling and reset each window; restart resets process totals. They are diagnostics, not a durable accounting ledger.

http.rejected counts unsuccessful v1 JSON responses, including command ACKs with ok=false even when HTTP is 200. socket.rejected counts failed game-command/state/yard/voice requests; socket.auth.rejected counts namespace authentication failures; socket.transport.rejected counts the application origin/stopping handshake guard. socket.connected/disconnected record admitted namespace lifecycles. yard.reconnected records successful entry through a new connection while that owner's bounded retained presence exists; it does not keep an all-time owner map or classify returns after presence expiry.

move.recorded and move.timeout count newly inserted decision rows only after the owning service transaction confirms COMMIT. Retries and repeated checkpoint saves do not count existing decisions; rollback discards pending metric increments. System, human and bot decisions are included, so timeout fraction is move.timeout divided by move.recorded for a window or summed windows. A crash or lost COMMIT response can lose diagnostic counts; immutable database rows remain authoritative. Direct fixture SQL transactions outside the service transaction helper are not metric producers.

worker.failed counts unexpected native worker loss/malformed output/startup failures, once per slot loss; worker.timeout is the execution-watchdog subset. Normal pool close does not count as failure. voice.policy.failed counts refresh query failures; voice.policy.stale counts observed fresh-to-stale lease transitions rather than every watchdog tick. game.tick.failed, outbox.published and metrics.refresh.failed expose publisher/coordinator and sampling outcomes.

Every five seconds the serialized background tick samples active match/seat totals and the oldest unpublished event through an indexed single-row lookup. The publisher does not read event payloads for delivery: it still obtains each recipient's current authorized snapshot. durableMetricsAvailable and durableSampleAgeMs distinguish current observations from failed/stale samples; more than fifteen seconds old is unavailable. Unknown age/counts start at -1. Last-known counts remain visible during failure; a last-known empty outbox is not proof that it stayed empty. outboxOldestAgeMs conservatively advances a known oldest event's age using monotonic elapsed time, including query time, until the next successful sample. Gauge failure never substitutes fresh zero counts.

activeMatches includes league and social unfinished games; activeSeats counts their complete retained rosters, including system/abandoned seats. yardPlayers includes the existing short disconnect reservations, while connectedSockets counts actual connections. Hosting alerts/collection are still deployment work: inspect rising outbox age, unavailable samples, repeated tick/policy failures, timeout ratio, queue pressure and worker loss rather than treating this local instrumentation as a configured hosted alerting system.

## Independent deadline and outbox producers

The deadline/coordinator producer no longer awaits snapshot fanout. A separate single publisher reads at most 100 ordered pending metadata rows and checks a fifty-millisecond cooperative budget between complete events. Each receiver still gets a freshly authenticated/projected snapshot; private events retain their recipient-seat restriction. The budget does not interrupt an individual SQL call or recipient fanout. Unsent/unmarked events remain pending for later batches.

Shutdown stops new publisher batches and awaits its admitted work before releasing the writer. Publisher failures emit outbox.publish.failed and increment outbox.failed separately from deadline failures. The physical drain suite holds a real pending event-row lock, proves deadline timeout decisions still commit, signals shutdown and checks the writer remains held until the blocked publisher can finish.
