# Verification plan

Status: required checks for future implementation, not tests already present or executed.

## Test layers

Use Vitest for domain/interpreter tests; integration tests against an isolated real PostgreSQL database; scripted Socket.IO and HTTP clients for protocol; Playwright for browser flows. Use fake clocks and seeded RNG for domain tests, real timer/reconnect tests for transport. Never run fault injection against production.

| Area | Required scenario and expected result |
| --- | --- |
| Hidden moves | Inspect every socket/HTTP/snapshot/error path before reveal; only the sender's choice appears |
| Identity | Submit another owner's seat or host ID; reject without state change |
| Credentials | Revoke token during active socket; further commands and reconnect fail |
| Controllers | Second controller takes over; old epoch cannot submit |
| Idempotency | Lost ACK then retry yields same result; changed payload under same ID rejects |
| Round targeting | Delayed prior-round command cannot become a current-round move |
| Deadline race | Move handler and expiry resolver run concurrently; exactly one valid resolution |
| Move lock | Second command cannot rewrite a committed move |
| Seating | Two final-seat requests race; capacity never exceeded |
| Departures | Disconnect/leave preserves committed choices and roster; timeout policy applies |
| Settlement | Duplicate resolution and finalisation create no duplicate balance/league credit |
| Recovery | Crash before/after commit and before broadcast; snapshot resumes accurately |
| Bot pool | Infinite/oversized/invalid program rejected or terminated without game-loop stall |
| Bot memory | Retried visual decision advances state/RNG only once |
| External bot | HTTP and socket versions receive equivalent authorised observations |
| Pairings | Every seat appears once per social round; filler only when required |
| League | Each unordered pair has one settled fixture; retries cannot double-count |
| Migration | Legacy IDs cannot authenticate or seize new owners |
| Infrastructure outage | Stop an isolated real database beyond the decision duration; recovered active match aborts with hidden moves intact and no timeout result/credit. Commit-time guards reject late writes and incomplete recovery renewal |
| Restore/rollback | Export a real fixture snapshot, decrypt/restore into a new database, compare all application data/schema, authenticate a pre-backup session, boot the actual previous binary and roll forward without changing score ledgers |
| Shutdown | Block actual HTTP/socket/preview work on row locks, signal twice, reject later admissions, exclude a second writer, finish admitted ACKs on WebSocket/polling, drain native voice policy work, restart without duplicate moves/results, and bound an unfinished-body request |

For payoffs assert the full four-case matrix and two-noodle ante. Property tests verify results sum to the expected joint net for each pairing and never generate multiple results for the same pairing. Avoid tests that simply copy implementation statements.

## State/visibility fixtures

Maintain one complete test fixture containing two humans, two owned bots, a spectator and an unrelated owner. Check public, own-seat and admin projections against explicit allowlists. Add a private sentinel to internal state and assert it never appears in unauthorised payloads. Log redaction is tested too.

Test archived bots, deleted sessions, expired creation keys, duplicate connection IDs, malformed JSON, missing fields, extra fields, extreme numbers, NaN-like strings, overlong Unicode names and oversized messages.

## Voice gate

Use at least three clients: nearby, distant and modified hostile listener. Prove the distant client cannot receive audio by requesting arbitrary track subscriptions. Repeat after movement, track republish, block, reconnect, token expiry and yard exit.

Test routing-service failure fails closed. Verify user-controlled subscription permissions cannot broaden the server's intended audience. If the adapter cannot enforce this, the feature is blocked pending a different room/authorization design.

Perform microphone and background/resume tests on desktop Chrome/Firefox/Safari and actual iOS Safari/Android Chrome where available. Record tested versions and devices; emulation alone does not prove mobile voice works.

## Playtests

First session: 4–8 humans, with at least one basic and one external bot. Observe whether users can find a circle, identify bots/owners, understand lock/reveal and return for another match. Test spectators, deliberate misinformation and owners wandering away from their bots.

