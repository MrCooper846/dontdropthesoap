# Game vision

Status: planned direction, agreed in discussion on 14 October 2026. This document describes what the game should become, not features already implemented. See the [README](../README.md) for the current MVP and running instructions.

## The game in one paragraph

Don't Drop The Soap is a social multiplayer game set in a persistent, cartoon-style 2D prison yard. Humans walk around, talk, spectate and challenge one another at visible match circles. The competition centres on a simple choice: cooperate or betray. Players can compete themselves, build a simple bot with a Scratch-like visual editor, or connect an externally operated bot of arbitrary complexity. Human games, mixed tables and a distinct bot league share the same underlying rules. The fun comes from bluffing, rivalry, experimentation and watching supposedly brilliant strategies fall apart.

## Guiding philosophy

**Chaos is the first creative priority. Keep the rules simple and let the participants become complicated.**

An expensive agent losing to a tiny tit-for-tat script is an ideal outcome for the game's personality. So is a human fooling a sophisticated bot with an obviously staged conversation. Neither outcome should require a bespoke scripted scenario.

The design should:

- Make the basic game understandable without programming or game-theory knowledge.
- Let players choose their own level of complexity, from pressing two buttons to operating an elaborate agent.
- Give humans a social reason to remain between matches.
- Make betrayals, mistakes and victories visible enough to become shared stories.
- Preserve dependable rules underneath the social disorder.

Chaos means unpredictable behaviour within the game. It does not mean clients changing scores, stealing control of another entrant or reading unrevealed moves.

This is a playful side project. Early builds can be rough, and experimentation is welcome. Features should earn their place by making the core experience more entertaining, rather than by making the prison simulation more elaborate.

## The human yard

The yard is primarily a gathering place for people. Bots are competitors people bring with them, rather than a replacement for the human social space.

Players move through a shared environment, encounter conversations, discover matches and watch other people's creations. Someone who does not want to write code should still have a complete experience: hang out, play human opponents, challenge bots and spectate.

The yard continues to provide a social context between individual matches. “Persistent” expresses that continuity and the intended ability to return to an ongoing community; it does not yet specify one global world, unlimited population, always-online bots or a particular recovery/storage architecture.

### Visual and movement direction

The reference is the approachable cartoon look and movement of Among Us: a readable 2D environment, clear character silhouettes and simple movement around shared spaces. The setting and character identity are prisoners and a prison yard, with original artwork.

The goal is a mobile-friendly experience that also works on desktop. Characters, interaction prompts and match information should remain legible on a small screen. Exact camera perspective, controls, rendering technology and art pipeline remain to be chosen.

Movement supports meeting people, overhearing conversations and discovering games. Combat, platforming and precise movement challenges are not core mechanics.

## Match circles

Visible circles on the ground act as places to join matches. A player should understand their purpose by approaching them, rather than needing to navigate a separate competitive menu.

A circle displays its occupancy, supported entrants and match settings. For example, “5/8 · Mixed · 10 rounds” communicates both available seats and what is happening. Eight seats and ten rounds are examples, not fixed limits for the future game.

The intended flow is:

1. Walk around the yard and find an interesting table or opponent.
2. Inspect the circle's rules and available seats.
3. Enter personally or submit an owned bot where permitted.
4. Play or watch the match.
5. See the outcome, react, and return to the yard or arrange another match.

Direct challenges are part of the intended social experience. Their invitation and circle-creation flow remains open.

| Experience | Competitors | Human activity |
| --- | --- | --- |
| Human table | Humans choosing their moves | Play, negotiate and react |
| Mixed table | Humans and player-submitted bots | Play against creations or watch an owned bot |
| Bot league | Player-submitted bots | Enter bots, spectate and follow competition |

The bot league is a specific activity accessible from the yard, not the identity of the entire game. Its scheduling, ranking and season format are not yet decided.

## The simple competitive core

The Prisoner's Dilemma remains the foundation. Each competitor chooses cooperate or betray, choices stay hidden until resolution, and the server calculates the result. Repeated encounters create opportunities for trust, retaliation, forgiveness and exploitation.

Noodles give the outcome a visible, thematic form. The exact future balance model, progression and relationship between casual and league scoring remain open. The existing MVP's values are a starting point, not a permanent balance commitment.

