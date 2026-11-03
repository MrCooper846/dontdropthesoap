# Native Unity multiplayer restaurant — 23 October 2026

Experimental 3D prototype, separate from the main browser game. Functional test results below do not mean the Unity game is finished or that the project has migrated engines.

## Delivered scope

A separate Windows Unity client implements the restaurant as a physical multiplayer activity: prisoners walk between the kitchen, dining room, bar, wash-up, office and stockroom. The shared map follows the supplied restaurant sketch, including the kitchen serving hatch. The browser game and original single-player physics experiment remain separate.

Four to eight players choose chef, waiter, barman or runner, with every role covered before service can start. Chef and barman complete timed preparation tasks; the waiter physically collects an exclusively reserved ready tray, carries it more slowly, can put it down/recover it, and serves the matching customer with a timed balancing sequence. Expired orders cannot pay. Runners wash plates and replenish shared supplies. Customer proceeds remain in the waiter's legitimate pouch until deposited at the vault.

All roles can reconcile books or prepare a small theft in the office. Actual movement cancels work and theft preparation. Supported searches require nearby participants to remain physically present; caught stolen funds return to the pot, the thief is blocked from stealing again, and their final share is penalised. Voluntary returns are supported. Private pockets, pending actions and receipts are projected only to their owner.

Normal settlement conserves revenue minus supplies expenditure across the crew. Immutable unique wallet credits and durable command receipts prevent duplicate payout/retry effects. Players resume their identity, position, role and shift through their local profile after restarting the executable.

## Local persistence and launch

Use the **Soap - Multiplayer Restaurant** desktop shortcut. It starts the isolated local database/service if needed and opens `D:\Unity\Projects\SoapMultiplayer\Build\SoapMultiplayer.exe`. WASD/arrows move; E activates the first enabled nearby action; the left dock provides explicit choices. F1 toggles help and F12 saves a screenshot.

Source is in [the Unity project](../prototypes/unity-multiplayer-restaurant/README.md). The Unity version is 6000.3.27f1. Runtime geometry is shared with `shared/unity-restaurant/map.json`.

The TypeScript authoritative server binds only `127.0.0.1:3157`. It derives positions/rooms from bounded direction input, enforces collision and station ranges, controls tray ownership and runs the existing pure restaurant rules. The separate PostgreSQL database `soap_unity_restaurant` binds only `127.0.0.1:55436`, using Docker volume `soap-unity-restaurant_unity-db`. Private credentials are in ignored `.env.unity`; startup guards refuse another host/port/database or connection overrides. Restarting preserves records. No production/browser wallet data is used or reset.

## Agent testing and issue tracking

[The native arena](../scripts/unity-arena/README.md) starts four actual Windows Unity executables with individual persistent profiles and loopback agent bridges. Agents submit native movement and visible enabled button actions. A harness task macro presses each real task button at its actual deadline; it never injects results, positions, balances or a clock. Observations, actions, runs, issue occurrences and triage persist in the `unity_arena` schema. Screenshots are verified nonempty files. Process cleanup verifies the recorded executable/profile before stopping owned clients.

The first sessions exposed and fixed fractional timestamp deserialisation, absent lobby fields becoming empty DTO objects, screenshot capture from hidden windows, reconnect readiness, stale input sequences and a penniless supply deadlock. The latter now offers an emergency free stock delivery only when stock is exhausted, the vault is too poor, nobody holds legitimate takings, there are no loose noodle bundles, and no complete ready meal can still earn money. Conditions are rechecked at completion; the delivery creates stock, never noodles.

The successful ten-minute real shift was `5a30d302-a8a5-44b8-a7a5-2d5615e5db14`, arena run `0d6bcddd-408f-4990-810e-0b30b0ebdc1b`. Three Codex agents and the overseer operated chef, waiter, barman and runner through native controls. It exercised preparation, physical delivery, deposits, washing, paid resupply, theft/return, a supported caught search, native reconnect and normal settlement. Two meals earned 22 noodles; supplies cost 6; four credits totalled 16. Ada/Bert received 5 each, runner 4, caught Cora 2. The audit found no duplicate credits or conservation mismatch. A server restart preserved the exact four credit rows, SHA256 `b541b8e0a95d3fd307c1417e50d44a5ba84e043256680267018928effe226f10`.

