# Restaurant first playable — implementation and verification

23 October 2026. Local arena only, with its existing isolated, persistent PostgreSQL database and evidence store. No remote hosting or database reset.

## Delivered

- Saved the design in `docs/restaurant-game-plan.md`.
- Added `/restaurant`, linked from the yard, with free entry, four to eight prisoners and chef/waiter/barman/runner roles.
- Six selectable rooms with prisoner figures, role instructions, live tickets, supplies and private inventories.
- Server-validated timed preparation, drinks, tray service, washing and restocking. Orders require food and drink before service earns payment.
- Shared vault, legitimate payment pouches, optional limited theft, voluntary repayment, mistake-related drops, recovery and reconciliation.
- Nearby supported searches, caught-player penalties and theft lockout, false-accusation consequences and continued legitimate work.
- Durable shifts, reconnect grace, deadline settlement, private receipts and immutable, idempotent restaurant wallet credits.
- Existing authentication, CSRF protection, controller epochs and command replay protection cover mutations. Public observations omit other players’ inventories and receipts.
- `npm run arena:restaurant` exercises a real four-browser shift using visible controls; traces, screenshots, observations and issue records persist in the arena.

## Scope

This is a playable mechanics prototype. Rooms use direct selection and minigames use timed sequences; free walking, tray physics, full prison expansion and artist animation are future work. The restaurant wallet is separate from the existing trust-game score and cannot yet stake those matches. Restaurant test players are browser-controlled agents; existing trust-game bot policies are not restaurant AI.

## Verification

- TypeScript, formatting, documentation paths and production build passed.
- 139 unit tests across 27 files passed, including 25 restaurant tests.
- Targeted real HTTP/PostgreSQL integration passed for authentication, CSRF/origin, command replay/conflict, consumed keys, controller epochs, permissions, privacy and malformed payloads.
- Four-browser two-minute acceptance passed production, deposit, theft timing, supported conviction, false accusation/cooldown, reload, private receipts, conservation and no duplicate payout. Run `3aa5ced8-e596-4554-89e0-a46d35d2fcf8`, shift `b3fcfc2c-9e29-4609-8b40-eb74c66c2bda`.
- Three independent agents plus a runner completed a real five-minute shift. They served five meals, earned 55 noodles, spent 4 on supplies and received 51 in total: chef 14, waiter 15, runner 15, caught barman 7. Voluntary theft repayment, reconciliation, a supported search, wrong-step recovery and continued work after conviction passed. Run `966cb183-3ecc-492e-ad84-59f195a09e7a`, shift `2fc5f3bb-27fc-43dc-a6f4-eeb740bd688c`.
- Existing wallet credits remained byte-for-byte identical across the final game-service recreation. An old abandoned lobby independently expired into four zero-value receipts, confirming background settlement without open players.
- Final extended acceptance passed after the restock fix: run `0d7e7804-cf30-496a-9211-60fb8bf44db6`, shift `9f7d10a1-120e-4dd0-a9f4-7960dddb62a3`. Stock increased from 6 to 14 for two noodles, repeat purchase was disabled, and all theft/search/receipt checks passed again. Revenue 13 minus costs 2 produced exactly 11 in wallet credits.
- Database audit found no inconsistent completed payout totals, premature credits or active membership locks on finished shifts.
- Entry layout checked at widths 1440, 768, 375 and 320 without horizontal overflow. This does not certify every active-game layout or physical-device interaction.

## Findings

Fixed before completion:

1. Zero-participation lobby leavers could receive payout remainders or redistributed penalties. Only positive participation weights now receive these funds.
2. An approved suspect could shed stolen funds by starting a task and deliberately spilling. Beginning/stepping a task is frozen during the approved search.
3. Repeated unnecessary stock purchases could drain the vault. Restocking requires stock at eight or lower, checked at both start and completion; the UI explains and disables unnecessary purchases.
4. Lobby buttons had duplicate accessible names. Their names now identify the host and shift.

Each economic/search fix has a regression. The overseer retains the findings and their resolution history. The initial acceptance deposit assertion needed a response wait; its failed run remains preserved and is classified as a harness timing issue. A deployment-time gateway interruption is likewise preserved and dismissed as expected deployment evidence.

Open usability follow-up: the task panel exposes too many choices and requires extra scrolling between task controls and orders. This remains in the overseer as a usability finding. Prior unrelated bot-workshop findings remain separate.

## Source and rerun

Implementation commits: `61bfd10` and `04c2fcd`, branch `codex/release-boundaries`. Open `https://127.0.0.1:3445/restaurant`; the overseer remains at `http://127.0.0.1:3146`. With the local arena running, use `npm run arena:restaurant` for another acceptance shift. Existing evidence and wallets are preserved.
