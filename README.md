# Don't Drop The Soap

A mobile-first multiplayer Prisoner's Dilemma party MVP built with Next.js, TypeScript, Socket.IO, and in-memory lobby state.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

To test on phones, make sure every device is on the same Wi-Fi network, then open:

```text
http://YOUR_COMPUTER_LAN_IP:3000
```

One browser creates a lobby. Other browsers or phones join by the room code, copied link, or QR code.

## Production Build

```bash
npm run build
npm start
```

## Simple Deployment

This app uses a custom Node server for Socket.IO, so deploy it somewhere that supports long-running Node processes and WebSockets, such as Railway, Render, Fly.io, or a small VPS.

Typical deploy commands:

```bash
npm install
npm run build
npm start
```

Set the service port to `3000` or let the host provide `PORT`.

## Notes

- Live lobby state is in memory.
- Finished game scores are stored in `data/leaderboard.sqlite`.
- No accounts.
- Restarting the server clears all lobbies.
- Deleting `data/leaderboard.sqlite` resets the global leaderboard.
