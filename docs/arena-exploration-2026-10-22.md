# Parallel-agent exploratory playtest — 22 October 2026

Three independent Codex agents controlled Ada, Bert and Cora in the local arena, sharing run `b60d14ab-6f29-48cc-bc93-5e46b647fc24`. They coordinated with one another, chose actions through the game UI, published strategies, played matches and reported problems. The root overseer observed without controlling their players and independently audited durable results. This was exploratory play, not another execution of the scripted arena scenarios.

The arena used its own persistent `soap_arena` database. No game code, production data, Docker configuration, microphone or device settings were changed. Tested source checkpoint: `1936e6e8597da8167b77c82b7eac3e72ebfc259e` (clean checkout at session start).

## Findings

| Priority | Finding | Ledger issue |
| --- | --- | --- |
| P2 | Inspecting an empty circle removes access to the current owned bot match | `c34bece4-1f75-47cf-b3fa-9377e9e4fde7` |
| P2 | Editor/reload navigation loses the current-match shortcut; completed results have no obvious return route | `02bab6a0-025a-4d73-ba65-b68a8b252f9e` |
| P3 | Invalid match settings produce raw `INVALID_PAYLOAD` instead of field guidance | `ce71336d-609b-4375-b420-1ba3a2fa030d` |
| P3 | A challenge while busy reports unexplained `CAPACITY_FULL` | `afd8afdb-5084-43b4-8942-e5937dd9d604` |
| P3 | Active system Clanker is labelled “not ready” | `52506a30-428b-45d8-ad1b-6cd9b1acf8df` |
| P3 | Timeout Cooperate is presented like a player-submitted choice | `b3003d18-0376-48f1-8d28-13530f4166d0` |

P2 means a normal player flow loses an important control or result route, with a workaround. P3 means confusing feedback or presentation. These priorities are overseer triage, not additional test outcomes. All six findings remain open; no fixes were made during this session.

### Inspecting another circle loses the active table

While Cora's visual bot was playing at Machine Therapy, Cora walked to Snake Pit and inspected its empty circle. Merely inspecting removed My table and the owned-bot controls; no create/join attempt was required. The original match continued server-side. Inspecting Machine Therapy and choosing Watch restored owner feedback.

The root overseer visually checked the before/after screenshots and inspected the implementation. `inspect()` in [the yard page](../app/yard/page.tsx) clears `matchRef` and `match` for an empty circle. The same state currently represents both the inspected/watched match and access to the owner's game. This explains the observed disappearance without requiring bot-state corruption.

Evidence in the run directory:

- Before: `a79d6fc6-d3f0-4c5e-bdbf-3b9103bb25d8-6817be0e-6b6a-4c63-96c4-617c58ea0931.png`
- After: `a79d6fc6-d3f0-4c5e-bdbf-3b9103bb25d8-8aa57568-3104-4dec-9900-a32a4dddbd53.png`

### Leaving the yard loses match navigation

Bert followed Edit for the next game while a bot match was active, returned to the yard and entered again. My table was absent until Bert manually located the original circle and watched it. Ada independently saw similar recovery behaviour after reloading a human game. When the match had already finished, the circle was empty and the agents could not find a visible history/results return route.

The bot-editor return URL carries a bot identifier but not the match identifier. Yard match association lives in the mounted page. The persisted result remains intact; a known `/yard?match=UUID` link can recover it, but that is not a discoverable player workaround.

Evidence: Bert's missing shortcut screenshot `4d94f564-88d7-4599-bae6-038ad5d5f0c0-bb0aa8f4-b8b1-4956-9a23-795ce8c84406.png`.

### Error and status feedback

Cora entered Rounds=3 and Seats=3, then submitted Create. The server correctly rejected the settings because rounds must be at least five, but the UI displayed only INVALID_PAYLOAD. The root visually checked screenshot `a79d6fc6-d3f0-4c5e-bdbf-3b9103bb25d8-dabc0a9b-76e4-4d72-9618-9bdaa40885d4.png`, showing the invalid value and raw error together. Correcting rounds allowed creation.

Challenges issued while the human entrant was already occupied were also safely rejected, but the raw CAPACITY_FULL label did not explain the busy-player condition. By contrast, a second-table bot-entry attempt returned an explicit active-seat-limit explanation. Those server limits behaved correctly.

The mixed game's automatically inserted Clanker played and scored correctly, yet Players & scores displayed “not ready” during active play. Human deadline misses correctly became Cooperate, but the results did not distinguish these from submitted Cooperate and did not show the available timeout count. Several human timeouts were deliberate or caused by agent navigation/tool delays; the timeouts themselves are not a game defect.

## Explored successfully

- Visual publication of Ada's Tit-for-tat, Bert's Betray and Cora's Random strategies through the real builder.
- Bert publishing a Cooperate revision during the first match: the old seated revision stayed frozen, while the next match used the new revision.
- A two-bot match, a three-entrant mixed match with an automatically added Clanker, and a final lobby host-transfer bot match.
- Spectating and returning to owner feedback, bot-owner roaming/chat, capacity/admission rejection and readiness reset on seat changes.
- A ready/unready action racing with Start: stale state was rejected without starting an inconsistent game.
- The original host leaving a waiting room: the remaining owner gained Start, the departed owner lost private/host controls, and a joining player did not gain Start.

## Evidence and limits

The persistent issue ledger, action events, screenshots, browser traces, observation log, final report and independent audit are in `data/arena/b60d14ab-6f29-48cc-bc93-5e46b647fc24/`. The live local overseer is http://127.0.0.1:3146. Private session files and traces stay local.

Independent audit recomputes each pair's payoff, sums each seat's score, checks that every seat is paired once per round and has one persisted move per round, and compares public history with durable result counts. This does not prove every bot program or league/external-client scenario. A dynamic accessible-name mismatch in the arena control helper caused some agent navigation delays; that is a harness limitation, not a broken game button.


## Final outcome

All three games completed. The independent audit passed **20 rounds, 30 pair-results and 60 persisted moves**, with no score/pairing duplication found. Both autonomous visual-bot entrants had zero timeouts in every completed game. The mixed human entrant had six deadline defaults, including deliberate timeout checks and navigation/tool delays; these are not reported as bot or server failures.

The session is marked `failed` to flag the six open product findings, not because a game crashed or the audit failed. All three player contexts have been closed and their traces saved; the arena/overseer remain running and all database history is preserved. The final JSON report includes the run, players, all383 events, issue occurrences, game image identity and independent audit. No game or harness source changes were made during exploration.
