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
| 0 Foundation | IMPLEMENTED_PENDING_VALIDATION | Baseline/domain tests, real browsers, renderer/editor lifecycle and emulated touch | Real-device renderer/editor/audio validation |
| 1 Match core | VERIFIED | 35 rule/configuration checks, three PostgreSQL checks, real HTTP/socket and browser games, physical restart, typecheck/format/build | Maintain regressions while extending bots/yard |
| 2 Persistence/API | VERIFIED | Real Python/TypeScript games, browser credential UI, seven PostgreSQL checks, filtered cursors and physical external recovery | Maintain regressions through yard/league integration |
| 3 Yard | VERIFIED | Six real yard scenarios, seven PostgreSQL regressions, 45 domain/protocol checks, standalone games/recovery, build/typecheck/format | Actual-device/playtest/load evidence remains a final release gate |
| 4 Voice | IMPLEMENTED_PENDING_VALIDATION | LiveKit design rejected; native SFU and browser controls integrated, four real-browser voice scenarios pass | Actual-device audio/interruption, public-network/TURN and human playtest |
| 5 Visual bots | VERIFIED | Manual Blockly construction, worker/DB atomicity and complete real-browser game/edit flow | Actual-device usability/playtest remains a final release gate |
| 6 League | VERIFIED | Live visual/Python/TypeScript UI batch, hostile HTTP, offline/readmission, immutable schema and physical crash/retry/settlement checks | Maintain integration regressions; release load/device/playtest gates remain |
| 7 Release candidate | IN_PROGRESS | Production/outage, encrypted restore/binary rollback, audited operator/maintenance, measured short nominal/2x workloads | Sustained soak, remaining resource/privacy audit, deployment backup setup, actual devices and playtest |

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

### Stage 3 checkpoint — authoritative yard domain

- Active branch: codex/playable-yard, based on 48da6f7. Last committed implementation SHA: bb251fe. Stage 2 remains reviewable in PR #5; no pending merge blocks this work.
- Implemented shared/yard/map.ts and domain/yard/yard.ts: a 960×640 map with four named circles, spawn/bounds/rectangular obstacles, shared collision geometry, normalized axis movement, fixed 50 ms simulation steps, 250 ms stale-input stop, capacity, processed-input acknowledgements, socket/controller fencing, anchored human seating, circle-distance admission and bounded nearby-recipient selection.
- Tests reject absolute-position teleport payloads and extreme axes/sequence jumps; prove diagonal speed, bounds/collision sliding, stale/duplicate inputs, controller/socket replacement, seating, capacity, authoritative interaction distance, blocked/distant recipient exclusion and public-state projection.
- Checks: npm test (44 total passing, including eight new yard tests), npm run typecheck and npm run lint pass.
- This domain is not yet mounted by the live server or rendered as the game yard. It is not a completed yard feature.
- Next concrete action: add the server yard coordinator and typed socket bridge; mount a Phaser scene with original cartoon primitives, prediction/interpolation and desktop/mobile controls; integrate four circles with durable matches, owned-bot admission, spectators/challenges and nearby text/block/report.
- Local PostgreSQL remains running; no game-service or external bot test process remains live. Final physical-device/voice/playtest gates remain pending.

### Stage 3 checkpoint — playable social yard

- Mounted an original cartoon Phaser courtyard with four circles, shared collision geometry, local prediction/reconciliation, 100 ms remote interpolation, following camera, WASD/arrows, pointer/touch joystick, resize handling and accessible circle controls.
- Live authority runs 20 Hz movement and 10 Hz snapshots, with strict axis/sequence envelopes, stale-input stops, socket/epoch fencing and monotonic controller metadata. Disconnect retains position briefly; restart retains durable identity/matches and respawns yard presence.
- Circle rows/configuration persist in PostgreSQL. Admission enforces authoritative distance, circle/owner/bot capacity, current ownership and the configured active-match cap. Match subscriptions preserve yard membership. Humans are seated; owners watching bots can walk independently. Bot rows identify the owner.
- Added expiring direct challenges with atomic two-seat admission and fixed opponents, including owned-bot entrants. Added escaped nearby text with frozen recipient sets/30-second bounded history, symmetric routing-layer blocks and durable reports.
- Real yard evidence: two browsers walk/join/play/return; remote join and forged teleport fields reject; a full circle stays at its cap; old controllers cannot move; a direct challenge completes and an expired invite rejects; a real external bot competes while its owner walks and an unrelated spectator sees no hidden choices; text markup remains literal, distant/blocked users do not receive it, later movement does not unlock history, and the report row is verified in PostgreSQL.
- Chromium touch evidence: joystick changes authoritative position, portrait/landscape resize works, browser reload retains alias identity and creates one game canvas. Actual iOS/Android device evidence remains a final validation gate.
- Desktop/mobile acceptance screenshots are saved under ignored test-results and copied to the shared Windows workspace as yard-desktop.png and yard-mobile.png. Visual inspection found and fixed a squeezed chat input and narrow sidebar header layout.
- Test failures resolved: exact dropdown labels included option text, so acceptance now uses the appropriate partial label selector; textarea/list names use exact matching. These were selector failures, not invented feature passes.
- Yard is enabled by default and / redirects to /yard. Core regression configurations explicitly disable the yard and preserve their independent fixture paths. New migrations 003/004 apply to fresh and existing local test databases.
- Final post-polish checks passed: 45 domain/config/protocol tests, seven PostgreSQL regressions, six complete real yard scenarios, production build, typecheck and formatting. The six standalone match/bot scenarios and physical human/bot crash/reconnect harness also passed on this stage before the final display/cap/report additions. Actual-device/audio/playtest/load gates remain separate; no such evidence is claimed.
- Next ready stage after final check/commit: proximity-voice provider enforcement spike and adapter. The visual builder and league can proceed independently of real-device/playtest dependencies.
- Verified implementation SHA: 70bd744. Stacked draft review: https://github.com/MrCooper846/dontdropthesoap/pull/6 (base codex/external-bot-api). No public deployment or merge occurred.

### Stage 4 checkpoint — measured media design failure

- Active branch: codex/proximity-voice, based on cbcbbba. Yard remains verified in draft PR #6.
- Pinned LiveKit client 2.22.4/server SDK 2.19.1 and local server image 1.13.10. Added a loopback-only Compose voice-spike profile, development-only /lab/voice probe and a real three-browser synthetic-tone test.
- npm run test:voice-spike passed its diagnostic assertions: normal media/RTP delivery works; a canSubscribe:false client receives zero tracks/packets despite room-admin forcing; a canSubscribe:true client can override server unsubscribe and receive media again. This is a FAILED CANDIDATE DESIGN GATE, not an implemented/verified proximity voice feature.
- Upstream LiveKit fix #4701 was still open when checked. Exact method/version evidence is recorded in yard-and-voice.md.
- Added a pure audibility domain for authoritative distance <=8 tiles, full volume within three, symmetric blocks, same-table human rules, one-way spectator suppression and bot-owner avatar position. It is not yet mounted to a media transport.
- Next concrete action: implement and prove a server-authorized consumer adapter, with mediasoup as the next candidate; retain the planned distance/block semantics. Do not substitute client volume controls or weaker acoustic privacy.
- Real-device/audio/playtest evidence remains missing. Complete the adapter/builder/league/release work independently before requesting those external validation inputs.

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

### Stage 4 checkpoint — native consumer authorization layer

- Branch codex/proximity-voice. Added server/voice/media.ts with a real mediasoup native worker, Opus-only transports, bounded allocations, paused consumer creation, authority rechecks, consumer closure and connection fencing.
- Pinned mediasoup 3.29.0/client 3.24.5; explicitly approved the required mediasoup installer in package.json so a fresh npm install can install its native worker.
- Fixed an audience test fixture literal-type error discovered by typecheck.
- Evidence: npm run typecheck; npm test (49 passing, including real native SFU policy test); npm run lint; npm run build (pass); npm audit (zero advisories). Browser media remains unproved by this layer; no voice completion claim.
- Next concrete action: connect authenticated browser-only Socket.IO signaling to yard/session/controller state; implement the browser send/receive adapter and push-to-talk UI; prove real audio restriction with modified listeners and routing failure.

### Stage 4 checkpoint — integrated yard voice

- Branch codex/proximity-voice, building on b9d0559. Implemented server/voice/socket.ts and client/voice/VoiceClient.ts, mounted behind FEATURE_VOICE=true in the real yard.
- Browser-only signaling validates the cookie, controller epoch and exact active yard connection. Fresh session/match/block policy drives server-owned consumers; a separate 50 ms watchdog removes media when authorization is stale for 600 ms, including a stalled database query.
- Added explicit listening/microphone actions, default pointer/keyboard push-to-talk, immediate local release/blur/background mute, microphone mute, spectator filter, visible transmitting status, autoplay retry, actionable failure messages and text fallback. Media defaults to loopback and production requires an announced address.
- Real Chromium tests passed (npm run test:voice, four scenarios): actual synthetic RTP arrives nearby; distant requests reject; a modified listener ignores closure messages and retains its consumer but receives no new packets after distance/block changes; yard exit rejects rejoin; a database table lock stalls policy refresh and retained consumers stop receiving packets; native fake-device keyboard push-to-talk/mute/leave works; native denied microphone permission leaves listening/text usable.
- Resolved observed failures: project PostgreSQL was stopped and was restarted; microphone tests needed Chromium's explicit native fake permission response (accept/deny), confirmed independently without replacing getUserMedia; stored microphone errors were omitted from the alert body; controller changes now reset local controls.
- npm run typecheck and npm test (49) pass. Formatting passed after repairing server/voice/socket.ts. Production build passed; npm audit reports zero advisories.
- Screenshot test-results/voice-controls.png was copied to the shared Windows workspace and visually inspected. The voice panel remains readable alongside yard/circle/text controls.
- Remaining gates: track republish/rejoin, bot exclusion and controller/session revocation, same-table/spectator behavior through real media, additional browser/device interruption checks, real iOS/Android/desktop devices and a 4–8-person playtest. Voice remains IN_PROGRESS and disabled by default.
- Next concrete action: finish the remaining hostile-client/lifecycle scenarios and tighten signaling ordering/reconnect behavior before declaring automated voice gates passed. Visual builder and league remain independent required stages.

### Stage 4 checkpoint — lifecycle and browser-engine evidence