Tables can support different round counts. Pairing rules, deadlines and how repeated encounters work will need explicit rules before implementation. A league should not quietly inherit random party-game pairing merely because that is what the MVP already does.

Human and mixed matches need time for people to decide and interact. Bot competition may benefit from different pacing, but the results must remain understandable to spectators.

## Owners and competitors

A human owner and a match entrant are distinct concepts. An owner can play personally or enter a bot they control. Watching an owned bot should not require the owner to disappear from the social experience.

It should be clear which entrants are humans, which are bots and who owns each bot. An expensive model receives no special authority over the game. Complexity is a player choice, not a privileged competition class.

Limits on concurrent entries, multiple bots from one owner and owner intervention during a match remain open. These must eventually be defined per competition format.

## Two routes to bot creation

### Visual builder

A Scratch-like editor makes basic strategies accessible without programming. Players connect understandable conditions and actions, such as choosing betray after an opponent betrayed in the previous round.

The editor should make simple bots useful and easy to change. The initial block set, memory model and execution location are still design decisions. A fixed set of personality sliders is not the ceiling for the whole bot ecosystem.

### External bots

Players can connect their own implementation through a simple game API. A bot receives permitted observations and submits permitted actions. Its owner can use a few lines of code, persistent memory, a local model, frontier models or a larger agent system.

The owner operates and pays for their external machinery. The game does not need to host arbitrary submitted code or provide model inference for them.

Both routes should obey the same game rules and information permissions. The API contract must make straightforward scripted participation possible; conversational intelligence is optional.

External bots can retain information they legitimately receive. An open format must not promise enforceable memory limits or frozen code when computation runs on the owner's machine.

## Conversation, deception and bot perception

Proximity voice is central to the intended yard experience. Players can approach activity, talk around matches and hear nearby discussion. Spectators and bot owners are part of the entertainment.

False advice, bluffing, staged conversations and attempts to mislead a listening agent are legitimate sources of in-game chaos. A bot may ignore conversation entirely, trust it too much or try to verify it.

If an owner wants a bot to hear what the owner hears, the owner is responsible for setting up capture, transcription and interpretation. First-party AI hearing, automatic model integration and universal bot transcription are not core requirements.

This does not grant bots access to distant, private or otherwise unavailable conversations. Participants should understand that nearby players may process audible conversation through their own bots. The product needs usable mute/block controls and clear communication boundaries; exact voice routing and text alternatives will be designed separately.

Official game observations and player claims must remain distinguishable. A player can lie about an opponent's behaviour. They cannot forge the server's authoritative result.

## What makes it worth returning to

The intended return loop combines social familiarity with competitive experimentation:

- Meet people and develop rivalries.
- Play, observe or submit a strategy.
- Discover how other participants respond.
- Change tactics or adjust a bot.
- Come back for another encounter and another story.

Readable outcomes and recognisable participants matter as much as sophisticated strategies. League standings and match history can support this loop; a full replay system, progression economy and elaborate seasons are not assumed requirements of this overview.

Illustrative moments include an owner defending their bot's disastrous choice, people staging a conversation beside a listening agent, or a simple script beating a costly system. These are design examples, not promised outcomes.

## Core boundaries and later ideas

The core direction is the human yard, movement, proximity conversation, visible match circles, human/mixed play, bot participation through two creation routes, and a distinct bot league.

Clans, shared treasuries, transfers, contracts, political systems and broader prison simulation are exploratory extensions. They should not drive the initial architecture or become prerequisites for the core loop.

Roaming guards confiscating noodles from troublemakers are a low-priority “maybe later” joke. No guard AI, enforcement economy or misconduct system is implied by the current direction.

## Decisions still to make

This overview deliberately leaves implementation and detailed balance open:

- Account/session identity and ownership of bots.
- Yard population, instancing and persistence/recovery guarantees.
- Match pairing, timing, scoring, departures and timeout rules.
- League format, eligibility, ranking and handling multiple entries.
- Allowed owner intervention and communication per table type.
- API observations, authentication, action acknowledgements and reconnect behaviour.
- Visual-builder blocks, execution and available memory.
- Voice service, audible range, spectator routing and mobile interaction.
- Whether noodles represent casual balances, competitive scores or separate systems.

The next documents should specify architecture and protocol against this vision, while recording decisions as they are made. A runnable technical specification should not be inferred from the examples above.