Separate product findings from bugs: a strategy being boring is not a networking failure. Change one ruleset version at a time so results are comparable.

## Performance targets

These are acceptance targets, not benchmarks already achieved:
- 32 human presences, four eight-seat tables and a mixture of visual/external bots.
- p95 durable command ACK <250 ms on the test deployment excluding client internet RTT.
- p95 event-loop lag <50 ms; no dropped deadline resolution under nominal load.
- Stable memory after a 60-minute join/leave/reconnect soak.
- At least 30 FPS on the selected low-end mobile test device.
- Voice joins and restriction updates measured separately from gameplay.

Run 2x target synthetic game load to establish failure behaviour, then set admission limits from measured headroom. Use real audio participants for media checks; socket bots do not simulate SFU load.

## CI gates

Every implementation PR: typecheck, targeted domain/integration tests, production build, protocol-schema compatibility check and a short browser smoke test. Schema-changing PRs also run fresh-install and upgrade migrations. Networking/persistence changes run relevant crash and race tests.

Documentation-only PRs check relative links, terminology, examples and cross-document consistency. Do not claim runtime validation for a documentation change.

## Production mixed-bot workload

After npm ci, services:up, test:setup and build, run npm run test:load in Ubuntu. The fixture uses only local soap_load and production port 3117, resets that named synthetic database, and never targets a deployed database. Run sequentially with other build/browser/runtime checks. HTTPS test origins and Secure cookies are configured while Node clients connect over loopback; this is not public TLS/network validation.

The nominal profile creates 32 real authenticated yard/socket presences, walks to the four actual circles and fills all 32 seats: 26 human controllers, three native visual bots, and three separately running reference clients (two TypeScript, one Python). It checks persisted seat kinds and all 30 accepted native visual decisions. Ten-round games run together with 50-ms input attempts (one outstanding per client) and 1.1-second proximity-chat attempts. One human per table deliberately skips round three; those four choices must resolve through the real deadline path. Exactly 320 moves, four deliberate timeouts, 160 results and 32 credits must persist.

Human socket ACK timing uses the real client round trip; external HTTP ACK timing is measured inside each separate client through optional SOAP_METRICS=true. Only numeric timings are emitted, without identifiers or moves. Nominal p95 must be below 250 ms on both transports. Retained ten-second service windows exclude setup/partial start and disconnected/draining samples; event-loop p95 must stay below 50 ms. Reports are ignored under data/load-runs with private file permissions.

npm run test:load -- --twice uses a test-only 64-presence yard and sends two identical copies of every measured durable command. It doubles presence/input/chat/command traffic while retaining the map's four-table/32-seat limit and the same six bots; it does not claim eight tables or doubled bot-compute capacity. Both copies must ACK while the durable outcomes remain unchanged. Timing targets are reported separately for this headroom profile. Public defaults remain 32 presences/four tables and the initial 256 admitted-work bound.

Recorded local production samples (Node 24.18.0, WSL2, Intel i7-11850H/16 logical CPUs):

| Profile | Human socket ACK p95 | External HTTP ACK p95 | Highest retained event-loop window p95 | Durable results/credits |
| --- | --- | --- | --- | --- |
| 32 presences, one command copy | 136.77 ms / 260 samples | 77.92 ms / 30 samples | 10.73 ms | 160 / 32 |
| 64 presences, two command copies | 154.08 ms / 520 samples | 82.88 ms / 30 samples | 12.92 ms | 160 / 32 |

The active game windows lasted approximately 26–27 seconds after setup/warmup. Deliberate deadline-to-observed-reveal delay stayed below 345 ms; the verifier allows at most one second. Highest sampled RSS in retained windows was about 352/590 MiB respectively, not an established steady-state memory bound. These runs support retaining the conservative 32-presence default; they do not establish the required 60-minute join/leave/reconnect soak, real-device FPS, media capacity or deployment performance. Those remain explicit release gates.