- Branch codex/proximity-voice; last committed integration implementation 48b7adb. This checkpoint adds bounded FIFO signaling, exact native-peer callback fencing and forced post-entry join refresh.
- Caught and repaired a join-cache race, a delayed old-transport callback that could remove a replacement peer, and a client consume-race cleanup gap. Added a queue regression that proves ordering, backlog rejection and recovery after failure.
- Added real-media scenarios for track republish, denied rejoin, controller takeover/reentry, session expiry/revocation/owner disable, bot principal exclusion and same-table/spectator routing.
- Strengthened movement evidence: fixed-duration input under development-server load did not always reach the claimed location, so privacy/lifecycle checks now wait for acknowledged coordinates. First-route compilation can deliberately stale voice authorization; the controls test prepares pages before establishing the call rather than treating development compilation as a media benchmark.
- Chromium lifecycle scenarios and WebKit privacy passed. Firefox's loopback ICE setup failed; a targeted test on the actual local interface passed. No test was skipped or removed to claim compatibility. The shared media test configuration now uses that local interface; combined final-network run passed ten scenarios and timed out on WebKit reentry under its five-second window. A targeted WebKit run with a fifteen-second bounded ICE negotiation window passed; the two-repeat WebKit check also passed (38.4 seconds). All eleven scenarios have passing attributable evidence across the final combined/targeted runs; the earlier failed combined result remains recorded.
- Source checks so far: npm run test:integration (seven PostgreSQL checks), npm run typecheck, npm test (50), npm run lint all pass. Production build remains to run after browser processes finish. No full-suite green result is claimed from the earlier failed combined run.
- Physical-device audio and 4–8-person playtest evidence remains unavailable. Those gates cannot be satisfied with synthetic tracks or browser emulation. Continue visual-builder/league work while retaining pending validation.

- Final source verification: expanded voice lint coverage, typecheck and 50 unit/native checks pass; seven PostgreSQL regressions pass. Production build passed; npm audit reports zero advisories. Voice is IMPLEMENTED_PENDING_VALIDATION, not VERIFIED, because physical-device audio and the human playtest remain open. Media join/restriction latency under load remains part of release validation. Next independent stage: visual bots.

- Reviewed implementation checkpoint: 29e0157. Draft PR #7: https://github.com/MrCooper846/dontdropthesoap/pull/7 (base codex/playable-yard). No merge or deployment occurred. Next concrete work: canonical visual program validation/interpreter, bounded worker execution, immutable publication and the Blockly create/test/publish/watch/edit flow.


### Stage 5 checkpoint — visual execution foundation

- Branch codex/visual-bot-builder, based on 07fc44b; stage 4 remains reviewable in draft PR #7.
- Implemented a strictly typed canonical AST with explicit structural/byte limits, declared scalar memory, deterministic RNG, bounded interpreter steps and trace. Programs cannot execute JavaScript or perform I/O.
- Added actual Blockly block definitions and starter workspaces plus deterministic saved-workspace compilation. Real headless Blockly serialization/field-edit tests establish correspondence with executed decisions; the browser editor remains unfinished.
- Added a real worker-thread pool with bounded admission, startup/execution deadlines, queued/late-result expiry, memory/stack limits, bounded restarts and checked outcomes. Native fault fixtures prove an infinite worker is terminated while the parent event loop keeps ticking; malformed responses reject.
- Loader attempts failed with extension resolution / require-ESM cycles on Node 24/tsx. Replaced them with an explicitly pinned esbuild compiler for trusted worker source, called by dev/build/test. The generated worker is ignored, reproducibly built and must be shipped with the release.
- Verification: npm run typecheck, npm test (67 passing, including nine visual-language, four real Blockly and four real worker/fault tests), npm run lint. Production build passed (including the generated worker); npm audit reports zero advisories.
- These are execution foundations, not a completed builder. Next concrete action: immutable visual publication and owner preview through the shared compiler; wire visual entrant/version freezing and atomic state/RNG/move acceptance against PostgreSQL; mount the real Blockly create/test/publish/watch/edit flow and run browser/touch/hostile-input gates.
- Voice physical-device/playtest validation remains pending; league and final release gates remain required.

- Committed/pushed visual foundation: 945698d on codex/visual-bot-builder. The stage is IN_PROGRESS; no completed builder, publication endpoint or live visual match participation is claimed. Next action remains the PostgreSQL publication/preview and atomic visual-decision integration, followed by the browser editor flow.


### Stage 5 checkpoint — integrated visual publication and gameplay

- Branch codex/visual-bot-builder, based on the foundation at 945698d/0c649ec. Added migration 005, immutable publication/version reads, independently gated preview/admission, live scheduler, atomic state/RNG/move acceptance and owner-private feedback.
- Real Blockly editor now supports gestures and complete labelled add/connect/edit controls, readable summaries, private practice, immutable publication, bot-stable links, mixed-circle admission and edit-for-next-game. New drafts remain local to their guest owner; published workspaces are durable.
- PostgreSQL/worker evidence: twelve integration checks pass, including publication retries/ownership/immutability, version freezing, duplicate acceptance races, injected mid-write rollback, five complete rounds with expected scores, recovery/stale-window fencing and live numeric-error → timeout-C behavior without memory advancement.
- Three real Chromium scenarios pass: a user manually constructs tit-for-tat (not a preset-only shortcut), tests both branches, publishes, plays all five rounds, watches private feedback and publishes revision 2 while the existing match retains revision 1; hostile HTTP checks; emulated-touch construction, actual SVG block drag, rotation, no horizontal overflow and version reload.
- Fixed actual Phaser teardown: one final frame could read a removed yard container while navigating to the editor. It now observes cancellation/ref state. Blockly resize callbacks also observe disposal.
- Failed runs recorded: exact/partial dropdown labels initially matched option text/other controls; the editor now has concise explicit accessible names. One subsequent trace failed because a test source file was edited during capture; the stable-source three-scenario suite passed. A migration-check CLI initially used unsupported top-level await in this package's CJS mode; the normal async entry fixed it.
- Fresh/repeated migration check passes on a unique temporary local database, with five migrations and visual constraints present. Earlier migrations upgraded successfully in the existing isolated test databases.
- Six standalone match/external-bot browser regressions pass. Shared-yard regressions are still running; source/build/recovery/visual review checkpoints remain before marking this stage verified.
- Visual remains feature gated (FEATURE_VISUAL_BOTS=false by default). Real-device editor/audio and the human playtest remain final release gates. League and final release work remain unfinished.


### Stage 5 checkpoint — verified playable visual bots

- Final feature is enabled by default; FEATURE_VISUAL_BOTS=false disables publication/preview/admission and prevents existing waiting visual seats from starting as a timeout-only substitute.
- Final evidence: 69 domain/protocol/native-worker/Blockly tests; 13 isolated PostgreSQL tests; three real visual browser scenarios; six standalone match/external-client browser regressions with the new default; six shared-yard regressions; fresh/repeated five-migration check; physical human/external-bot crash/reconnect harness. Typecheck and expanded formatting pass. Production build passed, including the compiled worker; npm audit reports zero advisories.
- Actual visual bot game and private feedback run through the live server scheduler, real worker threads and PostgreSQL. The manually constructed mirror scores -6 against the human's -1 over five rounds; published revision 2 cannot change the game's frozen revision 1. Database fault injection, duplicate races and pre-interruption result rejection protect memory/RNG advancement. A live runtime error leaves state untouched and becomes a visibly tagged timeout C.
- Final UI review fixed low-contrast Blockly toolbox text, fitted the constructed graph and used a horizontal mobile toolbox. Mobile supports complete labelled construction/editing plus actual touch SVG drag; it is not a preset-only fallback. Actual-device parity is still unproved.
- A stale circle snapshot briefly gave the acceptance test a null match ID; it now waits for the authoritative circle update. Failed synthetic matches also occupied a circle on later runs, so visual acceptance now uses its own soap_visual_browser database with explicit local/name checks before reset. Production admission was not relaxed.
- Retained desktop/mobile screenshots were visually inspected and copied to the shared Windows workspace as visual-builder-desktop.png and visual-builder-mobile.png. Guest aliases/strategies are synthetic; no credentials or raw voice are included.
- Fixed draft autosave so opening a published strategy cannot overwrite a new draft while its version loads. Missing compiled workers now fail immediately rather than entering a startup crash loop. Runtime shutdown drains pending work before releasing persistence ownership.
- Stage 5 is VERIFIED for its automated playable gate, with actual-device editor usability and human playtesting retained as final release dependencies, consistent with stage 3. Voice remains IMPLEMENTED_PENDING_VALIDATION; league and release remain unfinished.
- Next independent stage: league batch registration, deterministic pair fixtures/attempts, frozen visual versions, external readiness, separate standings, recoverable scheduling and recorded replay.

- Final refinements: the builder defaults to enabled; feature-off readiness is verified against an existing waiting visual table. Visual browser fixtures use soap_visual_browser (separate from yard/voice), and native preview concurrency plus missing-worker-artifact checks are covered by the implementation. The final UI and compatibility/recovery runs passed after these changes.

- Verified stage-5 implementation checkpoint: a516a89 (UI/runtime implementation 6fa89a8 plus the tracked schema migration). Draft PR #8: https://github.com/MrCooper846/dontdropthesoap/pull/8, base codex/proximity-voice. The final staging audit caught and included migration 005 before handoff; the review branch is clean. No merge or deployment occurred. Resume the league stage from this committed state.

### Stage 6 checkpoint — durable league service and public projections

- Active branch: codex/bot-league, based on d8d8c25. Added migration 006 with batches, frozen entry versions, unordered-pair fixtures, attempts, global active-bot locks and a unique fixture settlement ledger. The scheduler is wired into service startup/shutdown behind FEATURE_LEAGUE=false by default.
- Registration is limited to 4–16 owners, one owned bot each; fixed 20-round/20-second decision/one-second reveal rules. Deterministic pair ordering alternates A/B labels by batch sequence. The scheduler checks enabled bot kinds, external leases and shared active-seat admission caps. Three consecutive timeout decisions flag future admission; external reconnection must advance the controller epoch, while visual owners can confirm readiness. Cancelled/aborted attempts requeue without points.
- Added POST /api/v1/leagues and /leagues/:id/register|withdraw|close|resume through ordinary controller-fenced, CSRF-protected, idempotent resource envelopes. Public GET /leagues, /leagues/:id and /leagues/fixtures/:id/replay expose bounded batch/fixture pages, provisional schedules, separate standings and stored resolved results. Replay never invokes an agent or exposes private checkpoint moves, runtime memory or programs. Browser match commands cannot manage league fixtures.
- Found and fixed an existing public projection bug: aborting a collecting round previously made its pending decisions visible. revealedMoves now requires a persisted domain result for the current round. Regression checks cover both an unresolved collecting abort and an already revealed abort.
- Verification: typecheck passes; 73 unit/domain/native-worker checks pass; all 14 PostgreSQL integration checks pass. The new real-PostgreSQL test registers four visual bots, freezes six fixtures, demonstrates concurrent entrant exclusion, aborts after a hidden decision, retries with a new match ID, completes six fixtures and verifies shared standings, no casual credit and no duplicate settlement. Its clock and moves are driven directly through the real domain/repository services; it is not evidence of live worker/external-client scheduling or a physical server restart. Fresh and repeated migration CLI checks pass with six migrations.
- Stage remains IN_PROGRESS. Next: complete the usable league UI and real HTTP/browser flow; prove mixed visual/external execution, disconnect/offline/readmission and actual process recovery. Add schema immutability/membership hardening and attempt-history pagination before final review. Do not claim a completed league from this service-level batch test.

