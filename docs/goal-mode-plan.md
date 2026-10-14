# Goal Mode execution plan

Status: execution brief for the proposed v1 game, not completed development.
Read with [implementation.md](implementation.md), which describes the engineering milestones. This document adds the instructions, completion gates and persistent handoff that an implementation agent needs to carry them through.

## Goal to give the coding agent

> Build the first complete playable version of Don't Drop The Soap by following docs/goal-mode-plan.md. Read the repository instructions and linked technical specifications, inspect the actual code, and resume from the first incomplete stage. Implement working features rather than producing another plan. Work through the stages with the documented acceptance gates, keeping this file's execution record updated with commits and verification evidence. Continue to the next ready stage without asking me to approve routine implementation choices. Preserve the chaos-first vision, simple cooperate/betray game, human social yard and open bot interface. Use the proposed technical defaults unless inspection or testing shows a concrete reason to change them; record material changes in the owning document. Do not call a mocked or unverified feature complete. If credentials, real devices, people or deployment authority are missing, finish all independent work and report the exact remaining dependency. Deliver a reproducibly runnable release candidate and a clear completion report; deploy only where already authorised.

This is a repository execution brief. It does not depend on undocumented Goal Mode controls, grant additional tool permissions or guarantee uninterrupted execution in a particular product.

## What “finished” means

The endpoint is a complete v1 playable alpha with all core features integrated. It is not an indefinitely expanding prison simulator.

A new user can:
1. Open the app, establish an identity and enter a cartoon 2D prison yard.
2. Move on desktop/mobile, discover circles and understand who is human or a bot.
3. Chat nearby, use proximity voice, mute/block and report.
4. Join or challenge human opponents and play fair simultaneous-move matches.
5. Enter a personally owned external bot or a bot made with the visual builder.
6. Watch matches while retaining a human presence in the yard.
7. Join the open bot league and inspect results and standings.
8. Reconnect without losing identity or corrupting a match.

The server protects moves and ownership, resolves deadlines and departures consistently, records durable results and handles restart without duplicate settlement. A fresh checkout can run the required services using documented commands. Operations and remaining limitations are documented.

Distinguish these release states:
- **Implementation complete:** production code, migrations and automated gates pass; no core feature is a stub.
- **Validated release candidate:** required device, voice, playtest, load and recovery evidence also passes.
- **Deployed alpha:** a validated candidate is running in an authorised environment and has passed deployment smoke checks.

Do not label implementation complete as a fully validated/deployed project. A missing real-device test is a pending gate, not an invented pass.

## Read order and authority

1. Repository-level instructions, including any AGENTS.md present at execution time.
2. [Game vision](game-vision.md).
3. [Technical index](README.md) and [implementation milestones](implementation.md).
4. Relevant sections of [architecture](architecture.md), [gameplay](gameplay.md), [data](data.md), [protocol](protocol.md), [bots](bots.md), [yard/voice](yard-and-voice.md), [testing](testing.md) and [operations](operations.md).
5. Actual source, migrations, tests, working-tree changes and execution record.

Current user instructions take precedence over this brief. Implementation evidence determines what exists. Specifications determine intended behaviour. If code differs, reconcile it rather than claiming the feature exists because a document describes it.

Use this document for sequencing and acceptance; numerical rules belong in their owning technical docs. Do not introduce contradictory copies of settings here.

## Execution rules

- Start by checking the branch, working tree, recent commits and existing work. Preserve unrelated changes. Do not repeat a completed milestone just because the session is new.
- Use an integration branch or isolated worktree. Make small coherent commits. Prepare reviewable stage PRs where supported; pending merges must not prevent further work on the integration branch. Do not merge or deploy without existing authority.
- Implement the shortest complete vertical slice for the active stage. Run the app and test the real behaviour. Add only tests that establish meaningful rules, integration correctness or regressions.
- Keep the application bootable between stages. Retain an isolated legacy demo if useful; never expose its insecure handlers alongside the new public protocol.
- Use the current proposed defaults without repeatedly asking about them. Choose routine packages and code organisation yourself. For material deviations, explain the evidence and update the owning spec.
- Never weaken hidden moves, authentication, isolation or durability just to pass a gate. Do not remove failing tests or mark skipped checks as passed.
- Dependencies may be mocked inside unit tests. Core acceptance uses real integration paths. Voice simulation is not proof of media authorization; in-memory storage is not proof of restart durability.
- No unsolicited expansion into clans, guards, payments, AI inference hosting, prison governance or other future ideas.
- Continue after a passing stage; a plan, summary, scaffold or single green test is not the end of the goal.
- Where tools or permissions prevent an action, record the blocker and complete independent work. Do not bypass restrictions, invent credentials, incur unapproved charges or claim deployment happened.
- Keep secrets out of Git and status files. Commit source and safe evidence summaries, not private database dumps, recordings or credentials.

