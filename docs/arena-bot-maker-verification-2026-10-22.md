# Bot maker exploration — 22 October 2026

Commit `1213bea` fixes departed bot seats showing **Bot playing**: while the game continues, the owned-table dock now says **Left table**, and completed games retain **Results**. Commit `90d18d0` also makes the arena action API select exact labelled controls, avoiding confusion between Blockly text and form dropdown labels.

The corrected game build is deployed in the isolated local arena, and the overseer runs the selector correction. The separate phone-playtest stack was not rebuilt. TypeScript, formatting and all 113 unit tests passed.

Fresh session `83b14ddb-b57b-45dd-a573-5c388bff0fe4` started from clean source at `90d18d0`. Ada4, Bert4 and Cora4 used the actual bot maker's block controls and UI publication flow. No custom workspaces or publication payloads were injected.

## Custom strategies

Ada built a round-threshold bot, `a419710a-ed0a-4afa-87bd-7dc67e0d3fa3`, from the conditional scaffold: changed the observation to round number, removed a move operand, changed the comparison to greater-than-or-equal, and connected a new Number block with value 3. Practice returned Cooperate at round 1 and Betray at rounds 3 and 5. During construction, validation reported incompatible equality values and then the missing RIGHT input; errors cleared after the correct connection.

Cora built QuarterChance, `7370e64d-3a70-4891-b7ef-650254c2bde2`, by changing the seeded-random comparison threshold from 0.5 to 0.25 through the Number block controls. The published value survived reload. Practice at rounds 1, 4 and 9 with different opponent histories returned Cooperate for the fixed practice random sample; temporarily setting the threshold to zero exercised Betray, then she restored 0.25 before publication. Practice does not expose seed selection, and these few samples are not a statistical probability test.

Bert built a 12-block memory strategy, `7df654c6-c10d-45a4-9d51-070bf9a93207`, through editor controls: declare `turns = 0`, remember `turns + 1` before each decision, cooperate while `turns < 4`, otherwise betray. Independent practice scenarios both incremented from zero to one and cooperated, correctly demonstrating that a private practice decision starts fresh rather than carrying memory between practice clicks. Live games test the separate persistent memory path.

## Live strategy verification

The shared five-round match `ea1c2ba7-8843-435d-bccc-30a5f0011cdd` seated all three custom bots and the Clanker. Final scores: Ada 3, Cora 5, Bert −5, Clanker −2. Every seat had zero timeouts, and no visual execution errors were recorded.

An independent read-only audit compared durable moves and decision traces with each custom strategy:

| Bot | Actual moves | Additional evidence |
| --- | --- | --- |
| Round threshold | `CCDDD` | Switch occurred precisely at round 3 |
| Memory counter | `CCCDD` | Each trace incremented `turns`; final stored value was 5 |
| 25% probability | `DCDDD` | Reconstructed the random sequence backward from its stored final state; each move matched the 0.25 comparison |

This validates the observed seeded-random decisions, not the long-run statistical distribution. Canonical payoff recomputation, pair coverage, persisted result counts and all 20 moves also passed the separate game audit.

## Departure label and fresh memory

Second match `a0b81e8e-e81b-4418-b432-cf4c162a323b` ran ten rounds of probability versus memory. The counter restarted at zero, made `CCCD`, and stopped at stored `turns = 4` after Bert deliberately left. Cora continued with `DDDDCDCDCD`; independent random replay matched all ten decisions. The six later Cooperate defaults for the abandoned seat were expected consequences of the departure probe.

The dock immediately showed **Left table**, retained that label after reload and re-entry during round 6, and changed to **Results** at completion. Root visually inspected the reload evidence; Ada and Cora independently confirmed the departed roster and subsequent automatic outcomes. The original issue `458e1602-0021-4990-8d65-da43805ccf70` is resolved.

Evidence includes `feb390a9-dfdd-4860-844c-286400091073-bfc9095e-8177-4483-84bb-15d197cfbeaa.png` after reload and `feb390a9-dfdd-4860-844c-286400091073-9508eeee-c9f5-49fb-a4ba-e566dcca997b.png` at Results.

Final pair scores were Cora 20, Bert −10. Both completed games passed independent payoff, score, pair coverage, result and move audits: **15 rounds, 20 pair results, 40 moves**. All 29 executed visual decisions were accepted with no execution errors; continuing bots had no timeouts. The custom-program audit additionally verified choice sequences, memory persistence and fresh-match reset, and both probability sequences against the durable random state.

## Findings and retained evidence

No new confirmed game or editor defect was found in this pass. Observed temporary validation errors were expected during incomplete block construction and cleared after valid connections. Initial controller failures caused by shell interpretation of opaque Blockly IDs were resolved by safe direct argument passing or selecting options through keyboard controls; they are retained as controller failures rather than game findings. The exact-label selector correction was exercised successfully by practice dropdown actions.

All three synthetic players are closed, and the session is marked passed. The isolated arena, persistent database and overseer remain running. Evidence is retained locally under `data/arena/83b14ddb-b57b-45dd-a573-5c388bff0fe4/`: screenshots, action events, browser traces, `report.json`, `independent-audit.json`, `custom-bot-audit.json` and `bot-evidence.json`. Local read-only audit helpers are preserved alongside the arena evidence.

This was focused desktop bot-maker and multiplayer exploration, without microphone, touch or physical-device tests. It is not exhaustive coverage of every possible block graph or strategy.


## Further stress exploration

A subsequent session tested larger nested programs and two 50-round games, finding two game-interface usability problems and a separate harness limitation. See the [complex bot stress report](arena-complex-bot-stress-2026-10-22.md).