### Stage 6 checkpoint — playable league interface and live mixed-bot batch

- Added /leagues with owned-bot registration/withdrawal, host batch creation/early close, visible provisional pairings, entrant readiness, separate standings, paged fixtures and public attempt inspection. Owners can reach it from the yard and bot stable when FEATURE_LEAGUE=true. A guestless browser can inspect results. The preview remains disabled by default until recovery/offline gates pass.
- The page explains fixed rules, visual-version freezing, external open-compute limitations, separate casual totals, shared ranks, timeout pauses and guest-cookie ownership. Recorded rounds use stored outcomes; an open recording polls newly resolved rounds without rerunning agents.
- Added npm run test:league, port 3109 and isolated soap_league_browser with guarded fixture cleanup. The real browser test creates four independent owners, publishes two visual bots, launches the actual Python and TypeScript clients, registers through the UI and completes all six 20-round fixtures. It verifies one settled attempt per pair, shared 60-point standings and public recorded outcomes in a guestless emulated mobile viewport. Both full runs passed in approximately 2.4 minutes. A separate real-browser check of the open live recording advanced from six to eight stored rounds without reopening it. The mobile screenshot was visually inspected: no page overflow; standings and round text remain readable. Physical devices are not claimed.
- Fixed schedule ordering to use stable bot IDs rather than newly generated registration IDs, so odd/even batch A/B reversal actually applies to the same bots across batches. A new regression changes all entry IDs and verifies reversed bot roles.
- Verification: 74 unit/domain/native-worker checks, typecheck and formatting pass; production build including /leagues passed before the small live-recording polling correction, which subsequently passed typecheck and the real browser run. Earlier 14 PostgreSQL integration checks remain the service/settlement evidence. Preserve the distinction from physical process recovery.
- Next: immutable league membership/rules/settlement constraints, bounded attempt history, HTTP hostile-client tests, offline/readmission and physical server kill/restart through a complete batch. Stage 6 remains IN_PROGRESS; no release-candidate claim.

### Stage 6 checkpoint — verified durable mixed-bot league

- Added migration 007: registered owner/bot/kind/version membership FKs; fixed immutable batch rules and lifecycle; immutable registered identities and pairings; attempt/settlement membership FKs and immutable ledgers; bounded fixture points/cooperation counts. Real database tests reject changed rules/identities, closed-registration deletion, rewritten settled pairings/credits and attempt deletion.
- Public attempt history now has bounded descending pages and beforeAttempt/nextAttempts cursors, independently of the selected replay attempt. Existing fixture/batch pagination remains bounded. Invalid cursors reject through runtime schemas.
- The real PostgreSQL timeout/readmission test advances three missing external decisions through actual persistence, verifies future admission pauses, proves heartbeat alone and owner confirmation cannot clear the old controller flag, then acquires a new external epoch and completes the batch. These deadline steps use the domain clock directly; live process disconnection is tested separately below.
- Added npm run test:league-recovery on port 3110, isolated soap_league_recovery. It runs the real game process, native visual workers and TypeScript external client. SIGSTOP disconnects the external process during countdown; after a visual decision commits privately, SIGKILL/restart preserves it with one interruption. A second SIGKILL/restart aborts without settlement. SIGCONT lets the real client reacquire its fenced lease and enter a new fixture attempt; all six fixtures finish with the correct separate shared standings. Another physical post-settlement SIGKILL/restart preserves exactly six unchanged ledger rows and public replay, with zero casual credits.
- Failed recovery-harness attempts were investigated rather than hidden: immediate synthetic guest creation hit the real three/second limit, so setup now paces creation. The first retry wait assumed immediate participant availability and timed out at 30 seconds; database inspection showed the participant legitimately busy in another fixture. The bound is now 120 seconds, leaving the actual one-fixture-per-bot scheduler unchanged; the full rerun passed.
- A real browser HTTP test passes CSRF denial, identical receipt retries, changed-command rejection, duplicate entry rejection, immutable-rule payload rejection, too-few-entry closure, stale browser control, non-owner closure/registration denial, guestless read privacy, anonymous write denial and cursor bounds. Its initial request burst hit the ordinary ten/second write limit; paced test requests now reach the intended authorization checks without weakening the limiter.
- Verification at this checkpoint: 15 PostgreSQL integration checks pass, fresh/repeated seven-migration CLI passes, typecheck/format pass, physical league recovery passes and targeted hostile HTTP browser test passes. Prior full mixed visual/Python/TypeScript UI batches and 74 unit checks remain the stage's playable/domain evidence. Stage 6 is VERIFIED and FEATURE_LEAGUE now defaults true. This does not claim physical-device, human-playtest, target-load/soak or release/hosting validation.
- Next independent work: stage 7 release readiness, including fresh install/package reproducibility, backup restore/rollback, moderation/operator controls, database-outage policy, load/soak and final integrated regressions. Physical mobile/audio and a 4–8-person playtest remain external dependencies; continue independent work.

- Final stage-6 source check: 74 unit checks, typecheck, formatting and the production build all pass with the league enabled by default. No merge or deployment was performed.

- Stage-6 implementation is committed/pushed as b663dfa, with the earlier service/UI checkpoints aba40ea and 3561d13. Review: draft PR #9, https://github.com/MrCooper846/dontdropthesoap/pull/9, stacked on PR #8. No merge or deployment.

### Stage 7 checkpoint — production-only package boot

- Active branch: codex/alpha-readiness, based on league review checkpoint a4ca7ae. Promoted the already installed tsx 4.21.0 to a pinned runtime dependency because npm start invokes it; a production install previously omitted it.
- Built a new temporary release directory from versioned working-tree source plus .next (excluding cache) and dist/workers. No .env, credentials, .git or existing node_modules was copied. npm ci --omit=dev installed 165 packages and audited zero advisories. This first production smoke found another real startup defect: loading next.config.ts attempted to install TypeScript dynamically and then failed. Converted the identical two-option config to next.config.mjs, recopied the canonical package files and repeated npm ci --omit=dev from scratch. No compiler was promoted into production to mask the issue.
- scripts/production-smoke.ts refuses an installation containing Vitest and requires built Next/worker artifacts. It targets only local port 3111 and guarded local soap_release_smoke, then exercises actual npm start in production mode with test-only generated secrets, migrations/readiness, built yard/editor/league HTML, Secure session-cookie issuance, authenticated private visual-worker preview, public league read and the actual native mediasoup binary. All passed after the config correction. It shuts down its child process group. PUBLIC_ORIGIN uses a reserved HTTPS test name while requests stay on loopback; this is explicitly not a public TLS, reverse-proxy, audio-network or deployment test.
- Remaining stage-7 work is unchanged: complete load/soak, database outage handling, moderation/audit and drain, backup/restore/rollback, broad integrated regressions, fresh full build packaging, real mobile/browser audio/editor/gameplay and a 4–8-person playtest. Goal remains active; no release-candidate or deployment claim.

- Packaging checkpoint verification: typecheck, formatting and a rebuilt production Next application pass after the next.config.mjs conversion. The clean production-only runtime smoke also passed as recorded above.

### Stage 7 checkpoint — durable infrastructure-outage policy

- Added migration 008 coordinator_health and runtime health renewal. New writes check the database clock against each match's stored decision duration; stale coordination fences durable match writes. Readiness and new primary socket commands fail closed after two seconds without confirmed coordination. The local scheduling/readiness timers use monotonic time; durable game decisions still use PostgreSQL time.
- On boot, after framework preparation and before readiness/recovery, and during runtime, the service reconciles the durable coordinator gap. A gap reaching a match's decision duration aborts collecting/revealing without timeout filling or settlement; countdowns return to waiting and clear readiness. Existing accepted moves and revealed diagnostic results remain intact, and league aborts requeue normally. Public snapshots expose only abortReason=infrastructure, with a clear no-credit message. The durable per-match interruption event records the incident.
- Material recovery clarification in data.md/operations.md: the service cannot reliably distinguish long process downtime from database loss after a connection dies. Both use the conservative gap policy. Brief interruptions still receive the existing single fresh decision window; planned long maintenance should finish games first. No indefinite or infrastructure-caused timeout scoring is claimed.
- Added migrations 009/010 deferred PostgreSQL commit guards. The first rejects a match transaction if coordination becomes stale after application validation. The second prevents renewing health over an active match whose window expired while recovery waited on another row lock. Recovery explicitly enables those checks even during startup; normal runtime transactions set the local enforcement flag, preserving compatibility for older binaries on additive-schema rollback. A failed renewal rolls back so the next coordinator pass can recover rather than erase the gap.
- Five real PostgreSQL tests cover write fencing/rollback, hidden-choice retention, no timeout result/credit, short-gap normal play, rechecking database time after a held row lock, failure after save-time validation, and incomplete renewal when an earlier inspected match expires behind another held lock. The two commit guards were added after inspection identified these races, not after weakening the tests.
- Added npm run test:database-outage: a uniquely named/labelled test PostgreSQL container on loopback 55434, application 3112, no shared-database stop. It commits a real hidden human move, physically stops the database beyond a five-second window, verifies writer exit, starts the database and game, and checks infrastructure abort, one retained private move, no timeout results, no score credit and a durable interruption event. It validates container ownership before removing only its own container/volume. The physical gate passes with the final deferred guards.
- Verification so far: 74 unit checks pass; all 20 PostgreSQL integration checks pass; fresh/repeated ten-migration CLI, typecheck and formatting pass; physical database-loss test passes. During this integration the established physical human, external-client and six-fixture league recovery regressions also passed, including brief interruption preservation and repeated-interruption retry without duplicate credits. Final authenticated browser regressions (all six, including real Python/TypeScript opponents, human UI games, hostile HTTP and Clanker) and the production build pass.
- Still required for stage 7: measured load/soak and caps, backup restore/rollback, graceful drain and audited operator moderation/revocation, privacy/security/release packaging audit, final integrated regressions, actual mobile/browser audio/editor/gameplay and human playtest. No release-candidate/deployment claim.

- Outage/runtime implementation is committed/pushed as 6861c48 on codex/alpha-readiness (production-package fix 26d38b3). Review: draft PR #10, https://github.com/MrCooper846/dontdropthesoap/pull/10, stacked on verified league PR #9. No merge or deployment. Next independent stage-7 work: backup restore/rollback and graceful drain/operator controls, then measured load/soak and final device/playtest evidence.

### Stage 7 checkpoint — encrypted restore and actual-binary rollback