An earlier real five-minute exploration was retained as failed because no meal was successfully sold before expiry; its zero payout is not claimed as economic acceptance. Failed startup sessions and duplicate issue reports also remain recorded.

Post-game fixes align station, pickup/recovery and supported-search controls with authoritative ranges, hide inactive avatars, round countdowns to whole seconds and clear recovered read-transport warnings without clearing uncertain mutation retries. A second final-build recovery scenario is recorded below after completion.

## Verification and limitations

Final automated checks: TypeScript typecheck; 161 default tests passed with four database-dependent cases skipped in that invocation; the opt-in HTTP/shutdown suite passed all six cases (including those four skipped cases, with two shutdown cases overlapping the default suite); 7 separate native bridge/guard contracts passed; Unity batch build succeeded. HTTP fixtures use their own random identities in the isolated test database and are distinct from agent play; fixture setup is not claimed as visible gameplay evidence.

Placeholder art, simple timed task controls and game balance still need iteration. Agent travel/tool overhead caused many ticket expiries, so this is functional acceptance rather than human balance validation. Eight-player capacity is supported by rules/spawns but has not had an eight-native-client playtest. Tray carrying/drop is server-owned and stable rather than unrestricted networked rigid-body physics. Voice/touch, artist animation, a full prison world and spending restaurant earnings in the yard are outside this build. Both native wallets and the browser activity currently keep separate earnings.

## Final-build recovery and durability retests

Run `b38d807f-e51f-4264-8e2d-891f41968e76`, shift `4cf6cb29-6453-464f-9f31-567f7ae81757`, deliberately prepared four meals and drinks without serving, exhausting all eight starting supplies. While any complete meal remained ready the emergency flag stayed false. After normal ticket expiry the flag became true; the actual runner Restock task changed stock from 0 to 8 while vault, revenue and expenditure all remained zero, then disabled the flag again. Thus the penniless-crew deadlock fix passed native acceptance without injected state or clock changes.

The final build also demonstrated dropped-tray pickup absent at 2.053m, enabled at 1.580m and successful at 1.447m; disabled distant searches; whole-second order countdowns; and automatic removal of a recovered connection warning without a manual retry. The PostgreSQL container itself was restarted after this shift, and the earlier nonzero payout rows still matched their recorded hash exactly.

This recovery run is nevertheless marked failed overall: its subsequent active-server restart exposed a graceful-shutdown hang, leaving the service stopping until it was forcibly restored. The long outage correctly triggered participant absence timeouts; the shift finished with conserved zero payouts. Recovery/UI successes are retained separately from this server defect. Issue `bd65c013-c6ad-4fb9-b118-5e5f67297594` tracks the shutdown fix and follow-up acceptance.

A readability follow-up remains open as `f01a92d7-8e7f-4a0a-a094-3266d7c56082`: world nametags behind translucent HUD panels and very small floor labels. This is a placeholder-art/readability limitation rather than a missing restaurant mechanic.

The shutdown fix stops admission, closes idle HTTP immediately and bounds remaining connections; database shutdown terminates only this service instance's own backend PIDs, guarded by a unique application name and the dedicated database. It releases held advisory locks before closing the pool. A ten-second systemd stop timeout is also configured as a backstop. Three focused shutdown tests cover held HTTP, rejected new admission and a stalled SQL transaction with queued work/replacement lock acquisition.

Final real two-minute restart regression: arena run `90630304-2a25-4806-8644-235a6ba876dc`, shift `b0e8cbcd-20ab-4edb-9730-e76d23c0904e`. Four native clients were active when the service restarted. Journal timestamps show stopping at 20:51:58 and listening again at 20:52:00; all four preserved their identities and active status, cleared recovered transport warnings automatically, and chef/barman completed preparation after recovery. No forced kill was needed. Issue `bd65c013-c6ad-4fb9-b118-5e5f67297594` is resolved with this evidence.

The final restart regression also completed a physical meal delivery worth 11 noodles after recovery. The waiter reached the office at the finishing deadline; normal settlement banked the remaining legitimate pouch automatically. Four immutable credits totalled 11 (Ada3, Cora3, runner3, waiter2), with no duplicates or conservation mismatch. The run is marked passed. All owned agent executables were closed after receipts and screenshots were recorded; persistent profiles, evidence, issues and database records were retained.
