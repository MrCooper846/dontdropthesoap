# Candidate acceptance audit — 15 October 2026

Overall result: NOT YET VALIDATED. This audit preserves the full [goal](goal-mode-plan.md), rather than treating implemented code as physical/human/deployment evidence.

Candidate: clean 3b8235c90488dc156b7dc97e2683713b28c5bec1; relative to the earlier ffeb04b candidate, runtime changes add aggregate timing/clock diagnostics and test evidence capture, without changing game rules. Current private production-only package: /tmp/soap-release-0852116d2b6b4f76a6b3e77f196783da, build 49BiR5c997xouTKaJY4qs. Fresh production smoke and exact-package restore/previous-binary rollback pass. The completed full-hour workload belongs to ffeb04b/root build hafeLDvQmndyldUBWUZ8-; no full hour is claimed for the diagnostic revision. Subsequent documentation commits do not change packaged application code.

## User-visible requirements

| Goal requirement | Inspected implementation/evidence | Result and limit |
| --- | --- | --- |
| Establish identity and enter a cartoon yard | server/auth, app/yard, client/yard; eight alpha and nine yard cases | Automated pass; guest cookie loss has no recovery |
| Desktop/mobile movement, circles, human/bot/owner roles | Authoritative movement/prediction/overlays; real keyboard and emulated-touch yard tests | Automated pass; physical mobile usability/FPS NOT_TESTED |
| Nearby text, voice, mute/block/report | Server routing, retained-recipient history, social UI; yard tests and fifteen production native-SFU/browser cases | Automated text/control/privacy pass; actual microphones/devices/public networks NOT_TESTED |
| Human matches and direct challenges | Common match engine/service, immutable moves, simultaneous reveal; alpha/yard/SQL/race/crash tests | Automated pass; human understanding/entertainment NOT_TESTED |
| External and visual bots | Actual Python/TypeScript processes; manual Blockly construct/practice/publish/play/edit; immutable declarations and memory/version tests | Automated pass; physical editor and nonprogrammer playtest NOT_TESTED |
| Spectate while retaining human presence | Yard admission/social cases include a roaming external-bot owner and unrelated spectator | Automated pass; human social playtest NOT_TESTED |
| Open league, standings and recorded results | Complete four-entry mixed-bot batch, schedule properties/limits for supported sizes, public/hostile reads, offline/retry and physical restart | Automated pass; no claim of certified frozen external code or a 16-entry live capacity benchmark |
| Reconnect without identity/match corruption | Controller/lease fences, durable receipts/projections, browser reload, actual human/external/league kills and singleton tests | Automated pass; physical network/background interruption NOT_TESTED |

The actual test files are under [browser acceptance](../tests/browser), [PostgreSQL integration](../tests/integration) and [runtime drills](../tests/runtime). Exact command outcomes and checkpoint revisions are in the execution record; an unexecuted listed scenario is not evidence.

## Engineering and operational requirements

