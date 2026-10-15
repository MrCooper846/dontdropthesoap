# Bot execution and visual programming

Status: external and visual bot implementations are integrated; physical-device editor usability remains a release gate. Historical foundation notes below are superseded by the integrated publication section. Bots act through the [protocol](protocol.md); rules live in [gameplay](gameplay.md).

## Shared observation

Every decision sees the ruleset, match/round identity, deadline, own seat, opponent identity/kind, current public scores, revealed match history and own already accepted move. Include source labels for official state versus player text. Match history pagination and observation size limits apply.

No bot gets internal lobby objects, opponent private state, unrevealed choices, other credentials or future pairing randomness. The service never needs an external model API key.

## External runtime

Owner hosts their process and connects outbound to the game over HTTPS/Socket.IO. The game does not call arbitrary user-supplied webhook URLs, avoiding a separate inbound-hosting and server-side request surface.

Reference clients should demonstrate:
1. Acquire bot controller with a scoped token from an environment variable.
2. Heartbeat and fetch assignments.
3. Subscribe or poll for round observations.
4. Choose C/D.
5. Submit one command ID per decision; retain that ID until ACK.
6. Resynchronise after connection loss.

Provide always-cooperate, always-betray, per-opponent tit-for-tat and seeded random examples in TypeScript/Python. Tit-for-tat defaults C when no previous revealed encounter with that opponent exists. Keep external provider integrations optional examples contributed later.

Owner handles model latency, costs, persistent memory and audio processing. A bot may be coached or changed externally; claims of autonomy are not enforced. Audio capture feasibility varies by browser/device; do not promise a mobile client can transparently pipe its sound into a local agent.

## Visual editor

Use Blockly as the editor, with custom blocks compiled to a versioned JSON AST. Store both workspace JSON for editing and canonical AST for execution; derive AST server-side or validate a deterministic compilation correspondence so workspace labels cannot disguise different executable behaviour.

First blocks: C/D return, if/else, boolean operators, numeric comparison, round number, own/opponent score, last revealed opponent move, counts of C/D, seeded random, and named memory read/write. Provide starter presets and a readable summary. No arbitrary JavaScript, network calls, filesystem access, recursion or unbounded loops.

Canonical example:

```json
{
  "schemaVersion": 1,
  "decision": {
    "op": "if",
    "condition": { "op": "eq", "left": { "op": "lastOpponentMove" }, "right": "D" },
    "then": { "op": "return", "move": "D" },
    "else": { "op": "return", "move": "C" }
  }
}
```

Implement a small custom interpreter over known opcodes. Editor generators do not constitute a sandbox. No eval or Function constructor. Validate AST types, depth <=32, <=512 nodes, <=64 KiB program; cap execution at 2,000 interpreter steps and memory at 8 KiB per seat. Unknown opcodes and invalid programs fail publication, not midway through matches.

Execute visual decisions in a bounded worker pool outside the game event loop. A worker timeout/error yields no move and eventually normal timeout C, visibly tagged as a bot error. Limit concurrent tasks and discard late responses by match/round/version. Never let a runaway worker block all deadlines.

Commit program state changes and move together. Seeded RNG state advances atomically; retries reuse the same decision. Freeze program version at match admission; edits create a new version for subsequent matches. Memory persists across rounds within the match and resets at its start for alpha. Cross-match memory is deferred, not a restriction imposed on external bots.

## Versioning and reproducibility

Visual versions record AST hash, interpreter version and ruleset version. External versions record only a declared label; never represent that as proof of code identity. Store result commentary keys or rendered strings once, so replay does not generate a different story.

Snapshots and recorded decisions allow result replay without re-running remote agents. The system cannot reproduce an external model's private reasoning. Do not collect chain-of-thought or require model transcripts.

## Reference

