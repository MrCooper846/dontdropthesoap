# Gameplay rules for the technical alpha

Status: proposed, tunable defaults. These make implementation concrete; they do not replace the [vision](game-vision.md). Every match stores an immutable ruleset version and settings snapshot.

## Modes and scoring

| Mode | Entrants | Pairing | Proposed rounds and timing |
| --- | --- | --- | --- |
| Human social | Humans | Shuffle each round | 10 rounds, 20-second choice, 5-second reveal |
| Mixed social | Humans and owned bots | Shuffle each round | Same defaults; configurable before ready |
| Direct challenge | Two eligible entrants | Repeated same opponent | 10 rounds, 20-second choice, 5-second reveal |
| Bot league fixture | Two bots | Repeated same opponent | 20 rounds, 20-second choice, 1-second reveal |

Social settings: 2–8 entrants; 5–50 rounds; 5–60-second decision window. Settings changes clear readiness. No global rule requires frontier models to respond in milliseconds; owners choose suitable tables.

Canonical API moves remain `C` and `D`; UI uses cooperate and betray.

| A | B | A payout | B payout | Net after two-noodle ante |
| --- | --- | --- | --- | --- |
| C | C | 3 | 3 | +1, +1 |
| C | D | 0 | 5 | -2, +3 |
| D | C | 5 | 0 | +3, -2 |
| D | D | 1 | 1 | -1, -1 |

Start match score at zero; use net changes above. Negative scores are allowed without debt mechanics or elimination. Completed social matches contribute to a separate casual lifetime total. League score stays separate; no transfers, purchases or cash value. Never rank competitive bots by accumulated casual wealth. The old 50-noodle balances remain legacy data, not a competitive seed.

Odd social tables use a labelled system Clanker entrant with shared match memory, preserving the joke. It starts C and copies the last human or player-bot move against it. It receives a normal seat/decision path; system entries earn no persistent owner balance. League fixtures use no filler.

## Match lifecycle

`waiting → countdown → collecting → revealing → collecting … → finished`

Terminal alternatives: `cancelled` before play, `aborted` after play begins. Terminal states never return to waiting. Rematch creates a new match ID.

All human owners ready their entrants; external bots must have a current heartbeat. A three-second countdown starts once the host requests start and all conditions hold. Departure during countdown cancels countdown and clears readiness. At start freeze entrants, settings, bot versions and schedule.

The collecting phase persists its round number, pairings and absolute server deadline. The first valid move is irrevocable. Resolve all pairings together when every required move exists or the deadline expires. No early pairwise result leaks while other players are still choosing.

A missing move becomes C at deadline and is recorded as a timeout. Repeated timeouts do not delete seats. A disconnect preserves already accepted moves; leaving marks a seat abandoned and fills future decisions with timeout C. Scores still settle. The UI states this before leaving. Provisional league policy: three consecutive timeouts flag an entry offline for admission to later fixtures, while the current fixture completes. It can reconnect and clear that admission flag before a later scheduled fixture starts.

No mid-match seat replacements. Owner movement outside a circle does not cancel their bot's seat. A human seat shows a table overlay and anchors its avatar until leaving or finishing.

## Fairness and deadlines

The server checks the database clock after obtaining the match lock. A move is accepted only while collecting and before the stored deadline. Client timestamps do not extend time. At the boundary, the same rule applies to humans and bots; a UI click near zero is not guaranteed acceptance.

Changes of rules after start, host-forced reveals, rewrites of locked moves and deletions of active entrants are prohibited. Server restarts follow the interruption policy in [data](data.md), not normal player timeouts.

## First league format

Implement scheduled small batches of 4–16 bots, one per owner per batch, one fixture per pair. Each fixture plays the same fixed round count. Only one active fixture per entrant. Sort fixtures deterministically; alternate A/B labels across batches. Publish schedule and rules before registration closes.

Standings: sum net fixture points, then mutual-cooperation count, then shared rank on a remaining tie. Do not add an opaque tie-break advantage. Cancelled/aborted fixtures contribute nothing and are retried as new fixture attempts before the batch is finalised. Unique fixture settlement prevents double credit.

External code changes, out-of-band communication and multiple real-world accounts cannot be reliably prohibited by this architecture. Label the initial league an open experimental competition, not a certified autonomous-agent benchmark. A declared external revision is metadata, not proof of frozen code. No valuable prizes in the alpha plan.

## Social behaviour

Bluffs, collusion and misleading agents are in-game possibilities. Game rules remain authoritative. Owners may advise or modify their external agents; the platform does not promise detection. Built-in visual programs are frozen per match for reproducibility.

Future formats can introduce stronger constraints only if enforceable. Clan systems, guards and prison governance are not needed for these rules.
