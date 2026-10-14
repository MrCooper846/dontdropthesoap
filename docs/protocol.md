# Protocol and identity

Status: proposed v1 contract. Names below are implementation targets, not existing endpoints. Runtime validation is mandatory; TypeScript types alone do not validate hostile messages.

## Transport

Use same-origin HTTPS for resource management and snapshots. Socket.IO carries browser realtime commands/events. External bots may use the same versioned socket namespace or ordinary HTTPS polling and move submission. Socket.IO is not a raw WebSocket protocol; examples must use a compatible client.

Namespace: `/game-v1`. REST prefix: `/api/v1`. Both adapters call identical command handlers. Unsupported major versions return VERSION_UNSUPPORTED and never silently downgrade.

## Current integration surface

The match-foundation slice implements /session/guest, /session, /session/logout, /controller/acquire, /command-keys, /commands, /matches (create/list), /matches/:id/join, /matches/:id/observation, /matches/:id/moves, /matches/:id/results and /leaderboard under /api/v1. Guest creation takes {name}. Browser controller acquisition takes an empty body and returns controllerEpoch. Match creation and joining require commandId, controllerEpoch and a server-issued single-use creation key. Joining additionally targets the match in the route. Cookie-authenticated writes require x-csrf-token.

The /game-v1 namespace currently provides command and state.sync({matchId}) with acknowledgements and projected match.snapshot events. Reconnect gets a current projected snapshot; filtered durable cursor replay is implemented for both adapters. Resource creation keys are opaque durable UUIDs checked against their stored owner, expiry and consumed state; unknown or cleaned-up keys reject rather than become reusable. This first slice does not use self-contained signed creation keys.

Stage 2 additionally implements POST/GET /bots, POST/GET /bots/:id/credentials, DELETE /bots/:id/credentials/:credentialId, POST /bot-controller/acquire, POST /bot-controller/heartbeat and GET /bot/assignments. Registration and issuance use {commandId,key,controllerEpoch,payload}; registration payload is {name,externalLabel?} and issuance payload is {}. Credential lists return metadata only. Issuance retries return the stable credential metadata with secretUnavailable=true, never a duplicate credential or persisted plaintext secret. This is an explicit exception to replaying secret-bearing creation responses: a lost secret must be revoked/reissued.

Match create/join accepts optional botId, authenticated against the browser owner, and freezes its version at admission. Only mixed/challenge tables admit player bots. Owner readiness/leave commands address that seat; only its bot controller submits decisions. Browser and bot commands share the same service, deadline/ownership rules and durable receipts. Bot credentials can access only their assigned matches. A service restart increments bot epochs and clears ephemeral leases; clients explicitly reacquire.

GET observations add events/cursor/hasMore/reset and accept after. state.sync accepts optional after and returns the equivalent filtered scan. Public and own-seat private events have a monotonic durable sequence separate from match state version. Invalid/out-of-retention cursors receive a current snapshot/reset cursor. Private entries advance the scan without exposing their payload. The socket publisher also filters private entries.

All other endpoints and commands below remain implementation targets. Health routes /health/live and /health/ready are outside the versioned API. The legacy demo's handlers are not mounted by the new server.

## Credentials

Browser: server-created guest session cookie, origin check and CSRF token for writes. A public owner ID is never accepted as proof of identity.

External bot: 256-bit random bearer secret, hashed at rest, scoped to one bot. Proposed scopes: observations:read and moves:write. Owners enter their bots through the browser; bot credentials cannot manage accounts, join voice, enumerate private data or change ownership. Tokens expire after 30 days, can be rotated/revoked and are shown once. Never put them in URL query strings or logs.

A bot may have one active controller lease, with an epoch incremented on explicit takeover. All commands must carry the current epoch. The previous controller is fenced immediately. Credential revocation also closes active sockets. HTTP-only clients acquire/renew the same lease, not a separate permission model.

## Common command envelope

```json
{
  "v": 1,
  "commandId": "UUID",
  "type": "move.submit",
  "controllerEpoch": 4,
  "matchId": "UUID",
  "round": 3,
  "seatId": "UUID",
  "payload": { "move": "C" }
}
```

The authenticated principal determines which seat may be controlled. Never accept arbitrary sender IDs. Match version is required for host/settings mutations; move submissions use exact match/round/seat so another player's submission cannot invalidate an otherwise valid move.

ACK: `{v, commandId, ok, matchVersion?, result?, error?}`. Errors have stable code, readable message and retryable boolean. First valid command is committed before success ACK. Same command ID and payload return the saved result; same ID with a different payload returns COMMAND_ID_REUSED. A second move with a new ID returns MOVE_LOCKED, even if identical.

Codes include AUTH_REQUIRED, FORBIDDEN, CONTROLLER_STALE, NOT_FOUND, INVALID_PAYLOAD, RATE_LIMITED, VERSION_CONFLICT, WRONG_PHASE, ROUND_MISMATCH, DEADLINE_PASSED, MOVE_LOCKED, CAPACITY_FULL, BOT_OFFLINE and SERVICE_UNAVAILABLE. Avoid revealing existence of inaccessible private resources.

## Commands and authority

