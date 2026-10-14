# Implementation plan

Status: proposed work sequence. No features below should be marked complete merely because this document exists. Aim for playable increments over the coming weeks; estimates await the initial spikes and are not commitments.

## Working method

Keep the current MVP runnable while replacing its foundations. Each milestone should produce a reviewable PR, a playable demonstration and tests tied to its failure risks. Avoid merging all systems in one enormous rewrite.

Use feature flags for new yard, bots, voice and league. Do not expose the old unauthenticated socket handlers alongside the new protocol on a publicly enabled service. A legacy local demo can remain isolated.

## 0. Baseline and decisions

- Reproduce install, typecheck, build and two-browser play.
- Capture current payoff/bot behaviour with meaningful tests.
- Back up legacy database; establish fixtures with no real user secrets.
- Confirm dependency versions, Node runtime and migration tooling.
- Prototype Phaser/React lifecycle on mobile and Blockly touch editing.
- Run LiveKit subscription enforcement spike independently of main implementation.

Exit: known baseline, documented dependency choices, voice feasibility result. A failed voice spike changes the adapter, not the whole game architecture.

## 1. Authoritative match core

- Extract pure state transitions and inject clock/RNG.
- Introduce runtime schemas and distinct public/private projections.
- Implement exact match/round targets, immutable moves and explicit lifecycle.
- Introduce new guest identity and authenticated controllers.
- Replace legacy handlers; preserve basic React match interface.
- Model Clanker as a normal system entrant.

Exit: two humans plus a system bot can finish; hostile client cannot see early moves, impersonate or overwrite a decision. Tests cover deadline races and departures.

## 2. Durable state and bot interface

- Add PostgreSQL schema, repositories, receipts, event outbox and settlement ledger.
- Implement recovery, leases and transactional idempotency.
- Add owned external bots, scoped credentials, heartbeats and controller fencing.
- Supply tiny Python and TypeScript examples, HTTP polling first, socket option second.
- Prove a human and external bot use the same rules.

Exit: accepted moves survive restart; duplicate messages cannot double-score; owner can enter a bot and watch. Crash tests pass. Keep deployment private until this milestone's trust boundaries work.

## 3. Playable yard and circles

- Build one small Phaser map and original placeholder prisoners.
- Add authoritative movement, local prediction and remote interpolation.
- Add presence, circle prompts, seating, spectating and challenges.
- Bridge React overlays without duplicate sockets.
- Add nearby text and basic block/report interface.

Exit: mobile/desktop users can meet, enter mixed tables and return to the yard. Test full circles, reconnects and a bot owner moving independently.

## 4. Voice and social playtest

- Integrate the adapter proven in milestone 0.
- Issue scoped tokens and drive audibility from authoritative positions/seats.
- Implement push-to-talk, mute, block, spectator filter and device errors.
- Add clear notice about owner-managed bot listening, without building transcription.
- Test with real mobile devices and hostile subscription clients.

Exit: 4–8 people can talk, play and spectate; distant/blocked listeners cannot bypass policy. If voice is delayed, text-enabled gameplay remains usable while this gate stays incomplete.

## 5. Visual bot creation

- Implement limited Blockly vocabulary, canonical AST and publication validation.
- Build bounded interpreter workers and per-seat memory.
- Add starter strategies, edit/test/publish flow and visual execution traces limited to the owner's program.
- Freeze versions per match; show bot ownership and status.

Exit: a nonprogrammer can make a bot, enter it and understand its choices. Oversized/malicious programs cannot affect other matches. Mobile editor usability is explicitly tested; preset editing is a temporary fallback, not a claim of full mobile parity.

## 6. Open bot league

- Add registration batches, round-robin fixtures, attempts and separate standings.
- Add small fixture scheduler using PostgreSQL jobs/locks in the singleton service.
- Start with 4–16 entrants and one active fixture per bot.
- Track offline readiness and retries; display open-compute limitations.
- Add public results and replay from stored decisions.

Exit: one full batch survives restart and fixture abort/retry without duplicate results. External and visual entries compete together.

## 7. Public-alpha preparation

- Run target load/soak tests and set actual admission caps.
- Exercise backup restore and deployment rollback.
- Verify moderation, guest limits, privacy messaging and credential revocation.
- Resolve mobile audio/gameplay issues found in playtests.
- Share with a small cohort, observe return play, then broaden access.

Exit: [testing](testing.md) and [operations](operations.md) launch gates met; outstanding rough edges listed honestly.

## Existing code migration map

| Existing code | Treatment |
| --- | --- |
| lib/game.ts payoff/stat helpers | Retain semantics with domain tests; separate random commentary |
| lib/game.ts start/reveal functions | Refactor into explicit transitions and persistence-independent results |
| server.ts socket handlers | Replace trust model, add command service and DTO serializers |
| lib/types.ts | Split internal entities, public observations and validated commands |
| lib/leaderboard.ts | Replace live persistence; archive old SQLite data |
| lib/clientStorage.ts identity | Retire as authentication; optionally retain display preferences |
| SocketProvider | Retain concept, add session/controller/snapshot lifecycle |
| lobby page | Reuse UI elements, adapt to projected match state |
| CSS/humour/awards | Reuse where they support the new presentation |

## Decisions requiring playtest rather than further architecture

Round lengths, lobby size, voice range, circle arrangement, scoreboard emphasis and visual-builder vocabulary. Defaults live in their owning docs; change them through versioned settings.

Account recovery/provider, actual hosting, voice adapter enforcement and rendering/editor dependency versions require explicit technical choices during milestone 0/2. They are the only intended infrastructure spikes, not reasons to postpone all implementation.

Clans, guards, loans, transfers and broad prison simulation remain outside this sequence.
