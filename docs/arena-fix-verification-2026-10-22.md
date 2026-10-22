# Arena fix verification — 22 October 2026

All six findings from the [first agent exploration](arena-exploration-2026-10-22.md) are fixed in commit `55301b7` and independently verified. The corrected build is deployed in the isolated local arena. The separate phone-playtest stack was not rebuilt.

## Verification

TypeScript, formatting and all 113 unit tests passed. Live regression run `989136ca-f7e4-4283-a128-3e005dd2fd04` passed the six original reproductions and authenticated owner-history isolation.

Fresh agent session `5c871fa4-c2b3-4a34-8310-083f25e1b2d9` used three independent controllers, Ada2, Bert2 and Cora2, against clean source at `55301b7`.

| Original finding | Independent result |
| --- | --- |
| Inspecting an empty circle loses owned bot controls | My table and private bot controls remain reachable |
| Editor/reload loses current game and completed results | Editor return, reload, recent results and current-table priority pass |
| Invalid rounds expose INVALID_PAYLOAD | Actionable field guidance; invalid creation prevented |
| Busy challenge exposes CAPACITY_FULL | Clear occupied-circle explanation |
| Active Clanker says not ready | Playing/finished status follows match phase |
| Timeout Cooperate looks like a deliberate choice | Automatic Cooperate and missed-deadline feedback shown |

All six original ledger issues are resolved with verification references.

## Further play

| Match | Players | Rounds | Audit |
| --- | --- | --- | --- |
| `62e2651f-7410-4410-837c-5ad364e4e520` | Two visual bots, human, Clanker | 5 | Pass |
| `404d70a6-f05b-4adf-acfd-fe53d8f276e9` | Two humans | 5 | Pass |
| `3b3a21c1-9bb0-48ee-ab6b-05600dd127fa` | Three visual bots, Clanker | 20 | Pass |
| `b5007d6f-2c6b-431c-9676-4ca97b215be3` | Two humans | 5 | Pass |

An independent database audit checked canonical pair payoffs, score sums, pair coverage per round, persisted move counts and player history/results: all four games passed, totalling 35 rounds, 60 pair results and 120 moves. Bots had zero timeouts. Human timeouts included deliberate probes and controller overhead at short deadlines; the UI identified them explicitly.

Agents also verified frozen deployed bot revisions after publishing a replacement, duplicate-bot seating rejection, personal seating alongside a deployed bot, a custom Tit-for-tat bot with memory configuration, and opening old results while retaining access to a current human game. The memory counter's increment behaviour was not separately verified.

Owners held bot games and waiting human seats at separate tables concurrently. Simultaneous collecting rounds across two games were not achieved: the bot game finished before the second human game started.

## New finding

Open usability issue `8e744b74-e4e9-4dd5-baed-5ffd6e2b4ec8`: when watching another table, opening and closing Chat leaves only the owned My table shortcut. Returning to the watched table requires inspecting its circle again. Owned-game access remains correct, and no scoring or game-state corruption was observed. Screenshots and reproduction steps are retained in the persistent overseer ledger.

A separate harness limitation appeared in Blockly practice: a nonexact label selector matched both Blockly SVG labels and the actual practice dropdown. The agent completed the action through an exact combobox interaction. This is not counted as a game defect.

## Evidence and scope

Evidence is retained locally under `data/arena/5c871fa4-c2b3-4a34-8310-083f25e1b2d9/`, including screenshots, action events, browser traces, `independent-audit.json` and `report.json`. The session outcome is failed because it found the new open usability issue; all six fix checks and the scoring audit passed. The local database and overseer remain available, with persistent history preserved.

This was desktop multiplayer and bot exploration. Microphone, touch, physical devices, exhaustive league coverage and prolonged soak testing were outside this session.
