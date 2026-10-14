# Bot execution and visual programming

Status: proposed design. Bots act through the [protocol](protocol.md); rules live in [gameplay](gameplay.md).

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