## Common stage loop

For each stage:
1. Read its inputs and inspect implementation.
2. Identify a concrete playable deliverable and risks.
3. Implement, including migration/error handling where needed.
4. Run its acceptance checks and relevant regression checks.
5. Fix failures before considering the stage verified.
6. Record changed code, commands, results, evidence, commit and remaining blockers below.
7. Update actual-feature status in the root README and move to the next ready stage.

Use statuses: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_PENDING_VALIDATION, BLOCKED, VERIFIED. A stage with an unresolved exit gate cannot be VERIFIED. When only an external validation is blocked, continue code-independent stages while keeping the gate pending.

## Stage 0 — Establish a reproducible foundation

Inputs: architecture, implementation milestone 0, current package scripts and source.

Deliver:
- Reproduce install, build, typecheck and the existing two-browser game.
- Document baseline failures honestly and fix tooling needed for development.
- Add focused tests for payoffs, pairing and Clanker behaviour.
- Establish local service setup, configuration validation and a safe .env.example.
- Confirm dependency/runtime compatibility.
- Spike Phaser/React mount/unmount, Blockly touch interaction and voice subscription enforcement.
- Archive legacy data only if it exists and is accessible; otherwise record that no archive was available. Never fabricate or overwrite it.

Gate: fresh-start instructions work, baseline behaviour is understood, core test harness runs and dependency choices are recorded. Voice and real-device spikes may remain explicitly pending if inaccessible; they block their respective final gates, not all match-core work.

Demo: two clients complete the original loop; renderer/editor prototypes mount cleanly. Do not mistake spikes for finished features.

## Stage 1 — Make the match engine trustworthy

Inputs: gameplay, architecture, protocol and implementation milestone 1.

Deliver:
- Explicit match transitions with injected clock/RNG.
- Runtime-validated commands, private/public projections and exact round targeting.
- Server-issued guest identity, authenticated control and controller fencing.
- Immutable first moves, simultaneous reveal, consistent timeout/leave handling.
- Adapt the existing React match screen and make Clanker a system entrant.

Durable identity/epoch infrastructure needed for these guarantees may be pulled forward from stage 2. Avoid inventing a throwaway insecure substitute merely to preserve stage numbering.

Gate: two humans plus Clanker complete a game. Modified clients cannot impersonate, read an early opponent move or rewrite a committed move. Delayed packets, duplicate submissions and departures resolve under the documented rules.

Demo: inspect actual wire payloads before reveal and show reconnect/timeout behaviour.

## Stage 2 — Persist games and connect external bots

Inputs: data, protocol, bots and implementation milestone 2.

Deliver:
- PostgreSQL migrations and repositories, command receipts, event outbox, ledger and singleton ownership.
- Atomic move acceptance, round resolution and final settlement.
- Restart recovery and legacy identity separation.
- Owned external bots, token creation/revocation, heartbeat and controller lease.
- HTTP and socket adapters to one command service.
- Runnable minimal Python and TypeScript clients with setup instructions.

Gate: human versus an externally running bot works through the real API. Restart after accepted moves preserves them. Retries, multiple resolvers and finalisation cannot duplicate scoring. Revocation fences a connected bot.

Demo: run an example bot from a separate process, drop its connection, resume, and show a recovered match after server restart.

## Stage 3 — Make the yard playable

Inputs: yard/voice, protocol and implementation milestone 3.

Deliver:
- Original cartoon placeholder art, one map and four circles.
- Authoritative movement, local prediction, remote interpolation and mobile controls.
- Circle inspection/join, owned-bot admission, direct challenges and spectators.
- Human seating and independent movement for owners watching bots.
- Nearby text with server routing, usable block/report flow and accessibility alternatives.

Gate: multiple users enter the yard, find a table, play a mixed match and return. A full circle rejects excess seats. Teleport packets cannot bypass interaction distance. Rerenders and page navigation do not duplicate connections.

Demo: two browser sessions plus a bot; include a mobile viewport, resize and reconnect. Real-device evidence is recorded separately.

