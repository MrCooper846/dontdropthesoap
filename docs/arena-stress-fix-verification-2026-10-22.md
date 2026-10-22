# Stress-finding fixes and independent re-verification â€” 22 October 2026

Commit `a1d73c8` addresses the two UI findings and harness selector problem from the [complex-bot stress session](arena-complex-bot-stress-2026-10-22.md). Test-driver pacing is committed as `28ab4d2`. The corrected game build is deployed in the isolated local arena, and the overseer was restarted before independent play to load the selector correction. The separate phone-playtest stack was not rebuilt.

## Changes

- Bot feedback discloses its displayed count and provides **Show older decisions** to reveal all recorded decisions, up to the existing 50-round maximum. **Show latest 5 decisions** collapses it. Changing the owned match/seat clears prior feedback and resets expansion.
- Practice requires a whole-number round from 1 to 50, with field guidance and disabled invalid testing. Results clear when the round, opponent scenario or workspace changes, and before a new test. A generation fence prevents a delayed response from repopulating results after an input edit.
- Harness select actions intersect labelled matches with real dropdown roles. Stable short labels work even when wrapped labels include option text, and Blockly SVG labels are excluded. Ambiguous duplicate controls still fail strictly.

## Automated checks

TypeScript, formatting and all 113 unit tests passed. Browser regression `6484d61a-0879-4b39-ae39-6bfbbc78526f` passed:

- Dynamic wrapped labels, Blockly SVG label ambiguity and strict rejection of duplicate dropdowns.
- Invalid practice rounds 0, 1.5, 51 and empty input, valid recovery, and clearing on scenario/workspace edits.
- A deliberately delayed successful preview arriving after the round changed, which remained discarded.
- A real 12-round bot game, disclosed latest-five count, expanding to round 1 and its correct private trace, and collapsing again.

The initial driver run `92ec6362-a097-48b0-8e44-d75bab7fe7c8` correctly received HTTP 429 after exceeding two preview requests per second. The driver now waits 600 ms between practice submissions. Its ledger finding was dismissed with this explanation; the paced rerun passed. No rate-limit bypass was introduced.

## Independent agent session

Session `e7f9b0a9-96b0-4c53-a06c-f65dd26f3553` started from clean source at `28ab4d2`. Ada6, Bert6 and Cora6 use fresh identities and actual maker controls, not injected workspaces or publication payloads. Windows Node invokes the existing local helper through the WSL filesystem path, avoiding the previous session's intermittent WSL launch failures.

Cora independently verified invalid 0/1.5/51 guidance and disabled Test, valid round-1 recovery, and clearing after opponent/workspace edits. The original practice issue `a1665e61-8964-48ce-9f00-c0326e4dd324` is resolved with screenshots and regression references in the persistent ledger.

Bert independently verified both short **Enter as** despite dynamic option text and **Opponent last revealed move** amid an 18-block workspace. Screenshot `b6328022-7135-4b58-8cdf-3cc10f0efc1c` records the wrapped-label selection. The original harness issue `5885b70f-ddbc-4c3b-9fb5-89e7f31c7bb3` is resolved.

## Fresh complex policies

- Ada authored a 21-block score/history policy, bot `e91a429f-fd95-43d5-b595-2d3134301fd1`: when behind on score, retaliate only after this opponent betrayed; otherwise betray after at least two opponent betrayals or from round 15 onward, cooperating otherwise.
- Bert authored an 18-block two-memory pulse policy, bot `97f16d7f-30b0-4762-aef0-c6dc50f84fc9`: increment `clock` by 2, toggle boolean `flip`, then betray when `clock > 6 AND flip`, otherwise cooperate.
- Cora authored a 19-block nested probability policy, bot `15210bb1-023f-4873-8895-f082b6e7befb`: after this opponent betrayed, cooperate when random <0.2; otherwise cooperate when random <(0.6 âˆ’ own score), betraying on false branches.

Practice, invalid-input recovery, publication and reload were exercised through real controls. Cora's score-derived threshold can deliberately leave [0,1], producing deterministic decisions in those contexts rather than a validation fault.

During the first long game, Cora and Bert independently expanded feedback beyond five decisions and opened early-round traces while new rounds continued. Cora opened round 1; Bert opened round 3 and confirmed `clock = 6`, `flip = true`, choice C under the frozen original threshold despite having published a replacement. The original history issue `2c71dbef-9dd0-49fa-86ef-f168349d35fe` is resolved, with full-length and cross-game checks continuing.

## New diagnostic finding

