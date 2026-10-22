# Complex bot maker stress — 22 October 2026

Session `9dde9bd3-808a-42a1-ab30-9e98b848b6f4` began from clean source at `6545dc5` in the isolated local arena. Three independent agents built larger strategies through the actual editor controls, practised decisions, recovered from invalid inputs, published and reloaded them. Workspaces and publication payloads were not injected. Existing game data and evidence were preserved.

## Built strategies

| Agent | Bot | Blocks | Revision 1 behaviour |
| --- | --- | --- | --- |
| Ada5 | Adaptive Accountant, `bb8a7828-2a62-475b-80d1-8fcc6dff14b6` | 21 | Betray after this opponent's last betrayal; otherwise betray when behind on score; otherwise betray if this opponent has betrayed at least twice and round ≥10; cooperate otherwise |
| Bert5 | Delayed Alternating Grudge, `aa4705bb-361c-4fb9-bb8e-e358f94ade72` | 22 | Increment numeric `turns`; set boolean `hot` to `turns > 5 AND NOT hot`; betray when hot or after this opponent betrayed, otherwise cooperate |
| Cora5 | Adaptive Gamble, `c76cbcc8-2d35-432b-ba89-1369251f7591` | 19 | After this opponent betrayed, cooperate when random <0.1; otherwise cooperate when random <(0.75 − own score); betray otherwise |

Block counts were independently read from the published workspaces. Cora's score-derived threshold deliberately permits values outside [0,1], yielding deterministic choices in those contexts; that is a property of the authored policy rather than a probability-validation defect.

## Editor and validation probes

- Incompatible statement/value connections were rejected, and occupied connections disabled Add and connect.
- Missing inputs produced guidance naming the required connection; valid reconnection cleared the error.
- Move-valued observations in numeric comparisons/subtraction produced numeric-type guidance and recovered when restored.
- Invalid memory names and inconsistent memory type/initial value were rejected; corrected declarations could be published.
- Rounds 51 and 50.5 were rejected with the whole-number range 5–50 guidance. Creation at 51 was confirmed disabled, and restoring 50 allowed creation.
- Published nested programs survived reload. Practice exercised available last-move/round inputs; score and accumulated encounter counts are not configurable in this practice UI and are checked through live-game replay instead.

These were expected validation outcomes. Agent action timeouts caused by deliberately clicking disabled controls are retained in the event history and are not classified as game defects.

## New finding: inaccessible earlier decision feedback

Usability issue `2c71dbef-9dd0-49fa-86ef-f168349d35fe` records the bot feedback panel's hidden five-decision window. At round 28 it showed only rounds 28–24, with no disclosure of that limit and no older-history route. Earlier observations at rounds 12 and 19 showed the same behaviour. Screenshot `66f5200f-2b37-4bae-943f-b705a2486649` is retained in the run evidence.

Root source inspection corroborated the reproduction: `components/YardMatchPanel.tsx` renders `feedback.slice(0, 5)`, while the owner-only server endpoint returns up to 50 decisions. Durable execution records remain intact; this is a review/debugging limitation, not scoring or memory corruption.

## New finding: invalid practice inputs leave a stale result

Usability issue `a1665e61-8964-48ce-9f00-c0326e4dd324` records practice rounds 0 and 1.5 being submitted, producing only **Visual decision failed**. After a successful preview, the old **Chooses Cooperate** result and trace remain visible alongside that failure, without identifying which input produced them. Restoring round 1 succeeds and clears the error. Expected behaviour is field-specific positive-whole-number guidance and either cleared or clearly labelled previous results after failure.

Evidence includes Cora screenshots `ba1376a4-b926-4c9f-821d-4d7346131300` (round 0), `2830e65a-18fb-4306-9cba-c72ea88229e9` (fractional round and stale result), and `a225135a-b5d1-4d70-ad6b-08623997450e` (valid-input recovery). Practice round 51 succeeded; that outcome is not counted as a defect.

## First long game

Match `cd52f181-4a89-4791-afde-61dd333a1353` completed all 50 rounds with the three revision-1 bots and Clanker. Scores: Ada −29, Bert −39, Cora −33, Clanker −41. Every seat had zero timeouts. The canonical payoff/score/pair/result/move audit passed all 100 pair results and 200 moves.

