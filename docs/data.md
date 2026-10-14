# Data model and persistence

Status: proposed schema, not existing migrations. PostgreSQL is the durable authority. UUIDs identify entities; timestamps use UTC timestamptz. Money-like game values use integers. JSON payloads have explicit schema versions.

## Durable entities

| Table | Important fields | Constraints and purpose |
| --- | --- | --- |
| owners | id, display_name, created_at, disabled_at | Name 1–32 characters; no unique-name assumption |
| sessions | id, owner_id, secret_hash, controller_epoch, expires_at, revoked_at | Unique hash; never send hash to clients |
| bots | id, owner_id, name, kind, controller_epoch, archived_at | kind visual/external; ownership FK |
| bot_versions | id, bot_id, revision, workspace_json, program_json, program_hash, interpreter_version, external_label | Unique bot/revision; visual versions immutable |
| bot_credentials | id, bot_id, secret_hash, scopes, expires_at, revoked_at | Token only returned on creation |
| yards | id, slug, map_version, capacity, enabled | Configuration persists; positions do not |
| circles | id, yard_id, x, y, radius, mode, settings_json | Versioned settings and server-defined interaction point |
| matches | id, circle_id nullable, mode, ruleset_version, settings_json, state, version, current_round, deadline, interruption_count, private_rng_state | Monotonic version; one active match per circle |
| match_seats | id, match_id, slot, owner_id nullable, bot_version_id nullable, kind, status, score | Unique match/slot; frozen after start |
| rounds | match_id, number, state, deadline, resolved_at | Primary key match/number |
| pairings | id, match_id, round_number, a_seat_id, b_seat_id | Both seats belong to this match |
| moves | match_id, round_number, seat_id, move, source, accepted_at | Unique match/round/seat; C or D; source player/bot/timeout/system |
| round_results | pairing_id, a_move, b_move, a_net, b_net, commentary_key | One result per pairing |
| match_events | match_id, sequence, type, visibility, recipient_seat_id nullable, payload, created_at, published_at | Unique match/sequence; durable outbox and history |
| creation_keys | id, principal_id, expires_at, consumed_at | Server-issued; expired keys always reject |
| command_receipts | principal_id, command_id, payload_hash, response, created_at | Unique principal/command; stable retries |
| balance_entries | id, owner_id, match_id, delta, created_at | Unique owner/match settlement |
| league_batches | id, rules_json, state, registration_deadline | Settings frozen when registration closes |
| league_entries | id, batch_id, owner_id, bot_version_id, status | Unique batch/owner |
| league_fixtures | id, batch_id, entry_a_id, entry_b_id, state, settled_match_id nullable | Unique unordered entry pair; only one settlement |
| league_attempts | fixture_id, attempt_number, match_id | Unique fixture/attempt; aborted attempt remains inspectable |
| owner_blocks | owner_id, blocked_owner_id, created_at | Unique directed pair |
| reports | id, reporter_id, subject_owner_id, match_id nullable, reason, created_at, status | Length limits and restricted operator access |

For visual seats require a visual bot version; human seats have owner but no bot version; system seats have no owner. Enforce referential membership with composite keys/FKs where possible and transactional validation otherwise. Do not cascade-delete completed matches when a bot is archived.

Indexes: sessions(secret_hash), credentials(secret_hash), matches(state,deadline), events(match_id,sequence), unpublished events, bots(owner_id), fixtures(batch_id,state), receipts(created_at), balances(owner_id). Use a partial unique index for active circle matches. Cap public history pages at 100 rows with cursor pagination.

## Implemented match-state representation

The first integration slice keeps a versioned internal JSON checkpoint in matches.state_json alongside normalized seats, rounds, pairings, immutable moves, results, receipts and ledger rows. Both are written in the same locked transaction. The checkpoint is the engine/recovery input; uniqueness and membership constraints on normalized records independently protect accepted decisions and settlement. It contains private RNG and decisions and is never a wire DTO.

This is a deliberate implementation adjustment: it preserves deterministic state-machine recovery without rebuilding the current domain object from many joins on every command. Fresh-install/upgrade migrations and physical crash tests cover the representation. Future schema changes must migrate the checkpoint version and normalized data together. The remaining entity tables in this document are still targets until their features land.

## Ephemeral state

Positions, velocities, input sequences, current socket IDs, controller epochs, voice track IDs, audio subscription sets and presence heartbeat live in memory. Reconstruct them on reconnect. Keep a bounded 30-second text-chat buffer per yard with recipient sets; no automatic transcript persistence.

Bot runtime state for visual bots is durable per match/seat: add `bot_runtime_states(match_id, seat_id, state_json, rng_state, last_round)`. Update the decision and state atomically with its move so retries do not advance memory twice. Proposed memory cap: 8 KiB. External bots own their memory.

