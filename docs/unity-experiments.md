# Unity restaurant experiments

Unity is a separate experimental branch of the project, exploring 3D interaction for a possible prison activity. The main game remains the browser-based yard, strategy matches, bots and leagues described in the [project README](../README.md). This is not a migration announcement or a finished 3D game.

| Experiment                                                                               | Purpose                                                                                          | Boundary                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [Single-player feel prototype](../prototypes/unity-restaurant/README.md)                 | Walking, tray pickup/drop physics, a preparation station and customer delivery                   | Temporary practice earnings; no multiplayer or shared economy             |
| [Multiplayer restaurant prototype](../prototypes/unity-multiplayer-restaurant/README.md) | Physical movement, tray ownership, role tasks, optional theft, supported searches and settlement | Separate native Windows client, local server and persistent test database |

The multiplayer prototype reuses the restaurant rules while adding a shared spatial map and native controls. It has placeholder art and simplified timed tasks. Carried trays and dropped meals are server-owned objects; it is not unrestricted networked rigid-body cooking simulation. Native clients and the browser game do not share player identities or wallets.

## Recorded testing

The [23 October implementation report](unity-multiplayer-restaurant-2026-10-23.md) records native-agent sessions, bugs found and fixed, conserved payouts, client reconnection and server/database restarts. The [native harness](../scripts/unity-arena/README.md) controls actual executable clients and persists observations and issue reports in an isolated database.

On 24 October, the developer played chef alongside three agent-controlled native clients acting as waiter, barman and runner. That five-minute shift served six meals for 67 noodles of revenue, with two paid restocks costing four noodles. The agents reported completing their roles without new functional bugs. This is one local human-plus-agents playtest, not a broader human usability or physical-device acceptance result. Its run is `7beee5a5-630f-4ecc-bd6f-a0974a349b9d`; profiles and evidence remain local rather than being published with the source.

## What remains experimental

HUD readability, artwork, animations and task design need iteration. Wider device support, hosting, a complete prison world and integration of activity earnings into the yard economy are not delivered by these experiments. Machine-specific launcher paths in the prototype documentation describe the original development laptop; they are not portable installation instructions for GitHub visitors.