## Stage 4 — Integrate proximity voice

Inputs: yard/voice, operations, testing and implementation milestone 4.

Deliver:
- Provider adapter with proved server-enforced audience.
- Human-only room tokens, authoritative audible sets and revocation.
- Push-to-talk, speaking indicators, mute, block, spectator filtering and device failures.
- Clear owner-managed agent-listening notice; no built-in transcription or model integration.
- Text-only fallback when media is unavailable.

Gate: distant and blocked clients cannot obtain forbidden audio even with modified subscription requests. Track republish, reconnect and token reuse do not defeat policy. Browser microphone denial and device interruption recover cleanly.

Demo: nearby/distant/blocked listeners and a spectator. Real devices and a 4–8-person session remain mandatory for final validation.

If the initial provider fails the gate, change the media adapter or room policy and update the spec. Client volume attenuation is not an acceptable substitute for enforced access.

## Stage 5 — Let nonprogrammers build bots

Inputs: bots, data and implementation milestone 5.

Deliver:
- Blockly editor, presets, validation feedback and readable strategy summary.
- Canonical AST, immutable versions, bounded worker execution and durable per-seat memory.
- Create → test → publish → enter → watch → edit for next match.
- Clear ownership/status and useful owner-only execution feedback.

Gate: a user can build tit-for-tat visually and enter it against a human/external bot. Program limits protect the game process. Retried decisions do not advance memory twice. Editing does not change a running match's frozen version.

Demo: construct a bot through UI, publish, compete and revise. Test touch editing; presets alone do not satisfy the full builder gate.

## Stage 6 — Run the bot league

Inputs: gameplay league rules, data and implementation milestone 6.

Deliver:
- Batch registration, locked entries/settings, schedule, fixtures and attempts.
- Scheduler, readiness/offline handling and per-bot concurrency limits.
- Separate standings, public outcomes and replay of recorded moves.
- Clear open-compute limitations, with no false “frozen external code” claims.

Gate: a complete 4–16-bot batch finishes with correct standings. Every pair gets exactly one settled fixture. Abort/retry and restart never double-credit. Visual and external bots participate through the same rules.

Demo: one completed batch including a deliberately disconnected entrant and a retried fixture. Replay shows stored outcomes without rerunning models.

## Stage 7 — Complete and validate the release candidate

Inputs: testing, operations and implementation milestone 7.

Deliver:
- Finish integrations, replace misleading placeholders and resolve broken flows.
- Verify fresh checkout, migrations, seed/demo content, startup and shutdown.
- Run correctness, integration and browser checks.
- Run planned load/soak tests; set caps from evidence.
- Restore a real backup into an isolated environment and exercise rollback.
- Test moderation and credential/session revocation.
- Complete real mobile voice/editor/gameplay tests and human playtest.
- Document actual limitations and release/deployment instructions.

Gate: all core feature gates passed, no known identity/move/settlement vulnerabilities, no undisclosed mocks, no unresolved data corruption or normal-flow crashes. Required checks have attributable evidence. Rough art is acceptable; inaccessible controls and nonworking voice are not “polish”.

Prepare a release-candidate commit/tag recommendation and release notes. Deploy and share externally only with existing authority; otherwise leave a concrete deployable candidate and the exact remaining deployment step.

## Handling blockers without losing momentum

Classify each blocker as implementation defect, missing external access, unavailable validation environment, conflicting requirement or authorisation boundary.

Fix defects autonomously. For external blockers record what was attempted, the exact missing input and which stages depend on it. Continue independent tasks. Example: missing media credentials can leave stage 4 pending while stages 5 and 6 proceed; it cannot justify marking proximity voice complete.

Ask one focused question only when the answer materially changes the implementation or the remaining action requires permission. Before asking, make the result and alternatives concrete. Never ask for general permission to continue after each milestone.

## Persistent execution record

Update this section during development. These initial statuses mean no implementation has been verified by this document.