Controller epochs increment durably on takeover and service restart before commands are enabled. Sockets/heartbeat leases remain ephemeral; old epochs never become valid again. Pairing RNG state is private and persisted with the next round's schedule; no future random seed is included in public snapshots.

## Transactions and settlement

Move transaction:
1. Look up durable receipt for the authenticated principal and command ID.
2. Lock match; check state, deadline, seat ownership and round.
3. Enforce immutable move uniqueness.
4. Write accepted move, own-seat event and receipt.
5. If this completes the round, resolve inside the same transaction or enqueue a resolver that locks and rechecks.
6. Commit before ACK; publish only committed projections.

Resolution transaction locks match and round, fills missing moves only if due, creates one result per pairing, updates scores, advances state, writes ordered events and settlement when terminal. Unique result keys and state checks make concurrent timer/move resolution harmless.

Final settlement inserts balance entries once per eligible human owner and league fixture settlement once. A social table admits at most one seat per owner, human or bot, avoiding ambiguous owner totals. An owner may have a bot in another table, subject to [protocol](protocol.md) caps. Derived balances sum the ledger; cached totals, if added, update in the same transaction.

Outbox publication can repeat after a crash. Keep events until retention expiry; `published_at` is not proof every client received them. Event payloads contain only their declared visibility projection. Credentials, raw voice and arbitrary external-agent traces never enter match history.

## Recovery policy

Recover waiting rooms but clear readiness. Interrupted countdown returns to waiting. For brief interruptions, collecting rounds retain committed moves and receive one fresh full decision window on service restart; emit a visible interruption event. Revealing resumes with a fresh five-second display window before advancing. A durable deadline-coordinator heartbeat bounds this recovery: if its gap reaches a match's decision-window length, abort collecting/revealing matches without timeout scoring or settlement, and return countdowns to waiting with readiness cleared. A long process outage and a long database outage cannot be reliably distinguished after connection loss; both use this conservative infrastructure policy. Finish active matches before planned long maintenance.

After more than one service interruption of the same match, abort it to prevent indefinite extension. Aborted matches contribute no lifetime/league settlement. Existing round results remain diagnostic history. Retry a league fixture using a new match attempt. This alpha rule favours transparent recovery over pretending uninterrupted competitive fairness.

A crash after committing a result but before broadcasting it is resolved by snapshot/outbox replay, never recalculating and crediting again. A crash before commit leaves no accepted move; the client retries its command ID.

Do not replay hours of expired rounds immediately after downtime. Recovery explicitly rewrites the active deadline transactionally before readiness opens.

## Legacy migration

Back up `data/leaderboard.sqlite` read-only before cutover. Export balances and score_entries into a versioned archive with row counts and checksum. Do not grant ownership based on old public player IDs or let them authenticate new accounts. Alpha begins with new guest identities and fresh competitive scores; preserve the archive for an explicit future claim policy if wanted.

Schema migrations run once before the service starts; failure blocks readiness. Test both clean install and upgrade on a database copy. Prefer additive migrations, backfill, then remove fields in a later release.

## Retention defaults

Retain owner/bot records until explicit deletion/archive policy applies. Keep round histories and event payloads for 90 days, durable score summaries/settlements longer. Keep command receipts 7 days; gameplay uniqueness constraints protect older retries, while expired creation-command retries return expired/idempotency-window errors rather than creating duplicates. Use server-issued time-bounded creation keys for resource creation.

Sessions and revoked credentials are cleaned after expiry plus 7 days. Reports default to 30 days pending a documented operator policy. Backups expire after 7 days initially. These are engineering defaults, not legal retention advice; deletion must cover live records and documented backup expiry.

## Implemented visual version/runtime records

Migration 005 stores visual ruleset version metadata, complete program/workspace/hash/interpreter payloads and an immutability trigger for published visual versions. Runtime state references the exact admitted version and the match/seat pair; uint32 RNG is nonzero. visual_decisions has one accepted/error record per match/round/seat, foreign keys to the real round/seat/version and owner-private bounded feedback.

Runtime initialization is durable but does not advance memory. Actual state/RNG advancement, move acceptance, normalized/checkpoint transitions and accepted feedback are atomic under the match/runtime locks. A forced database failure after intermediate writes has been verified to roll all of them back; retry then commits once. Recovery preserves accepted moves and memory. Deadline changes fence pre-interruption worker results.

## Operator audit and admission maintenance

Migration 011 stores atomic, immutable operator action responses and separate idempotent live-effect markers. Targets are public identifiers, not secrets. Migration 012 stores a singleton service_controls.matches_open flag; its SQL admission triggers lock that row through the transaction. New matches, new non-system seats and waiting-room starts require it to be open. Existing admitted countdowns/rounds, system filler and settlement continue. This additive backstop remains enforced on the previous binary during rollback. Procedure, audit trust boundaries and pause/resume semantics live in [operations](operations.md#pause-new-games-for-maintenance).
