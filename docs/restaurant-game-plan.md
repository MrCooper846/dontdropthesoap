# Prison restaurant game plan

Status: first playable implemented locally on 23 October 2026; see the [implementation and verification report](restaurant-first-playable-2026-10-23.md). Balance values are provisional. The setting is a restaurant staffed entirely by prisoners; this is an original game design, not a simulation of a particular real restaurant.

## Purpose and core loop

A 4–8-player cooperative restaurant shift creates wealth and opportunities for optional betrayal. Nobody is assigned to be a traitor. Honest cooperation must be enjoyable and financially worthwhile before theft is added. Players prepare the restaurant, serve customers, collect payments, deposit earnings, optionally steal or investigate, then receive itemised payouts.

Normal shifts target 10–12 minutes. A new prisoner starts with zero personal noodles; restaurant entry and starting supplies are free. A bankrupt player can always earn again. Existing personal wealth is never automatically risked during a shift. Restaurant funds, carried customer payments and permanent wallets are distinct.

The wider prison can later include cells/home storage, exercise-yard teamwork, the canteen, library and other cooperative jobs. Build and validate this one restaurant first. Later integration can let earned noodles fund the existing trust game; the restaurant prototype must not silently change that game's current score/payoff rules.

## Layout

- Dining room: seating, orders, service, payments.
- Kitchen: preparation, cooking and plating.
- Bar: drink making and glass return.
- Wash-up: cleaning and equipment circulation.
- Stockroom: ingredients and supplies.
- Back corridor: connects service areas, stockroom and office.
- Back office: vault, purchasing terminal and accounting records.

Legitimate jobs naturally pass the office. The vault should not be a conspicuous thief-only dead end, nor accessible by a secret route unavailable to honest players. Later artist-created rooms, prisoners and walking animation can replace the initial schematic presentation.

## Roles and minigames

Four players cover chef, waiter, barman and runner/dishwasher. At five or six, duplicate chefs/waiters. At seven or eight, separate runner/wash-up and consider host/stock clerk. Management begins as a shared office function, not a privileged role controlling everyone else's earnings. Basic support activities should remain available across roles; specialisation must not make one player the sole owner of all useful information.

| Role | Task loop | Minigames | Legitimate back-area activity |
| --- | --- | --- | --- |
| Chef | Collect, prepare, cook, plate, send | Short preparation sequence, visible cooking window, correct assembly | Ingredients, equipment and stock requests |
| Waiter | Take order, collect, carry, deliver, collect payment, deposit | Order-to-table association, tray balance, prompt delivery | Cash deposits and authorised refunds |
| Barman | Read ticket, choose glass, pour/mix, garnish, hand over | Fill range/timing, small recipes, efficient batching | Drink supplies and clean glassware |
| Runner/dishwasher | Move supplies, clear tables, wash, return equipment | Sort, scrub/rinse, manageable transport loads | Deliveries, replacement equipment and office collections |

Recipes and order notes stay visible; unaided memorisation is not required. Challenge comes from coordination and overlapping work, not constant rapid clicking. Mistakes cause recoverable service delays, lower quality or equipment demand, rather than unlimited silent losses. The support role must make meaningful choices rather than absorb all undesirable chores.

Possible later roles: host for seating/turnover, stock clerk for supply planning, manager for bookings/purchases/accounting once those activities form a worthwhile independent loop.

## Customers and payment

Each order earns a base price plus quality and service-speed adjustments, minus legitimate refunds. Example: base 10 + quality 2 + prompt service 2 = 14 noodles. All payments and tips are shared restaurant revenue, not an individual waiter's wages.

Payment enters a private legitimate restaurant cash pouch until deposited into the office vault. Provide starting supplies free; recorded emergency restocking can spend vault funds. The vault cannot go negative. The prototype need not simulate full restaurant finance.

## Optional theft

Any participant may steal from the vault. Customer-payment diversion is a later mechanic. Initial values: bundles of 1–5 noodles, about three seconds to conceal a bundle, maximum 15 concealed at once. Larger theft requires more time or visits. Nearby players see ordinary office activity, not an explicit thief animation.

The server transfers stolen funds out of the vault immediately. Only the thief sees the concealed inventory and carrying risk. Stolen funds cannot be spent, transferred to another player or hidden in scenery during the shift. They can be quietly returned to the vault. Undetected funds are kept when the shift ends; no automatic end-of-shift audit reveals every thief.

No theft from permanent personal wallets. Avoid an optimal strategy of taking everything: cooperation should produce substantially better repeat earnings than constant sabotage.

## Mistakes, drops and evidence

Carrying 1–5 stolen noodles is low risk, 6–10 medium, 11–15 high. Tray spills, broken dishes, collisions/heavy-load mishaps can trigger a chance to drop noodles. Amount carried primarily sets the risk; mistakes create the opportunity. Explain risk to the thief rather than randomly punishing weaker minigame players without warning.