- Active branch: codex/alpha-operations, based on 2820a51. Added test:restore, prepare:rollback and strict test:rollback. Fixed source allowlist: only local soap_test and soap_league_recovery on Compose port 55432; restored databases use generated names and application port 3113. No live database is overwritten. Only confirmed-created restore names are dropped, and aggregate PASS follows successful cleanup.
- The drill seeds a disposable real guest through createGuest using production-compatible test secrets, exports a PostgreSQL repeatable-read snapshot, fingerprints every application row, and passes that same snapshot to actual PostgreSQL 17.11 pg_dump. It removes only its seeded source identity after snapshot closure. The custom archive is AES-256-GCM encrypted with an in-memory test key; ciphertext tampering fails authentication and the encrypted file has a SHA-256 audit checksum. Archives/reports/private diagnostics are ignored and permission restricted; no key or raw session secret is committed or printed.
- pg_restore writes a new generated database. All 30 application-table fingerprints, constraints, triggers, stored functions and indexes match. A source/restore comparison initially caught redundant CHECK-expression parentheses after PostgreSQL's dump/reparse; comparison now uses PostgreSQL's own canonical pretty deparser, preserving the actual constraint checks.
- Actual production current → prior revision 26d38b306091e9e150065c3ed819325c5c9c364c → current boots against each restored database without schema downgrade. A guest cookie created before the backup authenticates throughout with the same external session secrets; stored round results, two casual ledger credits and a six-settlement league remain unchanged. The drill requires quiescent active games before rollback; original restored tables are fingerprinted before startup's legitimate controller/recovery updates.
- prepare:rollback creates a clean ancestor package from git archive, verifies regular source entries, installs build dependencies, performs a production Next/worker build and then npm ci --omit=dev. The drill checks all committed file hashes (except regenerated next-env.d.ts), ancestor revision and a distinct build ID before execution. The first helper attempt incorrectly forced development mode during Next build and failed prerendering; build mode is now production, while initial install retains build dependencies. The corrected fresh preparation passes with zero audit advisories. Missing rollback artifacts reject the strict command rather than silently skipping the gate.
- Verification: multiple complete real restore/rollback/roll-forward runs pass on both fixture sources, including authenticated pre-backup identity, no ledger changes and owned database cleanup. Final sample at 2026-10-14 22:05:23/29 UTC: about 202/163 KiB encrypted archives; 933/1000 ms dump-to-data/schema verification; 2416/2446 ms through restored production readiness and authenticated/public reads. These are small local fixtures, not production RTO. Typecheck and formatting pass; the explicit quiescent-rollback assertion also passes. Follow-up queries show zero generated restore databases and zero disposable source identities. Folder/file modes (0700/0600) and Git exclusion were verified.
- Deployment-only backup dependencies remain: encryption/session-secret custody, daily scheduling, seven-day retention, off-host storage and a restore/rollback drill on the chosen hosting environment. The local fixture key is intentionally ephemeral, so saved ciphertext is test evidence. Next independent implementation: graceful drain and audited operator controls/revocation, then load/soak and final integrated release checks. Physical iOS/Android/audio/editor/gameplay and 4–8 humans remain external validation dependencies. No release-candidate/deployment claim.

- Restore/rollback implementation committed/pushed as fff0e57 on codex/alpha-operations. Review: draft PR #11, https://github.com/MrCooper846/dontdropthesoap/pull/11, stacked on PR #10. No merge or deployment. Next concrete work remains graceful drain and audited operator controls, followed by measured load/soak and final release validation.

### Stage 7 checkpoint — verified graceful singleton drain

- Active branch: codex/graceful-drain, based on restore review checkpoint 3e3d455. Added a shared admitted-work tracker across HTTP, primary socket auth/sync/commands, yard routes and ordered voice commands. New work is fenced once shutdown starts; existing operations finish. service.restarting now uses the actual /game-v1 namespace. Readiness returns a no-database 503 during drain, and later work receives a clear retryable service error.
- Moved singleton ownership from the application pool to a dedicated PostgreSQL Client. Stop/await main deadline/outbox tick, yard/block refresh, voice policy refresh, league scheduler and visual runtime. Wait for admitted requests before closing private preview workers; close authenticated polling/WebSocket transports gracefully, then the application pool and Next, then release the writer connection. This fixes early ownership release and late preview/refresh allocation races. Voice is invalidated/removed immediately; pending DB policy work is still awaited.
- Shutdown is idempotent and bounded by SHUTDOWN_GRACE_MS (default 30000, range 1000–60000). Normal completion exits 0; timeout/cleanup failure exits 1 using durable crash recovery, with structured counter/status logs. Local operational timing uses the existing monotonic coordinator clock; no hidden choices or request bodies enter drain logs.
- Added two concurrency-contract unit tests and npm run test:shutdown against fixed local soap_shutdown, production port 3114. Both WebSocket and polling scenarios block real match/owner rows while HTTP/socket moves and a private preview are admitted, send repeated SIGTERM, verify late admission denial and second-writer exclusion, release the locks, receive all accepted ACKs and the preview outcome, and restart with exactly two durable moves/receipts and one result. The preview allocates its real worker only after drain starts, proving correct pool-close ordering.
- A real native mediasoup transport test blocks owner_blocks policy refresh, checks voice closure while SQL is still blocked, confirms writer ownership waits, releases the lock and observes media-worker process exit. A deliberately unfinished HTTP body forces exit 1 at a two-second test grace; ownership releases via process teardown and the guest identity survives restart. Default 30-second grace is not confused with the injected test duration.
- Typecheck initially caught accidental use of protected Engine.IO clients; cleanup now uses authenticated sockets' public connection API. All physical shutdown scenarios pass. Verification: 76 unit/native tests, 20 PostgreSQL checks, physical isolated-database outage, six yard scenarios, eleven real-media browser scenarios (Chromium/Firefox/WebKit), six authenticated alpha cases and production build pass. Real media uses synthetic/fake devices; physical-device and human-playtest gates remain pending. Final typecheck, formatting and source review pass.
- Remaining independent release work: audited operator disable/revocation/report review and admission maintenance, measured nominal/2x load plus 60-minute soak and actual caps, retention/limits/privacy/release audit and final current-release reproducibility. Deployment backup custody/scheduling/off-host setup and actual devices/4–8 humans remain external dependencies. No release-candidate/deployment claim.

- Graceful drain implementation committed/pushed as 35c29cc on codex/graceful-drain. Review: draft PR #12, https://github.com/MrCooper846/dontdropthesoap/pull/12, stacked on restore/rollback PR #11. No merge or deployment. Next independent work: audited operator controls/revocation/report review and admission maintenance, then measured nominal/2x load and the required 60-minute soak.

### Stage 7 checkpoint — audited operator controls

- Branch codex/operator-controls, based on a7e0382. Added migration 011 with immutable operator audit rows, durable live-effect markers and explicit report review status. Actions support owner disable/enable, individual session/credential revocation, current voice removal and report review. Each authority change and audit record commit atomically under a stable command ID. No gameplay results or ledger writes occur.
- Added trusted host-side npm run operator apply/reports/audit, bounded stdin and cursor pages. SOAP_OPERATOR_ID is attributable metadata; host/private database access is the trust boundary. No public operator management route was added. Reports retain their original untrusted text. Audit SQL UPDATE/DELETE rejects, while privileged database administrators are outside that immutability guarantee.
- The singleton reconciles pending effects every 250 ms, closes matching sockets and clears only the revoked credential lease. Current authority is rechecked before delayed effects; a new credential is preserved, and voice removal fences only older media identities. Async delivery is awaited before the applied marker; failures retry. The producer drains before database/writer teardown.
- voice.remove is explicitly a one-time current-controller/media removal, allowing deliberate fresh authority/reentry. Owner disable blocks continuing account access. Enable does not restore revoked credentials. No unsupported persistent voice-only ban is claimed.
- Five real PostgreSQL operator tests pass: atomic/idempotent authority and audit, immutable audit rows, scoped credential/session enforcement, forced audit failure rollback, lossless report pagination/review and failed asynchronous delivery retry. All 25 integration tests, 76 unit/native checks, fresh/repeated eleven migrations, typecheck, formatting and production build pass.
- Three actual CLI/Chromium scenarios pass: synthetic RTP retained by a hostile receiver stops after voice removal; fresh reentry works; owner disable blocks HTTP/socket access and enable restores valid cookie access; real report submission/review preserves text; individual session revocation denies reentry; a connected bot is disconnected and its revoked credential cannot reconnect. Ordinary browser POST to an operator route returns 404 without creating an audit. These are automated local fixtures, not physical-device/human moderation validation.
- All physical shutdown regressions pass with the new delivery producer: blocked HTTP/socket/preview ACKs, WebSocket/polling drain, second-writer exclusion, native media closure behind a policy lock and forced unfinished-body timeout/restart.
- Stage 7 remains IN_PROGRESS. Next: admission maintenance that permits accepted games to finish, measured nominal/2x load and 60-minute soak, limits/retention/privacy/release audit and final current-release reproducibility. Real devices, 4–8 humans and deployment backup/hosting/network evidence remain pending. No merge or deployment.

- Operator implementation committed/pushed as 5284e16. Review: draft PR #13, https://github.com/MrCooper846/dontdropthesoap/pull/13, stacked on PR #12. No merge/deployment. Next independent work remains admission maintenance, then load/soak and final release gates.

### Stage 7 checkpoint — durable admission maintenance

- Active branch codex/admission-maintenance, based on operator review 2525d76. Migration 012 adds one durable service control and database guards for match creation, new non-system seats and waiting → countdown starts. Existing seat upserts, accepted countdowns (including system Clanker), rounds and settlement remain permitted.
- Extended audited operator actions with matches.pause/matches.resume targeting the fixed service UUID returned by operator status. Status reports admissions and active/waiting game counts privately. Current HTTP/command paths map the SQL guard to ADMISSIONS_PAUSED; public GET /api/v1/service exposes only matchesOpen. The yard polls that one-row flag every two seconds and displays maintenance without removing presence or chat.
- PostgreSQL SHARE/UPDATE locks serialize pause with admission commits in both directions. The league scheduler stops new attempts/waiting starts while continuing readiness bookkeeping and completed-batch finalization. A paused control survives startup and additive-schema binary rollback; readiness does not implicitly resume.
- Four real PostgreSQL maintenance checks pass: an already admitted three-human/Clanker game finishes with exactly three social ledger credits while new matches/seats/starts reject; pause waits for earlier admission; admission behind pause rejects; failed creation preserves its key and receipt state, and the same creation/start commands succeed once after resume. Race tests inspect actual blocking PostgreSQL PIDs instead of assuming elapsed time. League tests also prove queued fixtures await resume and settled batches finalize while paused.
- A real operator CLI/yard UI flow passes maintenance visibility, public status projection, rejected circle creation/no durable match, preserved avatar and successful creation after resume. Initial assertions were corrected to inspect the real SELECT FOR UPDATE blocker and the game's own error alert rather than Next's route announcer; no enforcement was weakened.
- Actual production current → verified prior 26d38b3 → current restore/rollback passes on both local fixture sources, with authenticated HTTP match creation rejected on every paused boot and unchanged match count. All 33 tables and schema match the exported backup before boot; pre-backup cookies, five social credits and six league credits survive. Temporary restored databases are cleaned up. The harness uses the real standalone match regression path (yard disabled) for authenticated admission probes; the separate yard browser test covers circle admission. Local synthetic fixtures do not prove deployment RTO/TLS.
- Final full yard suite passes all seven scenarios; all 29 PostgreSQL checks, 76 unit/native tests, fresh/repeated twelve migrations, typecheck and formatting pass. The first full yard run found the new fixture leaving an occupied waiting room for the next social test; cleanup now leaves through the normal UI and verifies the circle is free, and the entire rerun passes. Final production rebuild passes.
- Stage 7 remains IN_PROGRESS. Next independent work: measured nominal/2x load and a 60-minute soak, actual inflight/admission limits and retention/privacy/release audit. Physical devices and 4–8 humans plus authorised hosting/media/backup configuration remain external dependencies. No merge or deployment.

