# Spectator navigation verification — 22 October 2026

Commit `14d8d5d` fixes issue `8e744b74-e4e9-4dd5-baed-5ffd6e2b4ec8`. The yard retains a separate watched-table snapshot and shortcut alongside the preferred owned-table shortcut. Both are refreshed while the player moves between panels or tables. A newly owned seat clears its duplicate spectator shortcut.

The corrected build is deployed in the isolated local arena; the separate phone-playtest stack was not rebuilt. TypeScript, formatting and all 113 unit tests passed.

## Independent verification

Fresh session `34635606-a083-498a-bf5a-a81eebccdb12` started from clean source at `14d8d5d`. Ada3, Bert3 and Cora3 each verified Chat → Close → Watching and switching between My table and Watching returned to the correct different matches. Ada additionally checked empty-circle inspection and repeated the reproduction during active games. The original issue is resolved in the persistent ledger.

Cora's screenshot `2a251ec7-75c0-44b7-aafd-334540a23756-9be06d62-3ed7-4dda-ab57-29ca1b57a8d1.png` shows both shortcuts after closing Chat. Ada's active-game evidence includes `ed59bf1c-ab78-42d0-a0b4-e3a3b2e71d76-81a652d2-1367-4d9b-b6b8-4299e66373a6.png` and `ed59bf1c-ab78-42d0-a0b4-e3a3b2e71d76-835114d4-17df-4cb3-a2a0-682954f253b3.png`.

The watched selection is retained for the mounted yard session. Returning from a full-page editor visit requires selecting the spectator target again; owned-game restoration continues to use server history. This pass did not add cross-page spectator persistence.

## Further exploration

The agents ran a human-versus-bot Noodle game and a bot-versus-bot Machine game concurrently, with Cora owning a human seat in one and a visual bot in the other. The root's saved observation at `2026-10-22T15:52:05.899Z` records Noodle collecting round 2 while Machine reveals round 4. Human-table priority and access to the other owned game through recent tables remained correct.

Bert left the waiting Machine host seat; host transfer and rejoining succeeded. During active play, he published a Cooperate replacement for his Betray bot: the seated revision remained Betray. Ada likewise published a Betray replacement for her mirror bot, while the seated revision continued its original Tit-for-tat decisions. Leaving an active bot seat marked it left, retained earlier feedback and applied automatic Cooperate for subsequent deadlines.

## New issue

Open usability issue `458e1602-0021-4990-8d65-da43805ccf70`: after Bert left the active Machine bot seat, My table still said **Bot playing**, although the roster marked the seat left and private bot execution feedback had stopped. This persisted after reload and re-entry. Screenshot `3ee45c9a-2bc3-452f-ba57-393b0ed4d6a4-3d47cf4a-ba53-43ca-a9d8-6085170a0327.png` and the reproduction are saved in the overseer ledger. This is a misleading status label; abandonment and scoring continued correctly.

Controller actions sometimes outlasted a human deadline or tried controls after a game had finished. Those selector timeouts are retained in the action history and are not counted as game defects. Cora's five missed human deadlines were correctly identified in the results. The abandoned bot's later timeout defaults were deliberate consequences of the departure test.

## Completed games and audit

| Match | Rounds | Final scores | Audit |
| --- | --- | --- | --- |
| Noodle `549d8e22-d85e-47e0-9473-875533d21c61` | 10 | Ada mirror 5; Cora human 10 | Pass |
| Machine `359e18d6-3874-4d7e-9cbb-d22b57adb8f0` | 20 | Cora Dice 23; Bert departed bot −2 | Pass |
| Noodle `1dbadf90-e75e-4961-bdde-047221caafe6` | 5 | Ada revision 2 Betray 15; Bert revision 2 Cooperate −10 | Pass |

The independent database audit recomputed all pair payoffs and score sums and checked complete pair coverage, player history, durable result counts and persisted moves. All three games passed: 35 rounds, 35 pair results and 70 moves. Continuing bots had zero timeouts; the deliberately abandoned seat accumulated 14 automatic defaults.

The final rematch pinned Ada revision `5996b67d-ebf2-44ae-b97b-ab0e53261d8c` and Bert revision `0aa9613b-1a59-4b65-bda2-ec52a1a17e91`, different from their original seated revisions. All five revealed pairs were D versus C and scored as expected.

Cora also verified that Watching updated to Results while the owned table was open, then reopened the correct final spectator results. Evidence: `2a251ec7-75c0-44b7-aafd-334540a23756-d4f4e0d9-e9a3-46f0-bb28-65ef504c5fd1.png`.

## Saved evidence

The local persistent ledger retains the resolved spectator issue and new open label issue. Screenshots, action history, browser traces, `independent-audit.json` and `report.json` are saved under `data/arena/34635606-a083-498a-bf5a-a81eebccdb12/`. Player contexts are closed; the arena, database and overseer remain running. The session outcome is failed to reflect the new open usability finding, despite passing spectator checks and scoring audits.

This session covered desktop multiplayer and bot interactions, without microphone, touch or physical-device testing.
