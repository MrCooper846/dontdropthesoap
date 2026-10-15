# External bot reference clients

These are owner-operated clients. The game never needs your model-provider key and does not call arbitrary bot webhooks.

1. Run the game using the root README instructions.
2. Enter an alias, open **Manage your bots**, register an external bot and issue a credential.
3. Save the shown-once secret on the machine running the bot. In bash, enter it without putting it in command history:

```bash
read -rs SOAP_BOT_TOKEN
export SOAP_BOT_TOKEN
export SOAP_URL=http://localhost:3000
export SOAP_STRATEGY=tit-for-tat
```

4. Run either client from this checkout:

```bash
python3 examples/bots/client.py
npx tsx examples/bots/client.ts
```

5. Wait for the bot to appear online. Create or join a **Mixed** table and select it under **Enter as**. Another owner joins personally or enters their own bot. Ready your entrant; the host starts.
6. Watch your bot from the browser. The owner cannot submit a bot move using human controls. An owner can have one human seat and at most two total seats across different matches, but only one owned entrant at a table.
7. Revoke credentials from the bot page to stop access. Active sockets are disconnected, and revoked clients cannot reconnect.

SOAP_STRATEGY options: cooperate, betray, tit-for-tat and random. Tit-for-tat starts C and copies the last revealed move from the current opponent. Random uses SOAP_RANDOM_SEED plus match/round/seat, so a decision is stable on retry; both languages use the same SHA-256 rule.

The clients poll assignments once per second and heartbeat every five seconds. They retain a command UUID through ambiguous network failures, target the exact match/round/seat, discard stale intents, and reacquire a fenced lease after service restart. There is no automatic AI inference or audio capture.

A declaration/revision is metadata, not proof that an external implementation is frozen. Owners may coach or change their process.

Credentials are returned on initial issuance only. An exact issuance retry returns the same credential metadata with secretUnavailable=true and creates no duplicate token. If the initial secret response was lost, revoke that credential and issue another. Secrets never enter command receipts or match history.

HTTP clients use Authorization: Bearer ... and need no browser cookie/CSRF token. Socket.IO clients use /game-v1 with the same bearer header and lease semantics. Only assigned observations and moves are allowed; tokens cannot create tables, manage owners/bots, or join voice.

Observation responses retain the direct snapshot fields and add events, cursor, hasMore and reset. Supply ?after=cursor to scan subsequent committed events. state.sync({matchId,after}) returns equivalent snapshot/events/cursor data. Private entries are filtered server-side; cursors advance across entries that the viewer cannot see.

For local performance diagnostics, SOAP_METRICS=true optionally emits JSON bot.ack.latency records after successful move HTTP acknowledgements. elapsedMs includes request/response decoding and loopback/network time; no identifiers, credentials or choices are included. This is used by the production workload harness and is off by default.
