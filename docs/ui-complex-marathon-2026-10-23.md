# Redesigned UI and complex-bot marathon — 23 October 2026

Exploratory session `59d72534-7610-4f2f-9297-b73594018338` runs against the final approved UI build `b92f0df`, with clean documentation revision `03c9cdb`. No source fixes, restarts or deployments are made during exploration. The laptop's persistent isolated arena database and existing evidence storage are retained.

Three fresh agent players build materially different complex bots using actual maker controls, rather than injecting workspace JSON or publication payloads. The planned sequence is two maximum-length 50-round games, publishing revised strategies during the first and deploying them in the second. Separate overseer layout scouts exercise keyboard and responsive behaviour without joining games.

## Responsive and keyboard probe

Build/Test/Summary keyboard navigation using ArrowRight, End and Home passed at 1440×1000, 768×1024, 390×844, 320×740 and 844×390. The checked workshop/header/publication/editor containers remained within viewport bounds. Evidence: `responsive-keyboard-probe-summary.json` and the scout screenshots in the run directory. This verifies emulated browser geometry and keyboard interaction, not physical touch or microphone behaviour.

Issue `fb4a7e45-c537-4567-8235-f3f40ae6accd`: the Blockly toolbox keeps the orientation chosen at initial injection after viewport/breakpoint changes. Loading at desktop then narrowing to 320px retains the vertical left toolbox and clips the initial graph into a narrow workspace; a fresh 320px reload uses a horizontal toolbox and fits the graph. Expanding a narrow-loaded page back to desktop retains the horizontal toolbox. The source calculates `horizontalLayout` only at initial injection, while its ResizeObserver only resizes SVG. This is a responsive usability finding, with no observed page overflow or bot execution failure.

Comparison screenshots:

- Desktop-loaded then narrowed: `9bdb1e5a-f70d-4a27-a159-6e1e37cbeef0-b93d3176-f0aa-4fda-bb7b-0422b94a0150.png`.
- Fresh narrow reload: `0320e832-607a-44d2-ba54-df7836fe75a4-42e14214-60e4-470e-a251-2c15caf4f5bc.png`.
- Narrow-loaded then expanded: `0320e832-607a-44d2-ba54-df7836fe75a4-0db2d121-253f-4d9c-8f80-5bd4486223a2.png`.

These are under ignored `data/arena/59d72534-7610-4f2f-9297-b73594018338/` in the source repository.

## Fresh strategies and editor probes

- Ada9 Layered Accountant, bot `8c9db9cf-c55d-45cd-bc90-589decad391f`, 26 blocks: after this opponent betrayed, betray only when their betrayal count >1, otherwise forgive with C; otherwise betray if opponent score minus own score >2; otherwise betray after round >(20+5), cooperating otherwise. Revision 2 changes 20 to 35, making the late cutoff 40.
- Bert9 Score Grudge, bot `d83297a2-241e-43b7-a466-0d68abe08da9`, 26 blocks: increment `turns`; set boolean `hot` to `(ownScore < opponentScore) OR NOT hot`; betray when `hot AND (opponentBetrayalCount >=2 OR turns >8)`, otherwise cooperate. Revision 2 changes the turns gate from 8 to 16.
- Cora9 Conditional Lottery, bot `4121d203-f8a6-4824-9569-4dd0fa683a7d`, 29 blocks: after last opponent D, compare scores; while behind cooperate when random <0.8, otherwise random <0.2. With no last D, cooperate when random <(0.6 - opponentBetrayalCount); choose D on false branches. Revision 2 changes the behind-forgiveness threshold from 0.8 to 0.4. Exactly one random sample is consumed on every path.

Ada confirmed an incomplete missing-THEN draft survives reload and can be repaired. Bert's duplicate-memory-name, undeclared-read after rename, numeric/boolean type mismatch and incompatible connection probes were rejected; he restored a valid draft each time. Cora checked invalid practice round guidance and recovery. A click attempt on a disabled Test button during negative validation is driver evidence of rejection, not a game failure.

All three authored revisions through the controls and published from Test or Summary as well as reloading the saved graph. Cora temporarily edited an observation block to exercise a behind-score practice branch because the practice scenario fixes scores to zero; that temporary probe was never published and the original score observation was restored before revision 2. This is a practice-scenario coverage limitation.

## First long-game audit

Match `db4166f6-f02b-4782-9a6d-f175e632b4f5` completed all 50 rounds with Ada -6, Bert -10, Cora -10 and Clanker -4. All 200 moves and 100 pair results passed the canonical audit with zero timeouts. Independent replay matched all 150 visual decisions, final memory and RNG state. Every conditional branch in all three programs took both true and false paths in live play.

Agents opened round-one private feedback and public revealed results while live rounds continued, expanded history, and round-tripped through Tables, People, Chat and the workshop to the owned table. Published revisions remained separate from the running strategy, to be checked against pinned versions in the final audit.

## Final audit and outcome

| Match | Version | Ada | Bert | Cora | Clanker |
| --- | --- | ---: | ---: | ---: | ---: |
| `db4166f6-f02b-4782-9a6d-f175e632b4f5` | R1 | -6 | -10 | -10 | -4 |
| `042ff109-92ad-4f1b-b33c-af15ed034956` | R2 | -7 | -6 | -9 | -4 |

Both maximum-length games completed with all four seats active and zero timeouts. Canonical audits passed 100 rounds, 200 pair results and 400 moves, recomputing payoffs, final score totals, round pairing coverage and one persisted move per seat per round. All 300 visual decisions were accepted with zero execution errors. Independent replay passed all six seated strategy versions, matching every move, Choose trace and final memory/RNG state. Every conditional branch took both paths in each game. Bert's second-game round 1 reset to turns1/hottrue; both games ended turns50/hottrue.

Revision-1 versions remained pinned in game one after owners published revision 2. The rematch seated all three revised versions. History reset to the new match, expanded to all 50 decisions, and continued updating while open. Returning from old final results, Chat, People, Tables, an empty-circle inspector, the workshop and a page reload restored the correct owned match. The existing Enter yard step remains part of re-entry.

One possible feedback-count transition was observed once when Bert switched from the live rematch to first-game results. A normal repeat did not reproduce it, and the correct old 50-decision trace subsequently loaded. It remains an unconfirmed observation, not a counted defect or claim of corrupted state. No delayed-network reproduction was performed. The component already clears feedback on match/seat changes and fences callbacks from stopped effects, but this does not by itself disprove a brief render transition.

The one confirmed new finding is `fb4a7e45-c537-4567-8235-f3f40ae6accd`, the responsive toolbox orientation issue. It remains open; no application fixes were attempted in this exploratory session. The prior nonfinite-number diagnostic finding `c7cc4ecc-c451-450d-8e49-5f268cd689b4` remains open separately and was not duplicated. No other new confirmed maker or gameplay failure was found.

The session outcome is failed because the new UI finding remains open; the gameplay, scoring and strategy audits passed. All three agents and two short-lived layout scouts are closed after evidence capture. Persistent local evidence includes `independent-audit.json`, `bot-evidence.json`, `complex-bot-audit.json`, `responsive-keyboard-probe-summary.json`, screenshots, browser traces and `report.json` in the run directory. No database reset, volume removal or deployment occurred.
