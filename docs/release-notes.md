# Playable alpha candidate notes — 15 October 2026

Status: local implementation candidate undergoing final acceptance. This is not a validated or deployed alpha. Source and attributable gate results are recorded in [the execution record](goal-mode-plan.md); no release tag or public deployment is created by these notes.

## What is built

- A shared cartoon prison yard with authoritative movement, keyboard/touch controls, visible match circles, nearby text, spectators, direct challenges and block/report controls.
- Human and mixed cooperate/betray tables with hidden irrevocable decisions, simultaneous reveal, explicit timeout/departure rules and separate casual score settlement.
- Owned external bots with scoped credentials, fenced controllers, Python/TypeScript examples and immutable declared revision metadata. Owners remain in the yard while bots compete. External code can be changed/coached; labels do not certify autonomy or frozen code.
- A Blockly editor with manual controls, private practice, immutable publication, a bounded worker interpreter, match-scoped memory and owner-only feedback.
- A small open bot league with registration, round-robin fixtures, offline/readmission handling, stored replay, separate standings and durable abort/retry/settlement.
- Server-authorized mediasoup proximity voice with explicit microphone access, push-to-talk, mute/block and spectator filtering. Voice is disabled by default until the environment/device gates pass.
- PostgreSQL recovery, immutable score ledgers, cursor-based observations/results, bounded resource admission and retention, audited local moderation, maintenance pause, graceful shutdown, encrypted restore and actual previous-binary rollback.

The [gameplay contract](gameplay.md) owns numerical rules. [Protocol](protocol.md) documents the HTTP/socket interfaces, result cursors and external revision declarations.

## Run and package

Use the Ubuntu checkout with Node 22 or newer (24.18.0 is the measured runtime), npm and Docker Compose. Follow the root README: npm ci, copy .env.example to .env, npm run services:up, npm run db:migrate, then npm run dev. Local defaults use PostgreSQL on loopback port 55432. Original placeholder art is intentional; guest identity depends on the browser cookie and has no recovery flow.

For a reproducible production package, commit the candidate, run npm run prepare:release, then run npm run test:production inside its printed private /tmp/soap-release-* directory. Preparation archives committed source, builds with locked dependencies, retains the compiled worker and installs runtime dependencies only. Smoke uses and removes its own new empty local database. The package marker identifies its source; it is not evidence of public TLS or media reachability.

Use SOAP_CURRENT_DIR for exact-package restore/rollback as described in [operations](operations.md). Keep the previous package and deployment secret/backup custody under the operator's control. The singleton game writer must remain a single replica.

## Acceptance and remaining dependencies

Automated checks cover the real engine, PostgreSQL constraints/transactions, actual HTTP/socket clients, browser user flows, native worker/SFU authorization, physical process/database interruptions, production packaging and local encrypted restore/rollback. Their exact revisions and results belong in the execution record. Synthetic RTP does not prove physical microphones, Linux WebKit does not prove iOS Safari, and viewport emulation does not measure mobile FPS.

Required remaining evidence:
- Actual iOS Safari/Android Chrome gameplay/editor/audio/background behavior and selected low-end-device rendering at the required frame rate.
- Real desktop microphone/device interruption coverage where available.
- A 4–8-person session covering discovery, human/bot roles, bluffing, spectator play, Blockly understanding, mute/block/report and return play.
- Authorized HTTPS hosting and reachable public/cellular media, including the actual NAT/TURN decision and network policy.
- Deployment-specific secrets, daily encrypted off-host backups, expiry/key custody, restore smoke, monitoring/alerts and deployment authority.
- Final frozen-source regression/load/soak acceptance; earlier measurements apply only to their recorded source and workload.

Use [the physical acceptance procedure](playtest.md) for the device/human/network evidence. Unavailable or unrun cases remain NOT_TESTED. Guest recovery, prizes/payments, hosted AI inference, clans, guards and broader prison simulation are outside this alpha.

## Release recommendation

Keep this as an untagged local candidate while required gates are open. After a frozen commit passes its applicable automated and physical gates, recommend that exact SHA for an alpha-candidate tag and authorized deployment. Do not label it validated from implementation tests alone. GitHub publication approval is currently pending; these notes do not authorize a push, merge or deployment.


## Current automated evidence

Application source 72aa79a, with documentation-only source marker 3be47a6, passes 48 PostgreSQL checks, 95 unit/native checks, two legacy/lifecycle browser tests, eight authenticated alpha cases, nine yard cases, two league cases, fifteen production native-voice cases and five production security/editor cases. Physical signal drain, startup redaction, isolated DB outage, resource enforcement and overload recovery pass. Nominal and doubled-presence/command profiles pass on clean 3be47a6/build cu1hrACOOu8b7Ah0kE5zm with unchanged score/decision metrics. The latter retains four tables/32 seats and six bots.

Current-source final crash/package/restore verification and the full frozen-source hour are still pending at this checkpoint. These results do not fill the physical-device/human/public-network/hosting gates above.
