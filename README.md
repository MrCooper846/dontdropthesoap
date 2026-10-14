# Don't Drop The Soap

A social betrayal game about humans, bots and questionable noodle-related decisions.

The planned game is a cartoon 2D prison yard where people hang out, talk, challenge one another and enter bots into matches. The competitive core stays simple: cooperate or betray. Players supply the complexity through bluffing, simple visual bot programs or externally operated agents.

**Current status:** the code is a mobile-first multiplayer party MVP. The yard, proximity voice, visual bot builder, external bot API and bot league are planned features, not implemented capabilities.

## Documentation

Start with the [game vision](docs/game-vision.md) for the intended experience, design principles, core gameplay and open questions.

This is the first part of the documentation rewrite. Detailed architecture, protocol and implementation milestones will follow after their decisions are made.

## What the current MVP does

- Creates and lists lobbies, with room-code, link and QR joining.
- Supports 2–12 players and 3–10 rounds.
- Randomly pairs connected players each round.
- Runs 20-second decision windows and defaults missing moves to cooperate.
- Uses The Clanker as an odd-player opponent, copying the last human move played against it within that lobby.
- Calculates results, noodle balances, player statistics and end-of-game awards.
- Stores player identity in browser local storage, with no account authentication.
- Persists noodle balances and finished-game score entries in `data/leaderboard.sqlite`.

Live lobbies and match history are in memory. Restarting the server clears them. Deleting the database file resets persisted balances and score records.

## Current implementation boundaries

The prototype is not ready to act as a fair open bot competition:

- Lobby broadcasts include submitted moves before reveal.
- Actions trust client-supplied player IDs without verifying ownership.
- Move locking is enforced by the interface, not the server.
- Active-match departures and delayed submissions need stronger lifecycle rules.

These are known gaps in the existing implementation, not intended game mechanics. The planned version must protect hidden moves, authenticate control of entrants and enforce match rules on the server.

## Code map

| Path | Responsibility today |
| --- | --- |
| `server.ts` | Custom Next.js/Socket.IO server, lobby events and timers |
| `lib/game.ts` | Pairing, payoff rules, round resolution, bot behaviour and awards |
| `lib/types.ts` | Shared player, lobby and round types |
| `lib/leaderboard.ts` | Balance and score persistence using sql.js |
| `components/SocketProvider.tsx` | Browser socket connection and reconnect greeting |
| `app/lobby/[code]/page.tsx` | Waiting room, move selection and results interface |
| `app/api/leaderboard/route.ts` | Global leaderboard response |

The current stack is Next.js, React, TypeScript, Socket.IO and sql.js. This documents the existing implementation; it does not settle the future yard rendering, voice or persistence architecture.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For phone testing, connect devices to the same Wi-Fi network and open `http://YOUR_COMPUTER_LAN_IP:3000`.

Create a lobby in one browser and join from other browsers or phones using its code, link or QR code.

## Production build

```bash
npm run build
npm start
```

The app uses a custom long-running Node server for Socket.IO. Hosting must support that process and WebSocket connections. The default port is `3000`; set `PORT` to override it.

Persist the `data` directory if balances and recorded scores should survive deployment. Doing so does not preserve live lobbies.

## Development checks

```bash
npm run typecheck
npm run build
```

These are available checks, not a claim that this documentation change ran them. There is currently no automated test suite in the repository. Future implementation work needs behavioural verification of hidden moves, identity, scoring, retries, timeouts and reconnects.

## Contributing to the next version

Read the [game vision](docs/game-vision.md) before extending the prototype. Keep implemented behaviour, planned direction and speculative ideas explicitly separated in documentation.

The guiding principle is: **keep the rules predictable and let the participants be unpredictable.**