- Admission maintenance implementation committed/pushed as fafc24a. Review: draft PR #14, https://github.com/MrCooper846/dontdropthesoap/pull/14, stacked on PR #13. No merge/deployment. Next: instrument and measure nominal/2x load and actual limits, then complete the required 60-minute soak and remaining release audit.

### Stage 7 checkpoint — bounded admitted work and measurement foundation

- Active branch codex/load-readiness, based on maintenance review 03319bd. MAX_PENDING_WORK defaults to an initial 256 (configuration 32–4096). The shared tracker reserves capacity before callbacks run, preventing synchronous/reentrant admission bypass; overload rejects without executing work and settled tasks free slots.
- HTTP overload now returns SERVICE_UNAVAILABLE/503 with Retry-After: 1. Socket authentication preserves SERVICE_UNAVAILABLE instead of reporting overload as invalid identity. Liveness bypasses database/work admission, including drain; draining liveness connections close. Accepted transactions and graceful-drain ordering are unchanged.
- Added fixed-memory latency histograms, accepted-command/rejection/overload counts and ten-second service.metrics windows with native 10-ms event-loop-delay p95/max, RSS/heap/external memory, socket/pending counts and DB pool pressure. Normal drain flushes a final window after admitted work completes. Metrics contain aggregates only. Command-service duration excludes HTTP pre-authentication/RTT; bucket percentiles are conservative upper bounds. These are measurement tools, not nominal performance evidence.
- Added test:overload and isolated soap_load setup. Actual production port 3116 admits 32 incomplete HTTP bodies with an injected capacity 32, observes peak exactly 32/zero DB waiters, rejects excess HTTP and Socket.IO authentication with retryable service errors, keeps liveness available, releases capacity, authenticates the pre-existing guest and a new socket, then drains normally. Session secret is absent from captured logs. Both complete runs pass, including the final strengthened socket-recovery assertion.
- Meaningful unit checks cover reentrant admission, overload rejection before callback execution, release/reuse and bounded conservative percentile/reset behavior. All 78 unit/native checks, 29 real PostgreSQL tests, six authenticated browser cases (real Python/TypeScript clients, bot management, two-human UI, hostile HTTP and Clanker), physical WebSocket/polling/native-voice/forced-timeout shutdown regressions, typecheck, formatting and final production build pass.
- No schema/dependency changes. The initial admitted-work cap is not yet a measured public capacity choice. Incomplete headers, idle connection count, per-owner pending work, slow-body deadlines, background queues and the remaining observability/retention/privacy audit are separate release work.
- Stage 7 remains IN_PROGRESS. Next concrete work: real nominal 32-human/four-table mixed-bot workload, explicit 2x failure/headroom measurements, actual admission limits and the full 60-minute join/leave/reconnect soak. Do not label this short incomplete-body test as those gates. Physical-device FPS/audio/editor/gameplay, 4–8 humans and authorised deployment/media/backup evidence remain pending. No merge/deployment.

- Bounded-work/measurement implementation committed/pushed as db7438f. Review: draft PR #15, https://github.com/MrCooper846/dontdropthesoap/pull/15, stacked on PR #14. No merge/deployment. Next concrete stage-7 work remains the actual nominal/2x mixed-bot load harness and full soak, followed by remaining resource/retention/privacy/release gates.

### Stage 7 checkpoint — measured production yard/mixed-bot workloads

- Branch codex/measured-load, based on ee84b7f. Added npm run test:load against fixed local soap_load/production port 3117. It drives actual cookies/controllers, authoritative walks, four circles, simultaneous games, nearby chat, real native visual workers and separate TypeScript/Python processes. No app/server/schema/dependency change was needed for these profiles.
- Nominal: 32 human presences/four eight-seat tables; verified 26 human, three visual and three external seats. Input attempts every 50 ms (bounded to one pending per client), chat every 1.1 seconds and ten rounds per table. Four intentionally silent human round-three decisions exercise actual deadline filling. Persistence proves 320 moves/four expected timeouts, 160 results, 32 credits and 30 accepted native visual decisions. No unexpected rejection/timeout occurs.
- Doubled profile: --twice explicitly configures 64 presences and two identical copies of each measured durable command, retaining the actual four-table/32-seat limit and same six bots. Both copies ACK without changing persisted outcomes. This measures doubled presence/input/chat/command traffic, not eight tables or doubled native-bot computation. Public defaults remain 32 presences/four tables; no benchmark result auto-raises capacity.
- Added optional SOAP_METRICS=true numeric successful HTTP ACK timing in the real reference clients. Default output/behaviour is unchanged. No tokens, IDs or moves are logged by those metrics. Human socket timings include loopback round trip; external HTTP timings include request/response decode. Retained event-loop windows exclude setup/partial start and disconnected/draining samples.
- Final local samples on Node 24.18.0, WSL2/i7-11850H (16 logical CPUs): nominal 260 socket ACKs p95 136.77 ms, 30 external HTTP ACKs p95 77.92 ms, highest retained event-loop p95 10.73 ms, common-command histogram p95 upper bound 150 ms. Doubled: 520 socket ACKs p95 154.08 ms, 30 external HTTP ACKs p95 82.88 ms, event-loop p95 12.92 ms, common-command p95 upper bound about 205.49 ms. Both timing targets pass; all deliberately delayed rounds show reveal within 345 ms of deadline. Highest sampled RSS in retained windows is about 352/590 MiB; this is not stable-memory/soak evidence.
- Evidence quality corrections: the initial five-round diagnostic used the wrong visual publication property and admitted humans instead. A database seat-kind audit invalidated it; its original ignored report is preserved inside an INVALIDATED wrapper. The driver now asserts exact typed seats and native decision records before accepting a run. External metric-stream setup also exposed a missing stdout pipe/unregistered-child cleanup path; both language streams are piped, children register before stream setup, the verified owned stray was stopped, and both final profiles pass. No gate or implementation was weakened.
- Private ignored data/load-runs contains aggregate reports; owning docs give reproducible commands, workload limits and hardware/context. Typecheck, Python compilation, formatting and final production build pass. Both complete final profiles run actual native and external paths. The required 60-minute join/leave/reconnect soak, physical-device FPS/media/editor/gameplay, 4–8 humans and deployment evidence remain pending.
- Stage 7 remains IN_PROGRESS. Next: remaining per-owner/connection/body limits and observability/retention/privacy audit, then the full sustained reconnect soak and final release packaging/validation. No merge or deployment; no release-candidate claim.

- Measured-load implementation committed/pushed as c9a043a. Review: draft PR #16, https://github.com/MrCooper846/dontdropthesoap/pull/16, stacked on PR #15. No merge/deployment. Continue remaining resource/privacy controls and the complete sustained reconnect soak before final release-candidate audit.

### Stage 7 checkpoint — owner isolation and production media acceptance

- Branch codex/resource-isolation, based on measured-load review 22ea01a. Added canonical-owner pending-work budgets shared by browser sessions and external credentials, plus a separate persistent namespace connection budget. Reservations release on settled work or namespace/transport closure. Late async contexts cannot resurrect released owner counts. Defaults are eight pending operations and eight namespace connections per owner; global work remains 256.
- Added absolute HTTP receive/first-header deadlines and real-peer/global TCP ceilings. Defaults: 30-second request receive, at most ten seconds for first headers, 256 connections per real peer and 1024 globally. Forwarded headers cannot substitute the peer address. Aborted body readers free capacity without writing a second response. New raw TCP connections can reset at capacity, including health probes; admitted liveness still bypasses work/DB quotas. Proxy upstream sharing requires deployment validation.
- Physical test:resources uses production port 3118 and only fixed local soap_load, without truncating it. Injected owner budgets of two prove shared browser/bot denial, other-owner availability, distinct namespace slots and release/recovery. Actual dripping bodies receive 408 despite continuing bytes. Two loopback sources fill eight global/four-per-source TCP slots, reject excess/faked forwarding, expire incomplete headers and accept replacements. No fixture cookie/token is logged.
- Namespace errors retain stable codes with readable/retryable data. The yard displays actionable capacity feedback and retries at bounded one-to-five-second intervals. Real browser coverage fills the default eight owner connections, observes the second page's message, closes an older connection, and verifies automatic recovery and cleared feedback. Secure/HttpOnly/SameSite cookie flags are checked without exposing the secret.
- Voice authority freshness now uses monotonic elapsed time, retaining the strict 600-ms limit and anchoring renewal to query start. A slow result cannot renew an already stale policy snapshot. Fixed aggregate policy-refresh timing and identity-free peer-closure diagnostics support investigation. Native media permissions/range/block/spectator rules were not relaxed.
- Development acceptance exposed correct fail-closed removal at 671–672 ms during compiler/event-loop stalls. The voice acceptance fixture now builds/runs the real production backend/SFU behind ephemeral loopback HTTPS/WSS. Its trusted probe is separately compiled and served only by the fixture; the production lab route stays unavailable. Browser certificate errors are ignored only in this local test context; Node clients trust the generated fixture certificate. Restricted temporary keys are removed on teardown/creator exit. This proves local TLS/Secure-cookie/media paths, not public certificates, NAT/TURN, physical hardware or a human playtest.
- The completed 15-case voice run left a passed Playwright result with no failed tests and no live fixture process; its expired observation handle was revalidated rather than restarting it. Final regression: 82 unit/native tests, 29 real PostgreSQL tests, all six authenticated browser cases, typecheck, formatting and the current production build pass. The physical resource fixture was rerun after that final build and both phases pass. An older recovery fixture initially failed because a fixed 900-ms sleep did not establish pre-threshold inspection on a busy host. It now proves the real blocking PostgreSQL PID, verifies the gap is still below the decision duration, then observes database time cross it before unlocking. The deferred recovery rejection and subsequent abort remain required; production enforcement was unchanged.
- Physical graceful drain and overload regressions and both actual mixed-bot workload profiles also passed with these controls. Latest local nominal human/external ACK p95: 181.19/42.75 ms; doubled presence/duplicate-command profile: 169.42/93.54 ms. Expected four deadline fills and unchanged 320 moves/160 results/32 credits were verified. Short local samples do not establish sustained memory stability or public capacity.
- Stage 7 remains IN_PROGRESS. Next independent requirements: waiting-room expiry, stale ephemeral state/background queue bounds, retention/privacy/CSP and remaining observability audit, complete 60-minute reconnect soak, then final fresh-release/restore/rollback reproducibility. Physical mobile/FPS/editor/audio, 4–8 humans and authorised public hosting/media/off-host backup/key custody remain external gates. No merge, deployment or release-candidate claim.

