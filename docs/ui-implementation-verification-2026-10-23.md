# Approved yard and workshop implementation — 23 October 2026

The approved interactive mockup is implemented in `751a4cf`, with visual polish in `56127b3`. The original Phaser courtyard, striped prisoners, scenery, collision and movement remain intact. The redesign changes the surrounding interface rather than replacing the illustrated world with abstract avatars.

## Interface

- Compact yard branding and navigation lead directly to the bot workshop and retain a route back to the owned match. The table panel provides My table, Find a table and a separate watched-table shortcut. Existing spectator and owner-table state remain distinct.
- Current round, phase and decisions appear before secondary information. Scores, History and Payoffs shortcuts open the relevant sections. Public history contains only already-revealed results; private bot traces remain restricted to the owner's visual seat. Noodle payoffs match the existing engine.
- The workshop has global name, revision and publication controls, and keyboard-accessible Build, Test and Summary tabs. The block editor stays mounted across tab changes. The dark workspace has a subtle grid; the existing block controls and supported operations remain available.
- Practice keeps its existing round validation, preview clearing and delayed-response protection. Publishing retains the existing version-pinning semantics. The agent harness supports the real tab role.
- Responsive styles keep the yard as a bounded viewport with a contextual panel, rather than a document that must be scrolled to find the map. The workshop stacks appropriately on narrow screens.

## Verification

All 114 unit tests, TypeScript and formatting checks passed. Browser regression `347cdb19-e558-45b2-95e6-edca2de05193` passed on the first deployed build: tab visibility and draft/result preservation, invalid practice guidance, stale-response rejection, history expansion/collapse, desktop overflow and 390×844 yard bounds and action visibility. Its 12-round game `9ab0357b-1837-4490-8123-195b5288b518` completed.

Independent agent session: `e80262d0-1b4c-4534-a0b3-f8e11a018d4b`. Agents author fresh custom strategies using the actual maker controls and exercise the redesigned navigation in real local games.

Screenshot review found desktop navigation stacking and low contrast on the selected table dock. The prepared polish corrects both. The block selector punctuation was accidentally re-encoded during the theme edit; the polish restores the intended separators and ellipsis. Agent finding `02866744-4d1c-4b66-ac39-d151dcff24a1` records this for post-deployment verification.

All testing uses the laptop's isolated persistent arena database. No database reset, volume removal or remote deployment is part of this change.

## Independent play results

| Game | Rounds | Ada | Bert | Cora | Clanker |
| --- | ---: | ---: | ---: | ---: | ---: |
| `574369bd-e8b0-48c2-8b99-043ed8822e44` | 30 | -8 | -4 | 16 | -3 |
| `8fe564e9-b37a-47a5-bcee-e9270e8fc082` | 5 | 1 | 2 | -2 | 4 |

Ada built a fresh 17-block nested history/score bot (`cb1828d8-308e-403c-94e5-ae28e82ddaf7`): retaliate to this opponent's last betrayal; otherwise cooperate while own score <10; otherwise betray if the opponent's score is greater, cooperating otherwise. Revision 2 changes 10 to 20.

Bert built an 18-block two-memory policy (`3ece6f0a-c54c-4c50-99ec-52398768ed2a`): clock +=4, toggle flip, betray if flip AND clock >12, otherwise cooperate. Revision 2 changes the gate to 4.

Cora built a 19-block stochastic/history/score policy (`120fcdd5-bd16-4c5e-befd-c6ab7e7e6b32`): after opponent betrayal cooperate when random <0.25; otherwise cooperate when random <(0.65 - own score), betraying on false branches. Revision 2 changes 0.25 to 0.75. Every path samples random once.

All three bots were made through actual editor controls, practised, published and reloaded. Build/Test/Summary preserved the mounted draft, and Test retained its result through a Summary round-trip. Publish worked from Test and Summary. All three owners published revisions during game one; its original versions stayed pinned. The second game used Bert and Cora revision 2, while Ada entered as a human and explicitly chose C/D/C/D/C. Since bots had already locked, these human choices immediately completed collection and revealed the round; this setup did not exercise a persistent waiting-after-lock state.

Independent audits passed 35 rounds, 70 pair results and 140 persisted moves. All 100 custom-bot decisions were accepted, with zero execution errors or timeouts. Five strategy-version replays matched every move and final memory/RNG state. Bert's round-3 trace changed from clock12/fliptrue/conditionfalse/C in game one to conditiontrue/D in game two, proving the revision change in actual play.

Agents verified private round-one feedback, public revealed round history, payoff values, Chat/empty-circle/old-results return to the current owned table, corrected header layout and selected dock contrast. Returning from the workshop still uses the existing Enter yard admission step. A few controller action timeouts recovered after observation; the planned between-game deployment briefly produced reconnect/502 responses. Neither was reported as a game-engine defect.

The selector-encoding issue was independently rechecked after deployment and resolved with screenshot `a9649427-65d0-49a3-bda1-f52be7d8f146`. No new unresolved issue was confirmed during this UI session. The earlier nonfinite-literal diagnostic issue `c7cc4ecc-c451-450d-8e49-5f268cd689b4` remains outside these layout changes.

The final contextual-button styling is committed as `b92f0df`; it is applied after the agents finish so their games are not interrupted. Evidence is preserved under ignored `data/arena/e80262d0-1b4c-4534-a0b3-f8e11a018d4b/`, including independent-audit.json, bot-evidence.json, complex-bot-audit.json, screenshots, browser traces and report.json. The run is passed and all three player contexts are closed. The arena is the deployed local target; the separate, stopped phone-playtest stack was not started or rebuilt. No microphone or physical-touch checks are claimed.

## Final checkpoint

Final deployed build `b92f0df` passed the browser regression again in run `3c4407d7-3cf8-4cf5-8d3e-a8b296ab366c`, including its real 12-round game `56a89f21-6aae-4c94-bc37-9f1e2a680060`, desktop workshop checks and 390×844 yard controls/history bounds. Final TypeScript and formatting checks passed. The eleven automatic HTTP 502 findings in the independent run were tied to the two planned post-game container replacements; they are dismissed with deployment context while retaining the evidence. Service health and later tests passed.