| Command | Actor | Essential checks |
| --- | --- | --- |
| yard.enter / yard.leave | Browser owner | Capacity, enabled map, one active presence |
| yard.input | Browser controller | Sequence, axis values, server movement limits |
| circle.inspect | Yard member | Visible circle; public response |
| seat.join / seat.leave | Owner | Near circle, eligibility, ownership, active-seat caps |
| seat.ready | Owner | Waiting state, bot online when applicable |
| match.configure / match.start | Host | Version, waiting/countdown state, all readiness conditions |
| move.submit | Seat controller | Lease, exact round, hidden move lock, deadline |
| match.watch / match.unwatch | Yard member | Circle accessible; public projection only |
| state.sync | Authenticated principal | Recompute allowed subscriptions |
| chat.send | Browser owner | Yard membership, length, rate, blocks |
| challenge.create / accept / decline | Browser owner | Target present, expiry, eligibility, invite rate |

Challenge invitations expire after 30 seconds. Acceptance creates/reserves a suitable two-seat circle only if both entrants remain eligible; otherwise return a clear failure without leaving half-created seats. Resource-creating commands obtain a single-use, 10-minute idempotency key from the service; persist its consumed state for the receipt window, and reject expired keys even after receipt cleanup.

Initial limits: one human active seat per owner; at most two total active seats per owner across different matches; one active match per bot; one owned seat per social table. One league entry per owner per batch. System filler is exempt. These limits are configuration defaults to revisit after playtests.

## HTTP surface

| Method and route | Purpose |
| --- | --- |
| POST /session/guest | Create guest and cookie, bounded by abuse limits |
| GET /session | Own identity and CSRF bootstrap |
| POST /session/logout | Revoke session and disconnect controller |
| GET /yards | Public yard summaries |
| POST /bots; GET /bots | Own bot management |
| POST /bots/:id/versions | Validate and publish visual program or external declaration |
| POST /bots/:id/credentials | Mint scoped secret for owner |
| DELETE /bots/:id/credentials/:credentialId | Revoke scoped secret |
| POST /bot-controller/acquire; POST /bot-controller/heartbeat | Bot lease management |
| GET /bot/assignments | Only this bot's active matches |
| GET /matches/:id/observation?after=cursor | Public plus own-seat information, filtered event cursor |
| POST /matches/:id/moves | Same move command and ACK as sockets |
| POST /command-keys | Time-bounded resource-creation key |
| GET /matches/:id/results | Revealed results with pagination |
| GET /league-batches/:id | Public schedule and standings |
| POST /voice/token | Browser owner only, current yard eligibility |
| POST /blocks; DELETE /blocks/:ownerId | Own block list |
| POST /reports | Bounded report submission |

All routes are under /api/v1. Unlisted management operations should be specified before implementation, not improvised by clients.

HTTP observation polling starts at once per second; heartbeat every five seconds; offline after fifteen seconds. Socket clients receive push observations but use the same heartbeat semantics. Server rate limits apply equally.

## Event envelope and visibility

Events: `{v, type, matchId?, seq?, serverTime, payload}`. Use durable monotonically increasing match sequence for competitive events. Yard position packets instead use yard epoch and tick. Chat carries sender identity and server-assigned ID, but remains untrusted player content.

| Event | Who receives it | Contents |
| --- | --- | --- |
| match.snapshot | Authorised viewer | Public state plus own-seat private projection if applicable |
| round.started | Participants and authorised spectators | Pairings, round, deadline and rules |
| move.accepted | Controlling seat only | Own choice and receipt |
| round.progress | Authorised viewers | Number locked, never choices |
| round.revealed | Authorised viewers | All pair results and deltas |
| match.finished / aborted | Authorised viewers | Final state and settlement status |
| match.interrupted | Authorised viewers | Recovery reason and revised deadline |
| bot.assignment | Owning bot principal and owner | Match/seat identity |
| yard.snapshot / positions | Yard members | Public avatars, circles and ticks |
| chat.message | Recipients determined at send time | Plain text and sender; no authoritative game claims |

A spectator gets no private move, token, bot memory or future random seed. An owner watching their bot may see that bot's accepted move but not its opponent's. Private events are filtered server-side; clients cannot request them by guessing sequence numbers.

## Reconnect and retry

On reconnect authenticate, acquire/resume controller, then request snapshot plus events after last cursor. Re-authorise every subscription; do not blindly restore old socket rooms. Snapshot includes server time, state version, current round, own accepted move and deadline. If history expired or cursor is invalid, return snapshot and a new cursor.

Filtered responses advance the cursor across scanned events, including invisible entries, without exposing their payloads. Ignore duplicate event sequence numbers. Never automatically replay queued move intents from an earlier round. Retry an unacknowledged command only with its original ID and exact target; resynchronise after any ambiguity.

## Time-bounded creation keys

Only resource-creating commands require a key in addition to commandId. For an expired key, first check a matching unexpired receipt and return its result; otherwise reject. Deleting old key records does not make them reusable because signed expiry and principal binding are validated. Store a key signing secret separately from bot/session tokens. Match moves rely on round identity and uniqueness, not creation keys.

## Input budgets

Initial tunables: 16 KiB command envelope, chat 280 characters, nickname/bot name 32 characters, 20 movement packets/second, 10 durable commands/second per principal with a small burst, 1 chat/second with burst 3, five invites/minute. Program publication has its own larger 64 KiB limit. Apply owner and IP connection/admission limits as well; do not disconnect a shared-network group based on a single low global IP allowance.