| Requirement / named artifact or command | Authoritative evidence | Status |
| --- | --- | --- |
| Fresh setup/runtime/dependencies | services:up/db:migrate development baseline; clean prepare:release archive, locked installs/build, runtime-only test:production boot; measured Node 24.18.0 | PASS locally; hosting compatibility separate |
| Pure rules, validation and bounded workers | npm test: 97 checks; typecheck/format; real interpreter workers and failure termination | PASS |
| Durable state, privacy, retries and scopes | test:integration: 48 real PostgreSQL checks including public/private cursors, result pages, external revisions, owner/epoch/credential guards and ledgers | PASS |
| Fresh and repeated migrations | test:migrations: all sixteen migrations; schema-16 restore/old-binary/roll-forward checks | PASS |
| Original baseline and renderer/editor lifecycle | Corrected test:browser: two tests; dedicated feature configs retain all feature tests | PASS |
| Complete playable UI and visual construction | test:alpha eight; test:yard nine; test:league two; test:security five including the three visual specs | PASS automated; test:visual cases execute in the production security config |
| Enforced media audience | test:voice fifteen Chromium/Firefox/WebKit cases with real native worker/RTP, modified listeners, lifecycle/operator/policy failures and permission-denial UI | PASS automated; the rejected LiveKit spike is historical design evidence, not a passed adapter |
| Legacy migration/isolation | Initial checkout had no legacy ledger; retained synthetic archive SQLite checksum reverified as 1a119a284e803418e4172edc794c90d4c12cad9a8b36c228d22ed6c15217bd62; production/dev current-server isolation and separate local legacy game pass | PASS for available data; private archive remains ignored |
| Operators, credential/session revocation and maintenance pause | SQL/operator cases, actual native-voice/browser moderation tests, real bot credential revocation and yard pause/resume | PASS locally; no public admin endpoint |
| Shutdown, writer ownership, deadline fairness | test:shutdown physical row locks, WebSocket/polling acknowledgements, native voice drain, blocked outbox versus deadlines and bounded unfinished request | PASS |
| Infrastructure interruption and recovery | test:database-outage on its own local container; final test:recovery and test:league-recovery physical kills/retry/one settlement | PASS locally |
| CSP and diagnostic privacy | Production HTTPS nonce/asset/connect tests, test:startup-privacy, actual HTTP sentinel/log/correlation/flood tests | PASS within documented scope |
| Resource admission and overload | test:resources and test:overload actual limits/recovery; tested low fixture caps distinguished from production defaults | PASS |
| Nominal and doubled traffic | Clean 3be47a6/build cu1hrACOOu8b7Ah0kE5zm; exact 320 moves/four timeouts/160 results/32 credits per profile; measured ACK/deadline targets pass | PASS for stated game workload; 2x is 64 presences/two command copies with four tables/32 seats/six bots |
| Required full-hour memory/churn | Actual exec 55849 exited 0 on clean ffeb04b; complete report and independently recomputed memory/sample criteria | PASS for the recorded presence/reconnect workload; subsequent deadline smoke failure remains open |
| Encrypted restore and actual rollback | Current package 3b8235c through previous 26d38b3 and forward, both 33-table fixtures, schema/data/session/admission/ledger equality, authenticated tamper failure and owned cleanup | PASS locally; strict test:rollback includes the restore gate |
| Production release artifact and notes | Clean archive marker, build manifests, matching compiled visual worker, native binary, runtime-only npm start, normal shutdown; [candidate notes](release-notes.md) | PASS local artifact; no validated tag/deployment |
| Real devices, 30 FPS, audio/editor/background | [Physical acceptance procedure and result form](playtest.md) | NOT_TESTED; actual devices/evidence required |
| 4–8 humans, including visual/external bot owners | Same playtest procedure; automation is not human evidence | NOT_TESTED; people required |
| Public media/hosting, backup custody and alerts | Deployment-specific HTTPS/WSS/media/NAT/TURN, secret store, daily encrypted off-host copy/expiry, restore and collection/alerts | NOT_PROVISIONED/NOT_TESTED; authorized environment/operator inputs required |
| GitHub publication | Earlier automatic review rejected combined push/PR egress to the destination without explicit approval | APPROVAL_PENDING; no push/tag/merge/deployment performed |

## Remaining handoff

The frozen-source hour completed successfully (3,600,008.944 ms). A subsequent short reporting smoke failed the unchanged one-second deadline-delivery bound at 1,114.936 ms; independent database-derived resolution lag was 1,013.401 ms. This is an open timing defect, not a clock-comparison artifact. Aggregate phase timings and complete final-window retention are verified. Subsequent read-only paired-clock probes observe simultaneous Node/PostgreSQL wall-clock steps up to approximately two seconds relative to monotonic time, despite sub-1.1-ms mutual offsets. This explains the observed discrepancy pattern but does not retrospectively prove the original failure cause. Timing acceptance requires an attributable rerun on a stable clock. No deadline limit has been relaxed.

After that, collect actual candidate/device/browser/network-specific results using playtest.md. Provide devices, four to eight people and an existing authorized HTTPS/media test environment; configure real secrets and off-host backup/monitoring custody through its operator. No credentials should be placed in this report.

Only recommend the tested source for a validated candidate tag after the applicable gates pass. Public deployment and code publication require their existing authority; this audit supplies neither. Do not mark the full goal complete while any required evidence is missing.