[Blockly documentation](https://docs.blockly.com/) describes the customisable editor and generation APIs. The restricted AST/interpreter above is our design, not a security guarantee supplied by Blockly.

## Implemented visual execution foundation — 14 October 2026

domain/bots/program.ts validates and canonicalizes interpreter version 1. It accepts finite number/boolean/move expressions, revealed observations, move counters, seeded random, comparisons, boolean operators, addition/subtraction and typed named memory. Statements are literal C/D return, if/else and memory assignment with an explicit next statement. Every path returns; there are no loops, recursion or arbitrary source-code operations. Programs enforce 32-level/512-node/64-KiB bounds; declared memory has at most 128 named scalar slots and an 8-KiB limit. Names retain their declared types. Execution limits remain 2,000 steps and 8 KiB; diagnostic traces are limited to 32 entries.

shared/bots/blocks.ts defines the real Blockly vocabulary. domain/bots/workspace.ts derives the AST from saved JSON, so a separately claimed executable AST cannot disguise different block fields. It bounds the workspace to 64 KiB, rejects spare roots/unknown operations/disabled executable blocks and requires complete decision paths. Four starter workspaces round-trip through the installed real Blockly serializer and compiler in tests. At that foundation checkpoint these shared definitions were not yet a mounted editor; the integrated UI is described below.

server/bots/visual-pool.ts uses two worker threads by default, a total capacity of 32 tasks, a 100-ms execution watchdog, a separate 5-second startup budget, resource limits and bounded crash restarts. Expired tasks/results are discarded and malformed outcomes reject. Tests execute real threads and terminate an intentionally infinite worker while the parent timer continues ticking. This is process isolation and known-opcode execution; it does not host user JavaScript.

npm run build:workers compiles only the trusted worker/interpreter source to ignored dist/workers/visual-worker.mjs using pinned esbuild 0.28.2. dev, build and test run this step automatically. Shipping requires the generated artifact alongside the application. Loader-based attempts on the installed Node/tsx runtime failed dependency resolution and module-cycle checks; the compiled worker removes that runtime-loader dependency.

That foundation checkpoint preceded publication storage, atomic state-plus-move persistence, live seats and the complete editor UI. Those integrations and their real acceptance evidence are described below and in goal-mode-plan.md; the foundation unit tests alone do not prove them.

### Integrated publication and participation

FEATURE_VISUAL_BOTS enables the real /bots/build editor, independent of external credentials. It supports both Blockly gestures and labelled controls that add/connect/edit blocks, plus a readable summary, four starters, private worker-backed practice, immutable publication, yard admission and owner-only decision feedback. New unpublished drafts stay locally under the guest owner ID; published workspaces/programs live in PostgreSQL.

POST /bots/visual creates the first version through the ordinary idempotent resource envelope. POST /bots/:id/versions publishes the next; GET /bots/:id/versions/latest or /versions/:versionId loads only an owned visual strategy. The server derives its canonical AST from the workspace and stores the hash, interpreter/ruleset version and editable JSON. The database rejects changes/deletion of published visual versions. External credentials cannot be issued for visual bots.

POST /bots/preview uses {controllerEpoch,workspace,observation,previous?}, CSRF and a separate one-thread/four-task pool. It never writes match state. One preview per owner may be pending; admission is also rate-limited. Only these workspace-bearing routes accept up to 128 KiB envelopes, while workspace/program limits remain 64 KiB and other command bodies remain 16 KiB.

The live scheduler reads the frozen admitted version. It initializes private per-seat memory/RNG once, executes outside transactions, then locks/rechecks the match, exact round/version/deadline, prior runtime state and owner status. Accepted move, memory/RNG, private trace and result/settlement transitions commit in one transaction. Duplicate or stale-window results cannot advance state twice. Worker errors record owner feedback, leave memory unchanged and use ordinary deadline timeout C; public snapshots expose only a bot-error flag.

The visual vocabulary's history facts refer to revealed encounters between this seat and its current opponent. A first encounter has no last move and zero counts. Current accepted hidden moves are never part of that observation. Match-scoped memory still spans successive opponents; memory resets only when a new match starts.

GET /matches/:matchId/seats/:seatId/visual-feedback is owner-only. Other spectators see ordinary public outcomes and bot status, never program memory, random state or private execution traces. Editing an owned bot cannot rewrite the strategy of an existing seat.