All agents published revision 2 while revision 1 was playing: Ada changed the late-round threshold 10→20, Bert changed the memory gate 5→2, and Cora changed post-betrayal cooperation 0.1→0.9. Existing seats continued executing their frozen original programs. Independent replay verified every one of the 150 visual decisions against revision 1, reconstructing each round's scores and revealed history for its current opponent. Final Bert memory was `turns = 50, hot = true`, matching replay. Cora's random decisions were replayed from the durable random state.

Both branches of every Ada decision and Bert's main choice were exercised. Cora's betrayal-history branch exercised both random outcomes; the other random branch was always false in this game, with its true outcome separately observed in practice.

## Controller interruption

Several Windows-to-WSL command launches intermittently timed out with `Wsl/Service/0x8007274c`. Direct Windows HTTP checks showed the overseer remained responsive, and the completed game had no bot timeouts. Agents switched to Windows Node invoking the same existing local helper through the WSL filesystem path. No game, database, Docker or WSL service restart was performed. These launch failures are controller/infrastructure limitations, separate from the two confirmed game-interface findings.

Harness issue `5885b70f-ddbc-4c3b-9fb5-89e7f31c7bb3` is recorded separately as needs-triage: exact-label select actions require the full observed label where wrapped HTML labels include changing option text. Short `Enter as` timed out; the full observed label succeeded. The exact-label change avoids Blockly SVG ambiguity, but its handling of these wrapped labels needs refinement. The workaround allowed continued play; this is not counted as a game defect.

## Revised 50-round rematch

Match `98e7d8e5-e689-4349-834e-3e8b26f5909a` used all three revision-2 programs plus Clanker for another complete 50 rounds. Final scores: Ada −2, Bert 7, Cora −1, Clanker 5. All seats again had zero timeouts.

The independent replay matched every decision and final memory, including fresh initial state and the changed policies. Bert finished with `turns = 50, hot = false`, contrasting with revision 1's true value as expected from the changed gate. Every authored if/else took both branches in the rematch, including both of Cora's nested random decisions. These are observed branch outcomes, not an exhaustive test of every Boolean operand combination or every possible graph.

Agents also opened the first game's results while the second was active, then returned through My table. Each route restored the correct game's scores and private feedback without old-round state leaking into the active game. The latest-five feedback limitation persisted and remains open.

## Final audit and evidence

| Match | Rounds | Pair results | Moves | Audit |
| --- | --- | --- | --- | --- |
| Revision 1 tournament | 50 | 100 | 200 | Pass |
| Revision 2 tournament | 50 | 100 | 200 | Pass |
| Total | 100 | 200 | 400 | Pass |

All 300 visual-bot decisions were accepted with no execution errors. Canonical payoff recomputation, accumulated scores, complete pair coverage, player history, durable results and exact move counts passed. Separate replay reconstructed round number, current scores and revealed encounter history for each current opponent, then checked moves, memory and random-state evolution against the frozen program. All six seated versions passed.

The two game-interface findings remain open in the persistent overseer ledger, alongside the separately classified harness issue. No scoring, strategy-execution, memory or frozen-revision fault was found in these runs. This session is marked failed to reflect the findings, despite passing game and replay audits.

All three synthetic players are closed, and browser traces are saved. The local arena, database and overseer remain running. Evidence is retained under `data/arena/9dde9bd3-808a-42a1-ab30-9e98b848b6f4/`: screenshots, action history, browser traces, `report.json`, `independent-audit.json`, `complex-bot-audit.json` and `bot-evidence.json`. Read-only audit helpers are retained locally alongside the arena evidence.

No game source was changed during this exploratory pass. It covered substantially more complex authored programs and maximum-length games, but did not exhaust the editor's 512-node program limit, all possible block graphs, or physical-device/microphone/touch behaviour.


## Follow-up

Both UI findings and the harness selector issue were fixed and independently verified with another two 50-round complex-bot games. See the [stress fix verification report](arena-stress-fix-verification-2026-10-22.md) for the fixes, audits and newly discovered overflow diagnostic issue.