- Owner-resource/media implementation committed/pushed as e91434f. Review: draft PR #17, https://github.com/MrCooper846/dontdropthesoap/pull/17, stacked on PR #16. No merge/deployment. Continue waiting-room expiry and the resource/retention/privacy audit before the sustained reconnect soak and final release audit.

### Stage 7 checkpoint — durable deserted waiting-room expiry

- Branch codex/waiting-room-expiry, based on resource review 209d889. Migration 013 adds a durable absence timestamp, indexed waiting-room scan and phase-change reset trigger. Non-league pregame rooms cancel after fifteen minutes with no seated owner's browser connection and no seated external bot's live controller lease. An owner elsewhere in the yard still counts; visual bots need their human owner present. Connected rooms and league queues are retained.
- The singleton scans at most 100 UUID-ordered candidates per five-second pass, advances its cursor and rechecks state/presence under each match lock. A returning participant clears absence; a subsequent absence starts fresh. Startup's normal waiting-room recovery preserves the timestamp. Moving out of waiting clears it even under an additive-schema older binary. Countdown/active games cannot expire through this path.
- Cancellation retains seats/history, clears readiness, frees circle/active-seat capacity, publishes one match.waiting-expired snapshot and awards no points. Public cancelReason empty drives an explanation on the yard and standalone panels. Added an aggregate waiting.expired counter without identities.
- Five real PostgreSQL checks cover 14-minute retention/16-minute expiry, one event/no settlement, participant return/reset, league/countdown/collecting exemption, actual blocked start/inspection race, startup recovery and 101-room bounded-page fairness. The startup assertion initially compared to the pre-recovery version; normal recovery correctly increments it, so expiry is now asserted to increment exactly once from the actual recovered version. No production behavior or gate was weakened.
- All 34 PostgreSQL checks, 82 unit/native tests, fresh/repeated thirteen migrations, typecheck, formatting and the final production build pass. Physical WebSocket/polling/native-media/unfinished-body shutdown and restart checks also pass with the new ordered sweep. The actual browser closes its participant context, waits for a naturally recorded absence, ages only the isolated persisted fixture timestamp, observes actual singleton cancellation/circle release, returns with the same cookie and sees the stored explanation. It also proves an online owner clears an injected old absence. This accelerates fixture age, not the fixed production fifteen-minute duration. The targeted flow and full eight-case yard regression pass, including circle capacity/challenges, bot-owner/spectator visibility, social text/block/report and mobile viewport controls.
- Remaining independent stage-7 work: stale ephemeral state/background queue bounds, retention/privacy/CSP and remaining observability, the complete 60-minute reconnect soak and final fresh-release/restore/rollback evidence. Actual mobile/FPS/editor/audio, 4–8 humans and authorised public hosting/media/off-host backups/secret custody remain external gates. No merge/deployment or release-candidate claim.

- Deserted-room expiry committed/pushed as 5538d4c. Review: draft PR #18, https://github.com/MrCooper846/dontdropthesoap/pull/18, stacked on PR #17. Stage 7 remains IN_PROGRESS. Next concrete work: stale ephemeral lease/queue audit and retention/privacy/CSP, followed by sustained reconnect soak and final release checks. No merge/deployment.

### Stage 7 checkpoint — bounded ephemeral state and reliable output

- Branch codex/ephemeral-bounds, based on waiting-room review 7b1db2e. Added a monotonic, hard-cap TTL map with lazy and independent one-second pruning. Stores cap HTTP rate keys at 10000/one second, chat buckets at 4096/three seconds, invitation windows at 4096/60 seconds and external controller leases at 4096/15 seconds. New identities reject when all slots are live; existing live limits are never evicted. The nearby 256-message text buffer also expires during idle periods using monotonic retention time.
- Expired bot controllers now require explicit reacquisition instead of reviving an expired entry with heartbeat. Durable epochs advance on acquire and fence old requests. Both reference clients already recover from CONTROLLER_STALE/BOT_OFFLINE. This closes the stale-map/late-heartbeat behavior and is documented in protocol/operations; the real fifteen-second contract is unchanged.
- Reliable outbound Engine.IO queues use public packetCreate/flush/close events, with initial limits of 128 packets/1 MiB per peer and 16 MiB aggregate. Pressure closes the offending peer or the largest queued peer; flush/close releases accounting. No private write-buffer access, payload logging or unbounded registry was added. The counter records only aggregate backpressure. A flushed transport batch/OS buffer is outside this queue accounting and remains under the transport lifecycle; no total-RSS guarantee is claimed.
- Yard position snapshots are volatile. The browser movement audit also found acknowledgement callbacks without a deadline: input now requires a connected socket, is volatile and expires its acknowledgement after one second, preventing offline/stale frame/callback accumulation. Durable commands retain their receipt/retry behavior. Existing state.sync already drops previous match rooms; no redundant subscription system was introduced.
- Verification so far: 87 unit/native/real-transport checks and 35 PostgreSQL checks pass. Actual polling nonreaders exercise queued byte/count/global limits, flush release, replacement capacity and a healthy WebSocket acknowledgement. A real 15.1-second wait proves expiry, late-heartbeat denial, fresh acquire and old-epoch fencing. Full eight-case yard and fifteen-case production HTTPS/native RTP suites pass for the backend changes. The final movement-only follow-up also passes a second complete eight-case yard run, typecheck, formatting and exact-source production rebuild.
- Physical WebSocket/polling/native-media/unfinished-body shutdown checks and both actual mixed-bot load profiles pass. Latest local nominal human/external ACK p95 141.36/33.30 ms, event-loop p95 10.80 ms; doubled presence/duplicate traffic 173.29/113.92 ms, highest event-loop p95 14.28 ms. Both have zero backpressure disconnections, exactly 320 moves/four deliberate timeouts/160 results/32 credits, with reveal observed within 182 ms of deliberate deadline. These short samples are not the required sustained soak or media-capacity evidence. The physical league recovery fixture also passes hidden visual move preservation, repeated SIGKILL abort/retry with a real external controller, all six mixed-bot fixtures and a post-settlement restart with exactly six league credits/no casual credit.
- Stage 7 remains IN_PROGRESS. Further audit identified remaining full block-graph/history reads to bound and persistent copies to expire (normalized rounds, checkpoints, events and visual feedback). Concrete follow-ups include the global block-cache read and own-block list, completed-batch offline-entry scans, and the standalone path currently counting only circle matches toward capacity; fixes must preserve fail-closed routing and use valid bounded fixtures. Fatal/startup logging, CSP and complete rejection/outbox-age monitoring also remain in the privacy/observability audit. Next independent work: those bounds, retention jobs with explicit expired-replay UI, privacy/CSP/log checks, then the complete sixty-minute reconnect soak and fresh release/restore/rollback audit. Physical mobile/FPS/audio/editor, 4–8 humans and authorised public hosting/media/off-host backups/secret custody remain external gates. No merge, deployment or release-candidate claim.

- Ephemeral/queue controls committed/pushed as 4920d98. Review: draft PR #19, https://github.com/MrCooper846/dontdropthesoap/pull/19, stacked on PR #18. Stage 7 remains IN_PROGRESS. Resume the bounded-read/global-admission and persistent retention/privacy audit, then sustained soak and final release evidence. No merge/deployment.

### Stage 7 checkpoint — persistent live-data retention

- Branch codex/persistent-retention, based on bounded-state review f42ca0b. Migration 014 adds terminal/history-expiry timestamps and indexed cleanup candidates. Terminal age uses the database clock, with first attributable terminal events for existing records and a fresh grace period if their terminal time is unknown. Active matches never expire solely because they were created long ago.
- After ninety terminal days, one transaction clears normalized choices/pairings/rounds/results, private visual traces/runtime, historical event payloads and checkpoint move/result/pair/RNG/Clanker state. Identity, frozen rules, final seat-score/aggregate summaries, owners/bot definitions, casual ledger and immutable league attempts/settlements remain. A stale checkpoint cannot recreate expired history. No bot or settlement is rerun.
- Metadata ages are seven days for receipts; expiry plus seven days for keys, sessions, expired/revoked credentials and invitations; thirty days for reports in every review state. Original report text is not copied into review audit responses. Operator metadata/reasons and owner/bot deletion remain separate policies; deployment filesystem/off-host backups are outside this job.
- Cleanup uses 100-row metadata pages and one terminal match per transaction, skips locked rows and retains database statement/lock timeouts. The producer yields and checks a 250-ms budget between transactions; a SQL transaction can exceed that inter-batch budget. Backlog/failures retry after one second, idle checks after one minute. Graceful drain awaits already admitted cleanup, prevents later batches and retains singleton ownership.
- A payload-free, sequence-advancing match.history-expired outbox notification refreshes open panels; the notification itself expires after seven days. Snapshot/results/replay historyExpired flags and cursor resets distinguish an archived summary from a never-played game. Scores and league standings remain visible.
- Verification: the final full 41-case PostgreSQL suite passes, including six retention cases and the real pool-pressure drain check. Tests cover cutoff windows, expired creation retry after receipt/key deletion, rollback of all metadata/history on injected checkpoint failure, bounded/locked pages, background execution, active/recent-terminal preservation and hidden aborted-move removal. The existing real native visual game and complete six-fixture league checks now also verify all private/history copies disappear while feedback is empty and both ledgers/standings are unchanged. A rerun exposed a legacy fixture assuming the whole attempt table was empty; pause now asserts zero attempts for its own batch and unchanged global attempt count, preserving and strengthening the actual invariant.
- The first populated-database upgrade failed because backfill queued deferred trigger events before CREATE INDEX. Migration DDL now precedes the backfill, preserving all guards and transaction atomicity; the real populated upgrade and fresh/repeated fourteen migrations pass. No skipped check or disabled constraint is claimed as a pass.
- Full eight-case yard suite passes, including an actual completed two-human game, aged isolated terminal timestamp, normal minute-scheduled cleanup, live outbox-driven expiry explanations for both players and unchanged score credits. Only fixture age is accelerated; production ninety-day retention and minute scheduling are unchanged. Both public mixed-bot league/browser scenarios pass, with real Python/TypeScript clients, expired replay and unchanged standings. Screenshot review prompted replacing the ambiguous archived 0/20 label with an explicit expiry label; the final full league rerun passes. All 87 unit/native/transport checks, typecheck, formatting, exact-source build and physical WebSocket/polling/native-media/unfinished-body shutdown checks also pass.
- Strict encrypted restore/current → actual prior 26d38b3 → current passes on both local fixture sources with all 33 tables/schema constraints, pre-backup cookies, unchanged five casual/six league credits and paused admission across binary changes. The initial reused temporary prior artifact lacked its Next prerender manifest and correctly failed boot; a fresh Git-archived prior package passes clean install/build/production-only install and the entire drill. Shared preflight now checks required Next manifests/build ID and compiled worker before preparing/using a package. Owned restored databases are removed. Local fixture timings are not deployment RTO or public TLS evidence.
- Stage 7 remains IN_PROGRESS. Next independent work remains bounded global block/history/credential metadata reads and standalone admission, privacy/CSP/fatal-log/remaining metrics checks, the full sixty-minute reconnect soak and final fresh release/restore/rollback evidence. Physical mobile/FPS/editor/audio, 4–8 humans and authorised hosting/media/off-host backup setup/seven-day expiry/secret custody remain external gates. No merge/deployment or release-candidate claim.

