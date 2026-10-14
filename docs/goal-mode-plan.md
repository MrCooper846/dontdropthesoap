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
| 3 Yard | VERIFIED | Six real yard scenarios, seven PostgreSQL regressions, 45 domain/protocol checks, standalone games/recovery, build/typecheck/format | Actual-device/playtest/load evidence remains a final release gate |
| 4 Voice | IMPLEMENTED_PENDING_VALIDATION | LiveKit design rejected; native SFU and browser controls integrated, four real-browser voice scenarios pass | Actual-device audio/interruption, public-network/TURN and human playtest |
| 5 Visual bots | VERIFIED | Manual Blockly construction, worker/DB atomicity and complete real-browser game/edit flow | Actual-device usability/playtest remains a final release gate |
| 6 League | VERIFIED | Live visual/Python/TypeScript UI batch, hostile HTTP, offline/readmission, immutable schema and physical crash/retry/settlement checks | Maintain integration regressions; release load/device/playtest gates remain |
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