Usability issue `da17f34b-cb86-4e58-a71c-4fb4497b49fc` records an unsaved private-practice overflow probe: initial `clock = 1e308`, increment `1e308`, valid round 1. The finite authored operands compile, but their sum overflows during execution and is safely rejected. On two attempts, the UI showed only **Visual decision failed**, with no overflow reason or block hint.

The prior successful preview was cleared, confirming the stale-result fix also holds on a real failed request. This new issue concerns a runtime diagnostic for valid-form input, rather than the now-blocked invalid-round submission. Bert did not publish the overflow draft; reloading restored published revision 2 (`clock += 2`) and the live match continued intact. Reproduction, repeat screenshots and recovery are retained in the ledger.

## First 50-round game

Match `14163a38-522c-4c7f-b1a0-0366c56f3a13` completed all 50 rounds with revision-1 bots and Clanker. Scores: Ada 9, Bert âˆ’46, Cora 15, Clanker âˆ’2. All seats had zero timeouts.

Canonical payoffs, scores, pair coverage, durable results and all 200 moves passed. Independent strategy replay matched all 150 visual decisions, memory and random state. Every authored if/else took both paths. Bert finished with `clock = 100, flip = false`, matching the two-memory policy.

All three agents expanded and opened round-1 feedback at the end, confirming access to all 50 recorded decisions. Final evidence includes Cora `06199521-7be5-4caf-b47d-9fef1380b8b3`, Ada `fb6f845f-a031-42d2-9bc1-36e3cc28c4a0`, and Bert `095943b2-f375-43e6-9fb7-03540106e349`.

While that game ran, each agent published revision 2: Ada's round threshold 15â†’30, Bert's clock gate 6â†’2, and Cora's post-betrayal cooperation threshold 0.2â†’0.8. The first game's pinned original programs continued correctly through completion.

## Rematch history reset

Second match `4f3b7dfd-d046-4887-a8b1-a3eda5f7739b` started with all three revision-2 bots and Clanker. Ada verified the previously expanded first-match history reset to the empty new-match view. Cora then explicitly reopened the first results, expanded all 50 decisions, and used My table to return to the active rematch. Only its new round-1 feedback appeared in latest-five mode, with no old round-50 state leaking across.

Several Windows controller requests returned transient fetch failures. Agents re-observed the UI before retrying navigation actions, then continued successfully without service restarts. These transport failures were not classified as game defects.

## Completed rematch and final checks

The revised rematch completed all 50 rounds. Scores: Ada 31, Bert 20, Cora âˆ’22, Clanker âˆ’1. All seats again had zero timeouts. Independent replay matched all choices, observations, memory and random-state evolution for the new versions; every authored if/else took both paths in each game.

Bert independently opened early and final traces: fresh round 1 had `clock = 2, flip = true`, round 3 chose D under gate 2 (where the original gate 6 chose C), and round 50 finished at `clock = 100, flip = false`. Ada and Cora likewise opened all 50 final decisions and early-round traces. All three independently passed the requested history, practice and short-selector checks.

| Agent games | Rounds | Pair results | Moves | Audit |
| --- | --- | --- | --- | --- |
| Original-policy tournament | 50 | 100 | 200 | Pass |
| Revised-policy tournament | 50 | 100 | 200 | Pass |
| Total | 100 | 200 | 400 | Pass |

All 300 live visual decisions were accepted with no execution errors. Canonical payoff recomputation, scores, complete pair coverage, stored history, result counts and exact move counts passed. The unsaved overflow preview probe is separate from these live-game decisions.

## Resolution and evidence

The two original UI findings and original harness selector finding are resolved in the persistent ledger. The new overflow diagnostic issue remains open. The agent session is marked failed to reflect that finding, despite passing the requested fix checks and game audits.

All three synthetic player contexts are closed and traces are saved. The isolated arena, persistent database and overseer remain running. Evidence is retained locally under `data/arena/e7f9b0a9-96b0-4c53-a06c-f65dd26f3553/`: screenshots, action events, browser traces, `report.json`, `independent-audit.json`, `complex-bot-audit.json` and `bot-evidence.json`. The automated regression's separate run and traces are also preserved.

Final screenshot examples include Bert `7b5ed81f-9a4b-4c88-bad6-5490423271a7`, Ada `ceab79cc-ecfc-4a55-aadc-146d808653f4`, and Cora `cad54da8-fdfd-4d1f-a0f3-e6eef369144b`.

This pass tested desktop editor and multiplayer workflows, not microphone, touch or physical devices, and is not exhaustive coverage of every possible block graph.


Follow-up: the arithmetic-overflow diagnostic is resolved in `6ba1a89`; see the [overflow fix and subsequent long-game verification](arena-overflow-fix-verification-2026-10-22.md).
