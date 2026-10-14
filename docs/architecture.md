# Architecture

Status: proposed implementation baseline, 14 October 2026. These choices are recommendations for the next version, not deployed capabilities. The [vision](game-vision.md) governs product intent; [implementation](implementation.md) gives the build order.

## Stack and boundaries

| Concern | Proposed choice | Reason |
| --- | --- | --- |
| Web UI | Existing Next.js + React + TypeScript | Retain forms, navigation and match UI |
| Yard renderer | Phaser, loaded only in the browser | 2D scenes, camera, input and animation |
| Realtime control | Existing Socket.IO, versioned application protocol | Retain transport while replacing unsafe handlers |
| Game service | One authoritative Node/TypeScript process initially | One owner of match and yard state |
| Durable data | PostgreSQL with SQL migrations and node-postgres | Transactions, uniqueness and recoverable matches |
| Visual editor | Blockly producing a validated JSON program | Accessible programming without arbitrary hosted code |
| Voice | Narrow server-authorized media adapter; mediasoup candidate after failed LiveKit permission spike | Keep media outside the game loop and enforce consumer eligibility |
| Verification | Vitest, real PostgreSQL integration tests, Playwright, scripted socket clients | Cover rules, persistence, UI and hostile clients |

Foundation decision, 14 October 2026: tested Node 24.18.0, Next 15.5.27, Socket.IO 4.8.3, Phaser 4.2.1, Blockly 13.4.0, pg 8.23.1, Zod 4.6.7, Vitest 5.0.4 and Playwright 1.64.1. New direct packages are pinned. Compatible existing dependency patches were applied because npm audit reported concrete advisories; postcss 8.5.30 and esbuild 0.28.2 overrides remove remaining vulnerable transitive copies. The unused broken Next lint setup was replaced by explicit formatting and TypeScript checks. npm audit reports no advisories at this checkpoint.

Do not automatically upgrade existing dependencies as part of this plan. Select supported compatible releases and pin them when each component is introduced. No Redis, microservices, Kafka, Kubernetes or multiple game writers for the first alpha.

## Proposed source layout

- `app/`, `components/`: React pages, accessible overlays and forms.
- `client/yard/`: Phaser scene, input, prediction and interpolation.
- `shared/protocol/`: runtime schemas, public DTOs and protocol version.
- `domain/match/`: state transitions, pairing and scoring without sockets or database imports.
- `domain/bots/`: validated program interpreter and observation types.
- `server/auth/`, `server/commands/`: principals, permissions and transport adapters.
- `server/matches/`, `server/yards/`: authoritative coordinators.
- `server/persistence/`: repositories, migrations and transaction helpers.
- `server/voice/`: media authorization adapter.
- `examples/bots/`: Python and TypeScript clients.
- `tests/`: domain, integration, protocol and browser verification.

Start in this repository. Keep the custom server entry point as composition/wiring; progressively move logic out of it. Splitting packages or services is optional future work, not a prerequisite.

## Runtime ownership

React owns UI state. Phaser owns rendered scenes. A small typed bridge carries interaction intents and read-only snapshots between them. Neither owns competitive truth.

The server owns positions, admission, seats, accepted moves, deadlines and results. Clients send intent and render acknowledged state. Bot adapters call the same command service as humans.

Use a per-match serial queue to order competing commands. Every durable mutation also locks the match row in a database transaction; in-process ordering alone is not a durability guarantee. Define lock order as match, round, seats, account/balance rows in sorted ID order. Never perform network calls or model inference while holding a transaction.

Yard movement remains in memory. A match's accepted moves and transitions are committed before acknowledgment. PostgreSQL outages stop durable commands with a retryable error; they must not produce optimistic score changes.

## Event handling

This is a modular application using commands and events, not full event sourcing. Persist normalised match state plus a small event/outbox history for delivery and replay. The database is the recovery source; timers and caches can be reconstructed.

Transaction flow: authenticate → validate → lock → check preconditions → apply mutation → write state/event/receipt → commit → acknowledge/broadcast. Outbox delivery may duplicate events. Clients use sequence numbers and snapshots; exactly-once network delivery is not promised.

Use separate serializers for public match state, the participant's own private state, and internal state. Internal entities must never be directly passed to socket emit.

## Identity and sessions

Start with frictionless guest owners created server-side. Set a random opaque session secret in an HttpOnly, Secure, SameSite=Lax cookie; store only its hash. Proposed absolute lifetime: 30 days, with explicit rotation and revocation. Owner UUIDs and socket IDs are identifiers, never credentials.

A guest losing the cookie loses access unless an account recovery/upgrade flow has been added. Clearly say this before creating valuable bot collections. Account linking is a later gate for persistent public competition, not something to simulate with localStorage.

Validate origin on browser HTTP mutations and socket handshakes; require CSRF protection for cookie-authenticated HTTP writes. Bot tokens authenticate distinct bot principals with limited capabilities. One active browser controller per owner; a new controller explicitly takes over and fences the old controller. Other tabs may observe. Reconnection restores identity but not arbitrary room membership without permission checks.

## Scaling and recovery

Initial target: one yard of 32 human presences and up to four eight-seat tables. This is a test target, not measured capacity. A bot seat does not require a human avatar or voice connection.

Deploy exactly one game-service replica initially. Use an exclusive deployment lease/advisory lock and terminate if ownership is lost. A second process must fail readiness rather than become another writer. Horizontal scaling later requires yard/match ownership and routing; adding a Socket.IO adapter alone will not solve state ownership.

On startup load unfinished matches before accepting commands. Follow recovery rules in [data](data.md). Players respawn at a safe yard entrance after a process restart. Identity, bots and results persist; exact walking positions do not.

## References

Reviewed 14 October 2026:
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/): application acknowledgments and retries remain necessary.
- [Socket.IO disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections/): clients need resynchronisation.
- [Phaser framework templates](https://docs.phaser.io/phaser/getting-started/project-templates): reference for the React/renderer boundary.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): basis for transaction locking.
