# Project documentation

The main project is the playable browser game: the social yard, cooperate/betray matches, visual and external bots, leagues and a browser restaurant prototype. Start with the [project overview](../README.md) for a portfolio introduction and local quickstart. The Unity restaurant is a [separate experiment](unity-experiments.md), not the main game or a completed engine migration.

Design specifications and dated execution reports serve different purposes. A proposed mechanic is not evidence that it ships; a successful local test is not public deployment or comprehensive device acceptance. Detailed test/setup notes from the earlier README are preserved in the [development guide](development-guide.md).

## Read in this order

| Document                                                      | Responsibility                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Development guide](development-guide.md)                     | Detailed setup, commands and recorded engineering checkpoints                   |
| [Browser restaurant](restaurant-first-playable-2026-10-23.md) | Implemented activity, scope limits and acceptance evidence                      |
| [Restaurant design](restaurant-game-plan.md)                  | Broader cooperative activity and economy plan                                   |
| [Agent arena](arena.md)                                       | Isolated browser playtests, issue tracking and evidence                         |
| [Unity experiments](unity-experiments.md)                     | Separate 3D prototypes and local human/agent testing                            |
| [Game vision](game-vision.md)                                 | Product goals and boundaries                                                    |
| [Architecture](architecture.md)                               | Components, stack, authority and sessions                                       |
| [Gameplay](gameplay.md)                                       | Proposed alpha rules, lifecycle and league format                               |
| [Data](data.md)                                               | Entities, invariants, transactions and recovery                                 |
| [Protocol](protocol.md)                                       | Commands, HTTP/socket contracts, visibility and retries                         |
| [Bots](bots.md)                                               | External clients, visual builder and bounded execution                          |
| [Yard and voice](yard-and-voice.md)                           | Rendering, movement, social UI and media routing                                |
| [Testing](testing.md)                                         | Correctness, hostile clients, playtests and performance gates                   |
| [Operations](operations.md)                                   | Deployment, credentials, observability and recovery                             |
| [Private laptop playtest](laptop-playtest.md)                 | Local-network HTTPS/media setup for real phones                                 |
| [Physical-device and human acceptance](playtest.md)           | Procedure and result form for the remaining real-device/playtest gates          |
| [Alpha candidate notes](release-notes.md)                     | Implemented scope, runnable package and explicit remaining release dependencies |
| [Candidate acceptance audit](release-audit.md)                | Requirement-by-requirement evidence, scope limits and unpassed gates            |
| [Implementation](implementation.md)                           | Milestones and migration from current code                                      |
| [Goal Mode execution](goal-mode-plan.md)                      | Paste-ready goal, stage gates, checkpoint record and resume instructions        |

## Original design decision register

| Decision       | Baseline                                                        | Status                                                          |
| -------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Game authority | One Node game writer                                            | Implemented                                                     |
| Realtime       | Socket.IO with versioned application protocol                   | Implemented                                                     |
| Data           | PostgreSQL transactions; movement in memory                     | Implemented                                                     |
| Rendering      | Phaser with React overlays                                      | Implemented; physical-device usability remains limited evidence |
| Editor         | Blockly → restricted JSON interpreter                           | Integrated; native workers and emulated-touch flow verified     |
| Voice          | mediasoup native worker with server-owned consumers             | Integrated; device/playtest validation pending                  |
| Identity       | Server-issued guest session; scoped bot tokens                  | Implemented; recovery/account upgrade deferred                  |
| Economy        | Per-match net score, separate casual totals and league rankings | Implemented; restaurant wallet remains separate                 |
| League         | Small round-robin batches; open external compute                | Implemented preview                                             |
| Capacity       | 32 humans/four tables                                           | Test target, not benchmark                                      |
| Hosting        | Single game replica, DB, separate media                         | Provider/cost choice pending                                    |
| Guards/clans   | Later possibilities                                             | Not dependencies                                                |

“Recommended” means implementation can start from this plan; it is not an assertion of user approval of every numeric parameter. Balance values are tunable and versioned. Provider selection and voice enforcement must pass their explicit gates.

## Terminology

An owner is a human identity. A session/controller proves authority. A bot belongs to an owner. An entrant is a competitor represented by a match seat. A yard contains human presences and circles. A circle is an entry point to matches. A league batch schedules fixtures, each with one or more attempts.

Match/round/seat identifiers appear on actions. Socket IDs are transient connections, never player credentials. Public state and private observations are separate projections.

## Documentation maintenance

Rules live in gameplay.md, schema/recovery in data.md, wire contract in protocol.md. Other files link rather than redefine these contracts. When a feature lands, update the root README's implementation status and its milestone. Keep unresolved decisions and speculative ideas labelled.

References to provider documentation support capabilities only; our defaults, architecture and load targets are engineering proposals. Validate actual versions during implementation.
