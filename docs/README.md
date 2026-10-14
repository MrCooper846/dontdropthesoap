# Technical plan

Status: proposed v1 design, 14 October 2026. The code remains the original party MVP. This documentation is a concrete implementation recommendation based on the [game vision](game-vision.md), not a claim that the systems exist.

## Read in this order

| Document | Responsibility |
| --- | --- |
| [Game vision](game-vision.md) | Product goals and boundaries |
| [Architecture](architecture.md) | Components, stack, authority and sessions |
| [Gameplay](gameplay.md) | Proposed alpha rules, lifecycle and league format |
| [Data](data.md) | Entities, invariants, transactions and recovery |
| [Protocol](protocol.md) | Commands, HTTP/socket contracts, visibility and retries |
| [Bots](bots.md) | External clients, visual builder and bounded execution |
| [Yard and voice](yard-and-voice.md) | Rendering, movement, social UI and media routing |
| [Testing](testing.md) | Correctness, hostile clients, playtests and performance gates |
| [Operations](operations.md) | Deployment, credentials, observability and recovery |
| [Implementation](implementation.md) | Milestones and migration from current code |
| [Goal Mode execution](goal-mode-plan.md) | Paste-ready goal, stage gates, checkpoint record and resume instructions |

## Decision register

| Decision | Baseline | Status |
| --- | --- | --- |
| Game authority | One Node game writer | Recommended |
| Realtime | Keep Socket.IO; new application protocol | Recommended |
| Data | PostgreSQL transactions; movement in memory | Recommended |
| Rendering | Phaser with React overlays | Recommended; mobile spike |
| Editor | Blockly → restricted JSON interpreter | Recommended; mobile spike |
| Voice | LiveKit candidate, server-enforced audience | Conditional on hostile-client proof |
| Identity | Server-issued guest session; scoped bot tokens | Recommended; recovery/account upgrade deferred |
| Economy | Per-match net score, separate casual totals and league rankings | Proposed gameplay default |
| League | Small round-robin batches; open external compute | Proposed gameplay default |
| Capacity | 32 humans/four tables | Test target, not benchmark |
| Hosting | Single game replica, DB, separate media | Provider/cost choice pending |
| Guards/clans | Later possibilities | Not dependencies |

“Recommended” means implementation can start from this plan; it is not an assertion of user approval of every numeric parameter. Balance values are tunable and versioned. Provider selection and voice enforcement must pass their explicit gates.

## Terminology

An owner is a human identity. A session/controller proves authority. A bot belongs to an owner. An entrant is a competitor represented by a match seat. A yard contains human presences and circles. A circle is an entry point to matches. A league batch schedules fixtures, each with one or more attempts.

Match/round/seat identifiers appear on actions. Socket IDs are transient connections, never player credentials. Public state and private observations are separate projections.

## Documentation maintenance

Rules live in gameplay.md, schema/recovery in data.md, wire contract in protocol.md. Other files link rather than redefine these contracts. When a feature lands, update the root README's implementation status and its milestone. Keep unresolved decisions and speculative ideas labelled.

References to provider documentation support capabilities only; our defaults, architecture and load targets are engineering proposals. Validate actual versions during implementation.
