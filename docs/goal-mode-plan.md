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
| 0 Foundation | NOT_STARTED | — | Baseline and spikes |
| 1 Match core | NOT_STARTED | — | Authority and hidden-move checks |
| 2 Persistence/API | NOT_STARTED | — | Recovery and external bot |
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