- Persistent retention committed/pushed as 186d35e. Review: draft PR #20, https://github.com/MrCooper846/dontdropthesoap/pull/20, stacked on PR #19. Stage 7 remains IN_PROGRESS. Resume bounded block/credential/historical reads and standalone admission, then privacy/CSP/remaining monitoring, the sustained soak and final release validation. No merge/deployment.

### Stage 7 checkpoint — bounded metadata reads and global social admission

- Branch codex/bounded-reads, based on c677182. Credential metadata uses 100-record expiry/UUID keyset pages, lossless microsecond cursors and owner-first authorization. The management screen replaces its current page and fences stale responses; credentials, hashes and scopes never appear in history.
- Outgoing block history uses 100-record UUID pages. Current-yard controls query only current presences and original-recipient senders in the bounded thirty-second chat buffer. Routing caches only current-member edges, denies unknown membership, invalidates after block changes and recovers through periodic refresh. Recent replay separately checks bounded sender relationships so legitimate departed messages remain available while later bidirectional blocks suppress them. Closed league batches no longer participate in offline readiness scans, and yard voice policy excludes standalone matches.
- All unfinished non-league tables now share the configured cap, including standalone creation and accepted direct challenges, under the existing shared admission lock. Capacity rejection preserves the creation key and permits a later idempotent retry. Integration teardown closes only unfinished synthetic local soap_test fixtures through normal engine transitions, preserving completed ledger evidence; browser setup guards and resets only its named local fixture database. No production admission bypass or increased cap was added.
- Migration 015 adds credential-page, reverse-block and active-social indexes. An initial populated upgrade exposed queued deferred events from migration 014 before the next index DDL. Migration 015 validates queued constraints before its DDL and restores deferred mode; constraints remain enforced. The real populated upgrade plus fresh/repeated fifteen-migration checks pass.
- The initial full pipeline passes seven alpha browser cases, nine yard cases, fifteen production HTTPS/native-media cases across Chromium/Firefox/WebKit, physical shutdown, both short workload profiles and both full league/browser cases. Nominal human/external command ACK p95 is 141.69/41.81 ms; doubled-presence/command traffic is 179.69/66.64 ms. Both persist exactly 320 moves, four deliberate timeouts, 160 results and 32 credits. These are short local WSL samples, not media capacity, device FPS, public network or sixty-minute soak evidence.
- Follow-up review found scoped block controls could drop a departed sender while their pre-block message remained buffered. A new real-browser/authenticated-socket test reproduces the missing block metadata. The fix includes only original-recipient recent chat senders in the scoped read, without expanding the live routing graph or loading offline historical blocks. The final full nine-case yard rerun passes, including departure/return and paginated block controls; all 89 unit/native tests, 44 PostgreSQL tests, typecheck, formatting and production build pass. Documentation local links resolve.
- Stage 7 remains IN_PROGRESS. Continue privacy/CSP/fatal-log and remaining monitoring checks, the full sixty-minute join/leave/reconnect soak, and final clean release/restore/rollback validation. Actual mobile/FPS/editor/audio, 4–8 humans, public-network media and authorized hosting/off-host backups/seven-day expiry/secret custody remain external gates. No merge, deployment or release-candidate claim.


- Final strict encrypted restore/current → actual prior 26d38b3 → current passes on both local fixture sources after all fifteen migrations. All 33 tables and constraints match; original sessions, five casual/six league credits and paused admissions survive. Owned restored databases are removed; local restore times are approximately 1.1 seconds and ready times 2.6 seconds. This is not public TLS, deployment RTO or off-host backup evidence.
- Retained load windows report event-loop p95 at most 10.92 ms nominal and 13.50 ms doubled traffic, with zero recorded command rejections/backpressure and no database waiters. The doubled profile retains four tables/32 seats and the same six bots while doubling human presences and command copies; it does not assert eight-table or doubled bot-compute capacity.

- Bounded reads/global admission committed and pushed as 414c1e6. Review: draft PR #21, https://github.com/MrCooper846/dontdropthesoap/pull/21, stacked on PR #20. Working source is verified as above. Next concrete independent work: restrictive CSP with real production yard/editor/media acceptance, fatal/startup log redaction and remaining rejection/outbox-age/timeout monitoring; then the complete sixty-minute reconnect soak and final fresh-release reproducibility. Stage 7 remains IN_PROGRESS. No merge/deployment.

### Stage 7 checkpoint — production content policy and diagnostic privacy

- Branch codex/content-security, based on 8dd8c28. The server now replaces inbound policy/nonce headers and generates per-request cryptographic script nonces. Production uses strict-dynamic with no unsafe-eval or script unsafe-inline; development alone permits framework eval. Dynamic root rendering supplies Next's framework/hydration nonces and disables shared HTML caching. Inline styles remain allowed for the actual Blockly/Phaser layout; this does not grant script permission.
- Policy restricts network connections to the page origin and its explicit WebSocket origin, with bounded local/data/blob allowances for images, media, fonts and workers. Objects, framing, base changes and foreign form actions are denied; microphone is same-origin only, camera/geolocation disabled and referrers suppressed.
- Production editor acceptance initially exposed eight failed remote media fetches per editor instance. The pinned Blockly 13.4.0 media is now served from public/blockly with its license; both real editor flows pass without expanding external network permission. A wrong heading locator and an aggregate fixture guest burst were corrected without changing the public guest limit. The first hostile-eval attempt ran in the debugger's exempt context; the final test runs in a normal document timer task, checks inline event-handler injection and preserves strict-dynamic's intended transitive trust.
- server.ts installs fixed startup/fatal sinks before importing config/framework/database via server/main.ts. Actual configuration/database/import failures, uncaught exceptions, unhandled rejections and migration CLI failures pass sentinel-redaction checks. A typed writer conflict preserves a fixed WRITER_ALREADY_RUNNING diagnostic; shutdown/recovery assert that exact structured result alongside real writer exclusion. No arbitrary exception or environment URL is printed by the new boundary.
- Follow-up HTTP regression reproduced multiline error/name/frame leakage despite first-line removal. The API infrastructure log now emits only fixed event/code; the actual HTTP response/log regression passes. Full 90-case unit/native suite, typecheck, formatting and fresh/repeated fifteen migrations pass. Fifteen production native-media/browser cases pass. Physical WebSocket/polling/native-voice/unfinished-body drain and actual hidden human/external crash/restart recovery pass with the refactored bootstrap.
- Final-source production build and all four HTTPS security/editor cases pass; desktop/touch screenshots show the real local-media controls. All 44 PostgreSQL regressions pass. Strict encrypted restore/current → actual prior 26d38b3 → current passes on both fixture sources with 33 tables/constraints, pre-backup sessions, unchanged five casual/six league credits, paused admissions and owned-database cleanup. Restore takes about 1.1 seconds and readiness 2.6–2.8 seconds locally; this does not establish public TLS, deployment RTO or off-host backup setup. Documentation links resolve and all sixteen vendored assets match the pinned dependency. Record review commit below. Stage 7 remains IN_PROGRESS. Remaining independent work includes rejection/outbox-age/timeout monitoring, the complete sixty-minute join/leave/reconnect soak and final clean release reproducibility. Actual mobile/FPS/editor/audio, 4–8 humans, public-network media and authorized hosting/off-host backups/seven-day expiry/secret custody remain external gates. No merge/deployment or release-candidate claim.

- Content policy/privacy committed and pushed as 563fcfd. Review: draft PR #22, https://github.com/MrCooper846/dontdropthesoap/pull/22, stacked on PR #21. Stage 7 remains IN_PROGRESS. Next independent work: complete HTTP/socket rejection, outbox-age, timeout/worker/reconnect/voice-failure aggregate monitoring, then the actual sixty-minute reconnect soak and final current clean-package reproducibility. Preserve real-device/human/public-media/hosting/backup gates. No merge/deployment.

### Stage 7 checkpoint — aggregate release monitoring

- Branch codex/release-metrics, based on c9d37fa. Fixed bounded counters cover v1 HTTP failures (including unsuccessful command ACKs), game/state/yard/voice socket rejection, namespace authentication and connection lifecycles, retained-presence reconnects, unexpected worker/watchdog loss, voice policy query failures/stale transitions, publisher/tick/sampling outcomes and confirmed inserted decisions/timeouts. No historical identity map or private payload labels are introduced.
- Decision counters accumulate in a transaction-scoped WeakMap keyed by the actual database client and emit only after COMMIT returns. Rollback discards counts, and INSERT ON CONFLICT retries contribute nothing. A real PostgreSQL regression proves rollback leaves zero rows/counts and a retry plus repeated saves emits exactly two decisions/one timeout. These process-local diagnostic totals do not replace durable ledgers and can be lost on crash/unknown commit outcome.
- A five-second serialized sampler reads active match/roster totals and the oldest unpublished event through its existing partial index, without event payloads. It exports sample freshness/availability, starts unknown values at -1 and retains last-known values during failure. Known outbox age advances conservatively by monotonic time rather than freezing. The publisher no longer loads unused stored event payloads and counts successful unpublished-to-published transitions.
- All 90 unit/native checks and all 45 PostgreSQL regressions pass, including native watchdog metrics, duplicate-save/rollback semantics, aged outbox/active roster and sampling failure without false fresh zero. Typecheck, formatting and production build pass. The actual owner-isolation/TCP resource fixture verifies nonzero HTTP/socket/auth/lifecycle counters while preserving admission/receive bounds.
- The nominal production mixed-bot workload passes with 137.997 ms human/76.326 ms external ACK p95, unchanged 320 moves/four timeouts/160 results/32 credits, emitted move/timeout counts exactly matching SQL and actual retained-presence reconnect/gauge evidence. Doubled traffic passes at 168.290 ms human/63.465 ms external ACK p95 with the same SQL/metric/reconnect evidence. Highest retained event-loop p95 is 10.871 ms nominal and 14.090 ms doubled traffic, with zero retained-window HTTP/game request rejections. The doubled profile still uses four tables/32 seats and the same six bots, not doubled bot compute. All four production HTTPS editor/CSP cases, all fifteen Chromium/Firefox/WebKit native-media cases and physical WebSocket/polling/native-voice/unfinished-body drain checks pass. A final transport-boundary audit adds a separate forbidden-origin/stopping handshake counter without changing the guard; the full real resource fixture rerun passes, including forbidden-origin transport rejection and all boundary counters. Final typecheck/formatting pass; documentation local links resolve.
- Stage 7 remains IN_PROGRESS. Next independent work is the complete sixty-minute join/leave/reconnect soak followed by final current clean-package reproducibility and the requirement-by-requirement release audit. Real mobile/FPS/editor/audio, 4–8 humans, public-network media and authorized hosting/off-host backups/seven-day expiry/secret custody remain external gates. Metrics collection/hosted alerts still require the eventual deployment environment. No merge/deployment or release-candidate claim.

