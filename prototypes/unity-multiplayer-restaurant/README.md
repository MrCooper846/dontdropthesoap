# Unity multiplayer restaurant

Experimental 3D prototype, separate from the main browser game. Functional test results below do not mean the Unity game is finished or that the project has migrated engines.

This is a separate native Windows client for the cooperative restaurant, backed by the laptop-only authoritative server and its own persistent PostgreSQL database. It does not connect to the browser arena's wallets or production data.

## Play on this laptop

Launch the **Soap - Multiplayer Restaurant** desktop shortcut. Its launcher starts the existing Unity test database and service if needed, then opens the game. Docker Desktop and Ubuntu/WSL must be available.

Working project: `D:\Unity\Projects\SoapMultiplayer`. Executable: `Build\SoapMultiplayer.exe`. Choose a nickname, create or join a shift, select one of four roles and ready up. Four to eight prisoners covering chef/waiter/barman/runner are required; the host starts service.

- WASD/arrows: walk. E: use the first nearby enabled interaction. The interaction dock offers explicit choices.
- Chef: walk to the kitchen preparation station and cook a ticket using its timed task sequence.
- Barman: prepare the matching drink at the bar.
- Waiter: collect the ready order at the dining side of the hatch, physically carry it to the matching customer table, complete serving and deposit the payment at the office vault. Trays can be put down and recovered; an expired order cannot be sold.
- Runner: wash dirty plates at wash-up and buy supplies at the stockroom. Unnecessary purchases are blocked. If all stock is gone and there are no usable funds, loose noodle drops or ready meals, emergency restocking is free and creates no money.
- Everyone can visit the office: reconcile, steal small bundles, return stolen noodles or coordinate a nearby supported search. Caught players lose part of their share and cannot steal again; they can continue working. False accusations have consequences.
- F1: help; F12: screenshot. Each profile keeps its identity, shift and wallet locally across relaunches. Receipts are private; completed payout credits persist in PostgreSQL.

## What is authoritative

The Node/TypeScript server authenticates native sessions, simulates movement against the same map as Unity, derives rooms, checks station/search proximity, reserves tray ownership, validates task timing and settles money. Clients submit directions and actions, never positions, successful task results or balances. Commands have durable IDs and replay receipts. Input sequences prevent delayed movement replay; stale movement stops. Brief reconnects retain identity and position.

Shared geometry is in `shared/unity-restaurant/map.json`; server movement helpers and station gates are beside it. Restaurant economics reuse `domain/restaurant/model.ts`.

## Local services

From the repository in Ubuntu:

```
npm run unity:prepare
npm run unity:db:up
npm run unity:server:start
npm run unity:server:status
```

The service listens only on `127.0.0.1:3157`. Database `soap_unity_restaurant` is exposed only on `127.0.0.1:55436` and stored in Docker volume `soap-unity-restaurant_unity-db`. Credentials remain in ignored `.env.unity`. Configuration guards refuse other database names/ports/hosts. Stopping/restarting a service does not reset data.

## Build and verification

Open this Unity source folder in Unity `6000.3.27f1`, then use **Soap → Build multiplayer restaurant**. The project generates its placeholder world at runtime from the shared map. Keep `Assets/Resources/restaurant-map.json` aligned with the authoritative shared JSON.

```
npm test
npm run typecheck
npm run unity:test:http
npm run unity:test:bridge
npm run unity:arena:bundle
```

The separate native arena harness controls actual executable clients through loopback controls that invoke the same handlers as the human interface. It records runs, observations, issues and evidence in the `unity_arena` schema. See the repository's `scripts/unity-arena/README.md` for launch, action, reconnect, task-button macro and audit commands. The task macro presses real visible task controls with real deadlines; it does not submit success or inject state.

## Boundaries

This is a complete first multiplayer restaurant loop with placeholder art and timed task controls. It is not a complete prison world or a realistic cooking simulator. Native clients currently run on this Windows laptop; this is not a browser/WebGL build. Carried trays are stable, and dropped meals are synchronised server-owned objects rather than unrestricted networked rigid-body simulation. Voice, touch, artist animation and using restaurant earnings in the yard are separate future work.