| Stage | Status | Evidence / commit | Remaining gate |
| --- | --- | --- | --- |
| 0 Foundation | IMPLEMENTED_PENDING_VALIDATION | Baseline/domain tests, real browsers, renderer/editor lifecycle and emulated touch | Voice authorization spike and real devices |
| 1 Match core | VERIFIED | 35 rule/configuration checks, three PostgreSQL checks, real HTTP/socket and browser games, physical restart, typecheck/format/build | Maintain regressions while extending bots/yard |
| 2 Persistence/API | VERIFIED | Real Python/TypeScript games, browser credential UI, seven PostgreSQL checks, filtered cursors and physical external recovery | Maintain regressions through yard/league integration |
| 3 Yard | NOT_STARTED | — | Complete social/mixed loop |
| 4 Voice | NOT_STARTED | — | Enforced routing and devices |
| 5 Visual bots | NOT_STARTED | — | Builder and execution limits |
| 6 League | NOT_STARTED | — | Complete recoverable batch |
| 7 Release candidate | NOT_STARTED | — | Integration and launch validation |

At each checkpoint append or update:
- Branch and last committed implementation SHA; preserve notes on uncommitted work.
- Active stage and next concrete task.
- What works in a real run.
- Verification commands, date, environment and concise results.
- Failed/skipped checks and why.
- Deviations from the technical plan and owning docs updated.
- Exact external blockers, without secrets.
- Location of safe screenshots/log summaries when useful.

Commit checkpoints at meaningful boundaries and before handing off. Do not generate separate status files unless this section becomes unwieldy; if moved, keep one canonical linked record.

### Checkpoint — 14 October 2026, foundation and match core

- Integration branch: codex/playable-alpha; started from clean 6258d78. Last committed implementation SHA: dea148f (authenticated durable match foundation). Draft review: https://github.com/MrCooper846/dontdropthesoap/pull/4.
- Added a deterministic match domain with explicit deadlines, private/public projections, immutable first decisions, system Clanker, frozen seats, timeout/leave rules and terminal recovery.
- Added server-issued HttpOnly guest sessions, origin/CSRF checks, durable controller epochs with transaction locks, runtime schemas and exact round/seat targets.
- Pulled PostgreSQL persistence forward: migrations, normalized constraints, internal checkpoint, receipts, single-use creation keys, outbox, social ledger and exclusive writer ownership. Durable decisions commit before success ACK.
- New entry point /play is a real multiplayer match UI. The legacy server is isolated on localhost; renderer/editor /lab is explicitly a spike.
- Evidence so far: 35 domain/configuration checks; three isolated PostgreSQL checks; two-browser original loop; Phaser/Blockly mount/unmount/remount and actual Chromium-emulated touch drag; hostile HTTP and actual Socket.IO payload inspection; three humans plus Clanker complete via the real protocol; physical process kill/restart retains an accepted hidden move, fences old epochs, rejects another writer and aborts a second interruption.
- Initial checkout contained no SQLite ledger. Baseline tests created synthetic rows; the available ledger was preserved by legacy:archive with SHA-256 1a119a284e803418e4172edc794c90d4c12cad9a8b36c228d22ed6c15217bd62 and four balance/four finished-score rows. Private files remain ignored.
- Fixed observed failures: Blockly module locale interop; distinguished its shared measurement canvas from Phaser resource cleanup; separated read/write rate budgets; locked controller checks against takeover races; waited for actual seat admission before readiness; used a final-results assertion window that includes the five-second reveal; isolated legacy route prerendering after removing the default legacy socket provider.
- A build was accidentally overlapped with a dev-browser run, causing a shared .next build artifact failure. Verification now serializes browser, recovery and build processes; the failed overlapping build is not evidence of a pass.
- npm audit now reports zero advisories. New package choices are recorded in architecture.md. The checkpoint representation adjustment is in data.md; implemented API subset and opaque creation keys are recorded in protocol.md.
- External validation pending: real iOS/Android touch/audio, browser microphone/device interruption, enforced media-audience proof, 4–8-person playtest, load/soak and backup restore. No voice or release validation is claimed.
- Final verification: npm test (35 pass); npm run typecheck; npm run lint; npm run test:browser (2 pass); npm run test:integration (3 pass); npm run test:alpha (3 pass); npm run test:recovery (physical crash/restart pass); npm run build (pass after legacy-route prerender repair); npm audit (zero advisories). Environment: Ubuntu WSL, Node 24.18.0, PostgreSQL 17.11 via Docker, Chromium 156.
- Next concrete work: stage 2 external bot principals, scoped credentials, leases, examples and cursor recovery. Continue independent stages while voice/device gates remain pending.

### Stage 2 checkpoint — external identity layer