- Aggregate diagnostics committed/pushed as 20cd3a4. Review: draft PR #23, https://github.com/MrCooper846/dontdropthesoap/pull/23, stacked on PR #22. Stage 7 remains IN_PROGRESS. Next concrete work: add and execute the actual sixty-minute production join/leave/reconnect soak with fixed workload, predeclared memory criteria and bounded evidence collection; retain short-workload and soak claims separately. Then verify a fresh current committed production-only package and perform the full requirement audit. Real-device/human/public-media/hosting/off-host backup/secret custody and hosted alert setup remain external gates. No merge/deployment.

### Stage 7 checkpoint — sustained soak preparation

- Branch codex/sustained-soak, based on 38fa653. The production workload harness now has separate full-hour and sixty-second smoke modes. After the real mixed-bot batch it keeps 32 presences moving/chatting while cycling reconnects, explicit exits/reentry and replacement guests. External processes remain alive; owned bot identities are preserved. This sustained phase is presence/social churn after completed games, not an hour of active league/media/device testing.
- Full criteria are predeclared in tests/runtime/soak.ts and docs/testing.md: 3,600,000 actual elapsed milliseconds; readiness/operation/sampling continuity; minimum churn and successful input/chat cadence; ten-minute memory warm-up, ten five-minute windows with minimum sample coverage, twentieth-percentile heap/RSS floors, fixed growth/slope/absolute ceilings and no forced GC. A sixty-second smoke can never report the hour or memory gate as passed.
- The test parent stores at most 1,000 parsed aggregate windows and fails if evidence truncates. The existing bounded raw log is no longer reparsed as though it represented all earlier windows, preserving exact initial move/timeout totals through a long run. This does not alter production retention or admission.
- Typecheck passes after explicitly typing the generic churn-loop variables. The first smoke found a synthetic-client protocol bug: reentry must reset movement sequence, otherwise the real server correctly rejects a jump beyond its 1,000-input budget. The client now resets sequence; the server guard remains unchanged. Four assessment checks pass against stable GC noise, real rising-floor patterns, missing windows and excessive peaks; these synthetic checks are not sustained-memory evidence. A second attempt failed in the initial real mixed-bot workload before the sustained phase. SQL event timing confirms a genuine 1,221.47-ms deadline resolution delay, exceeding the existing one-second bound. No tolerance was relaxed. Keep production source/build/test processes quiescent while the acceptance workload runs. Stage 7 remains IN_PROGRESS; final clean-package/release audit and real-device/human/public-media/hosting/backup/alerting gates remain.


- Investigation found the deadline/coordinator tick awaited up to 100 outbox fanouts before it could tick again. Outbox delivery now has an independent single producer with bounded metadata pages and a fifty-millisecond cooperative inter-event budget; authorization/projection/recipient restrictions remain. Shutdown awaits both producers. Publisher failures have a separate fixed aggregate counter. Failure artifacts preserve bounded metric/timing/source evidence in ignored private reports.
- A new physical PostgreSQL regression holds an actual pending event-row lock, proves both timeout decisions commit while delivery is still blocked, signals shutdown and proves the writer remains held until the publisher finishes. That regression and the full WebSocket/polling/native-voice/unfinished-request drain suite pass. The corrected real mixed-bot plus smoke run is active; the full hour has not started. Keep that gate pending.


- The corrected real smoke passes: 60,109 ms of sustained activity, 28 churn cycles (10 retained reconnects, 11 explicit reentries, seven replacement guests), 38,343 accepted movement inputs and 1,728 chats. It reports memory NOT_RUN_SMOKE and soak60Minutes NOT_RUN. Its preceding mixed-bot batch retains 320 moves/four timeouts/160 results/32 credits and resolves deliberate deadlines within 224 ms; human/external ACK p95 is 167.33/57.02 ms. Source is explicitly dirty test work, not a claimed committed release.
- Minute-atomic private progress snapshots now preserve source/build/criteria/metric evidence for long runs; bounded failure reports preserve rejected runs as well. Full-hour criteria are unchanged. Final source/regression checks precede a committed, attributable hour run.

- Final preparation checks pass: all 94 unit/native checks, all 45 PostgreSQL checks, production build, all four production HTTPS security/editor cases, all fifteen Chromium/Firefox/WebKit native-media cases and actual hidden human/external crash recovery. A development recovery run correctly removed the shared Next production BUILD_ID, so the later load preflight refused; production is rebuilt after development recovery rather than treating that refusal as a pass.
- The isolated physical database-outage check passes with hidden moves preserved and no timeout scoring during infrastructure interruption. The complete physical league crash/retry/reconnect/post-settlement restart check passes with exactly six league credits and no casual credit. Production rebuild and the final doubled-traffic check are active. No hour/memory pass is claimed.

- Final production rebuild and doubled-traffic acceptance pass: human/external ACK p95 157.48/69.97 ms; deliberate deadline-to-observed-reveal delays 105–108 ms; unchanged 320 moves/four timeouts/160 results/32 credits; exact committed metric totals, real reconnect and active-roster gauges. The profile retains four tables/32 seats and six bots while doubling presence/command traffic.
- The full-hour implementation and immutable criteria are ready to commit before execution. Reports identify source revision/dirty status/build ID/Node version and exact soak UTC/uptime alignment. Successful movement cadence requires accepted intents, not merely successful transport ACKs. The full hour is still pending until the actual command exits successfully with complete evidence.

- Scheduler fix/full-hour harness committed and pushed as 244e8094098fefea4b98a2230e2f45fd5b70d15a. Review: draft PR #24, https://github.com/MrCooper846/dontdropthesoap/pull/24, stacked on PR #23. All preparation evidence above is retained; no merge/deployment.
- Actual npm run test:soak is live in local exec session 34106 (Node workload PID 117977 at launch). Its timed phase starts 2026-10-15T04:15:03.621Z, after the initial real mixed-bot batch. The first atomic progress artifact confirms FULL_HOUR, clean source 244e809, Node 24.18.0 and build P_6s4HuAp0funbPY5R9i9. Local ignored artifact: data/load-runs/1792037638654-c746b5cf-14a3-4c04-a6be-21a8d1273205.soak-progress.json. This is running evidence, not a pass.
- Resume by polling that exact exec handle and checking the actual process if needed. An observation timeout or stale progress file is not proof of termination; do not restart without authoritative terminal/missing-handle evidence. Keep runtime source, workers and the shared production build unchanged, and avoid concurrent build/browser/load/fault jobs during the nominal hour. Documentation-only continuation notes may change. The full command must exit successfully and its final metrics/memory checks pass before recording the hour gate as verified.

### Read-only release audit during the live soak

- Exec session 34106 and workload PID 117977 remain live. At 301 elapsed seconds the timed phase has 140 cycles, 192,681 accepted movement inputs and 8,764 chats; 31 recorded phase samples remain ready/current with event-loop p95 at most 11.076 ms and zero tracked request/auth/backpressure/tick/outbox/sampler/worker failures. Warm-up/memory and full-hour gates remain pending.
- Concrete remaining isolation defect: app/api/leaderboard/route.ts calls the legacy SQLite getGlobalLeaderboard without a legacy/development guard; lib/leaderboard.ts has no such guard, and the custom server forwards non-v1 routes to Next. The built route therefore remains available through the new server despite legacy handler isolation elsewhere. Do not exercise it on the benchmark process (that would load additional storage/runtime state). After the soak, deny the old route through the new server, restrict the legacy route to the explicitly local development demo, redact its raw-error sink and verify new-server denial plus legacy-demo preservation. Runtime source is frozen during the current acceptance run.
- Clean-package gap remains: prepare-rollback.ts intentionally prepares an ancestor rather than HEAD; final current-candidate verification must archive the intended committed source independently, perform clean install/build/production-only install and run production-smoke. production-smoke currently reuses a fixed local fixture database if present, so verify an actually fresh isolated database as well as the existing migration tests. This work waits until the soak ends to avoid competing CPU/database load.
- The operations contract also specifies safe request/command correlation logs. Existing fixed diagnostics/aggregate metrics do not by themselves prove all requested identifier/event/latency fields; audit that boundary before claiming operational implementation complete. Actual devices/FPS/audio/editor/background interruption, 4–8 humans, public-network media, hosting authority/off-host backup expiry/key custody and hosted alerts remain external validation/setup gates.

- At 601 elapsed seconds the same live run completes its ten-minute warm-up: 279 churn cycles, 93 retained reconnects, 110 explicit reentries, 76 replacement guests and 384,050 accepted movement intents. The remaining fifty minutes provide the actual memory assessment windows. Runtime/worker/build files still match 244e809; every tracked change since that source commit is documentation-only.
- Added docs/playtest.md as the concrete procedure/result form for physical iOS/Android, desktop audio/interruption, selected low-end-device FPS and 4–8-human acceptance. It is linked from the technical index/testing plan and explicitly records unavailable/unrun cases as NOT_TESTED. This is a procedure, not fabricated device or human evidence.
- The legacy-route audit also found the old-page redirect tests the raw req.url: a query suffix such as /create?x can bypass its end-of-path pattern. Normalize/check pathname when closing the legacy API/UI isolation gap after the soak, and cover query variants. No benchmark-runtime change has been made.

- The same live exec session 34106 reaches 901 elapsed seconds: 418 churn cycles, 575,259 accepted movement intents and 26,193 chats, with zero tracked failures, all samples ready/current and maximum phase event-loop p95 11.084 ms. The first complete post-warm-up memory window has 30 samples, twentieth-percentile heap floor 163.28 MiB and RSS floor 638.29 MiB. Nine windows and final verification remain; this is not a full-hour or stability pass. Runtime source remains 244e809.

- The same confirmed-live session 34106 reaches 1,801 elapsed seconds: 835 churn cycles, 1,149,130 accepted movement inputs and 52,320 chats. All 181 phase samples remain ready/current, maximum event-loop p95 remains 11.084 ms and tracked failure counters remain zero. Four complete post-warm-up windows each contain 30 samples; heap floors are 163.28/159.05/163.25/154.11 MiB and RSS floors 638.29/640.41/645.29/640.75 MiB. Six windows and the final command/ledger/metric/memory checks remain. Do not record a full-hour pass from this midpoint evidence.