Dropped noodles are a clue, not conclusive proof: waiters may legitimately carry payment. Observers interpret who came from where and what they claimed to be doing. Keep the server's source classification private. Recovered dropped noodles go to restaurant funds; expiration must not silently destroy them. Do not initially allow pushing that could be spammed to force evidence.

Other clues are unusual office visits/delays and accounting discrepancies. Reconciliation compares revenue, recorded spending, deposits and legitimate carried payments. Report the amount missing, not a culprit or full inventories. Reconcile periodically or through an office task rather than announcing an instantaneous discrepancy after each theft.

## Searches and consequences

One player requests a search, another supports it; larger crews may require three total supporters. A short visible search then lets the server establish whether the target currently possesses stolen noodles. The suspect cannot defeat an accepted search by refusing consent or walking away. An innocent result reveals no inventory details and is not a lifetime certificate of innocence.

Avoid a fixed global search budget that conspirators could exhaust. Test a shared cooldown, a longer caller cooldown after an innocent search, and a modest caller final-share deduction. Deductions can never reach into prior personal wealth or create debt. Accusation spam and cliques require playtesting.

If caught: recover concealed noodles into the vault, reduce the thief's final share (initially 50%, rather than jumping to 80%), block further theft that shift, and let them keep working. Punishment should create a reason to finish, not leave a player watching for ten minutes. Repayment or good-work recovery can be explored later.

## Payout accounting

Close new orders, allow a short service grace period, deposit legitimate carried payments, complete already-approved searches, secure undetected theft, then split shared funds. Apply caught/false-accusation deductions and redistribute forfeited shares among eligible teammates. Handle integer remainders deterministically; conserve noodles exactly.

Use equal base shares among full-shift participants initially. Do not rank roles by click counts: support work is difficult to score fairly. Abandonment entitlement may be time-weighted with reconnect grace; anti-idle rules should identify prolonged inactivity, not slow players.

Example A: four players earn 120 after costs; 12 are stolen undetected. Shared 108 gives 27 each; thief receives 39 including stolen noodles, others 27. Total 120.

Example B: the 12 are recovered after conviction. Shared 120 gives base 30. Thief loses 50% and receives 15; others receive 35 each after redistributing 15. Total 120.

Undetected theft is intrinsically attractive because its cost is shared while its gain is personal. Detection, carrying limits and consequences must counterbalance that incentive. Adjust from measured play rather than assuming these numbers are solved.

## Closing, disconnects and abuse

- Close theft shortly before shift end, leaving an investigation window.
- A search accepted before closing must finish; clock-running cannot cancel it.
- Disconnecting does not bank theft: preserve a reconnect grace, then return carried funds on abandonment.
- Brief disconnects preserve identity, role and entitlement.
- No full idle payout for deliberate abandonment; use participation duration with grace.
- Prevent unrestricted destruction, body-blocking and expensive purchases that let one player ruin the shift.
- Normal work mistakes never debit a player's existing permanent balance.

## Information and UI

Main view: current task/order, timing/patience, carried items, shift time and nearby crew. Restaurant panel: deposited funds, orders, supply warnings, latest reconciliation. Private view: legitimate pouch, concealed noodles, risk and penalties. End receipt: base share, deductions, redistribution, private theft and total. Initially keep successful theft earnings private so suspicion can persist between shifts.

## Delivery stages

1. Honest restaurant: four roles, a small food/drink menu, customers, deposits.
2. Theft: vault, carrying limit, spills and voluntary returns.
3. Investigation: reconciliation, supported search, fair consequences.
4. Persistent wallets and itemised payout receipts.
5. More staffing, recipes, prison locations and integration with existing trust-game wagers.

The first complete playtest uses four players, a small restaurant, approximately three food recipes/two drinks and one theft system. Success means cooperation, cautious stealing and intelligent investigation can each be worthwhile; constant theft, no temptation or endless accusations indicate balance problems.

## First-playable implementation boundary

The first implementation uses a restaurant-only zone map, sequential/timed tasks and 2/5/10/15-minute shifts, including a short test mode. It includes the four core roles, order dependencies, payments/deposits, limited theft, drops/recovery, reconciliation, supported searches and persistent payouts. Freeform walking, physics-based tray balancing, batching, refunds, wider prison artwork and using the wallet to stake the existing trust game are later stages. The short minigames must remain actual player interactions validated by the server, not client-submitted success claims.

Store authoritative shifts and wallet credits durably. Validate actions, membership, timing and privacy on the server. Serialize concurrent commands; use existing authenticated controller and idempotent resource-command receipts. Preserve evidence in the laptop's isolated arena database; test four independent players and audit money conservation, duplicate requests, privacy, disconnect/reconnect and payout persistence.