- Active branch: codex/external-bot-api, based on 60fc8bc. Last committed implementation SHA: d4ed714. The stage-1 review branch remains frozen for draft PR #4; pending merge does not block this descendant stage.
- Implemented server/bots/identity.ts against real PostgreSQL: owned external bot/version registration, owner-only listing, 256-bit scoped bearer credentials stored as hashes, credential revocation, durable controller epochs, a five-second heartbeat contract and fifteen-second ephemeral lease expiry.
- Verified separate owners cannot mint/revoke another owner's credentials; takeover fences earlier controllers; revocation invalidates the active credential and clears its lease. Per-owner credential issuance is serialized for cap enforcement.
- Checks: npm run typecheck, npm run lint and npm run test:integration all pass (five PostgreSQL tests total, including the three match-persistence tests).
- This layer is not mounted as public bot routes and cannot yet enter a bot into a match. Do not claim external bot participation complete. Registration/credential issuance still needs resource-creation idempotency before HTTP exposure.
- Next concrete action: wire bot principals into the common command service, add owner admission/readiness and real HTTP/socket routes, close active sockets on revocation, provide runnable Python/TypeScript strategy clients, add cursor replay and finish the human-versus-external-bot/restart gates.
- No live game-service process was left running. Local Compose PostgreSQL remains available. No voice provider credentials or physical-device evidence was supplied; those final gates remain pending.

### Stage 2 checkpoint — working external participation

- Active branch remains codex/external-bot-api. The owned identity layer is now wired into authenticated HTTP/Socket.IO actors and the common match command service.
- Implemented owned admission/version freezing, per-owner/per-bot active-seat limits, bot readiness/heartbeat checks, external-only moves, shown-once credential creation, idempotent resource receipts, active-socket revocation, stable version errors and filtered cursor replay.
- Added /bots registration/credential UI and mixed-table entrant selection/watch flow. Python and TypeScript reference clients each implement cooperate, betray, tit-for-tat and seeded random with exact-round actions, retained retry IDs, heartbeats and reconnects.
- Real evidence: each client runs as a separate process against a human and finishes with expected scores; a browser registers/issues/hides/revokes a credential; modified clients remain unable to control humans or obtain owner-management access; revoked sockets disconnect and subsequent requests reject.
- Physical external recovery: a committed bot decision survives a server SIGKILL, stays hidden from the human, receives the interruption policy, and a real client reacquires its fenced lease. A separate mid-match bot-process restart resumes participation; final scores are -10/+15 with one completed game.
- Cursor sentinel test proves unrelated observers cannot see private move events, advances their cursor across invisible rows and resets invalid cursors. Competing resolver calls are now exercised in PostgreSQL regressions.
- A real-process check found a PostgreSQL DISTINCT/ORDER BY assignment-query error; replaced it with a membership EXISTS query and reran both clients successfully.
- Credential response replay deliberately returns metadata without the secret, preserving hash-only token storage. Lost issuance responses require revoke/reissue; owning protocol/examples document this exception.
- Final checks passed after readiness/version/feature-flag fixes: typecheck; seven PostgreSQL integration tests (including explicit bot impersonation/host/management/foreign-observation rejection); six browser scenarios; physical human and external-bot crash/reconnect harness; production build; formatting; npm audit with zero advisories. Domain/configuration/protocol suite contains 36 passing tests.
- External bots are enabled by default for the working alpha, with FEATURE_EXTERNAL_BOTS able to disable their routes, sockets and admission. No core bot acceptance uses mocks.
- Verified implementation SHA: 24ce3b0. Stacked draft review: https://github.com/MrCooper846/dontdropthesoap/pull/5 (base codex/playable-alpha). No merge/deployment occurred.
- Next ready stage after this gate: authoritative yard movement, four circles, challenges, spectating, nearby text and block/report. Voice/device gates stay pending.

## Resume procedure

Read the record, inspect Git and verify claimed work against code and evidence. Resume the first incomplete ready stage. Re-run checks affected by intervening changes; do not automatically rerun every expensive test. If a prior stage regressed, repair it and update its status.

If execution is interrupted, leave the next actionable task and unresolved failure visible. Do not promise an automatic restart or schedule one unless the user requested that capability.

## Final report

Return:
- Release state: implementation complete, validated candidate or deployed alpha.
- Commit/branch and runnable entry point.
- Core features demonstrably working.
- Verification evidence and tested devices/load.
- Any remaining blockers, with their effect on completion.
- Deployment/rollback instructions or authorised deployment result.

Stop expanding scope once the agreed v1 gates pass. Further mechanics require a new goal.
