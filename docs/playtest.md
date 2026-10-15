# Physical-device and human acceptance

This is the procedure for the remaining gates in [testing](testing.md), not completed evidence. Record results against one committed candidate and an authorized HTTPS environment with reachable media. The execution record in [goal-mode-plan.md](goal-mode-plan.md) remains the source of progress.

## Record the environment

Record candidate SHA/build ID, test time, authorized origin, voice configuration, device model, OS/browser version, connection type and the measurement tool used. Use participant aliases. Keep cookies, bot credentials and raw audio out of the report. A blank or unavailable result is NOT_TESTED; a failure stays open until the fix and its rerun are recorded.

Minimum physical coverage:
- Actual iOS Safari and Android Chrome for movement, touch editing, audio permission and background/resume.
- Desktop Chrome, Firefox and Safari for microphone/device interruption where those systems are available.
- One selected low-end physical mobile device for the 30-FPS gate.
- At least one cellular/public-network media session, with the deployment's NAT/TURN path verified as applicable.

Linux WebKit and emulated mobile viewports are automated evidence already recorded separately; they do not establish physical-device completion.

## Run a 4–8-person session

Use four to eight people, at least one visual bot and one separately running external reference client. Have one person build a visual strategy and another operate the external client. Rotate human competitors, bot owners and spectators.

1. Each participant creates an alias, reads the guest-cookie limitation and enters the yard. On phones, walk with the joystick, rotate the device, approach a circle and open its accessible controls. Confirm players can identify humans, bots and their owners.
2. Create a mixed table. Enter personally or choose an owned bot, ready each entrant and start. Check that owners watching their bots can still walk. Human seats remain anchored while playing.
3. Choose cooperate/betray, observe the first-choice lock and wait for simultaneous reveal. Deliberately miss a round and verify the visible timeout-C result. Finish, understand the final net score and arrange another game.
4. Have a spectator watch the table, exchange nearby text and make an ordinary false claim about a prior round. Check players can distinguish the authoritative revealed result from another player's claim. Observe confusion and entertainment as product findings, separately from transport bugs.
5. Use a direct challenge, decline one and let another expire. Accept a valid challenge and return to the yard afterward.
6. Reload/reconnect during a round after accepting a choice. Confirm identity and that choice survive. Explicitly take control in another tab and confirm the old controller cannot submit.
7. Build tit-for-tat using real Blockly blocks and labelled connection controls. Exercise touch drag, zoom/fit, rotation, test, publish, compete, owner feedback and edit for the next game. Check the old game's frozen revision stays intact. Record whether a nonprogrammer can explain its choices.
8. Register visual/external entries in a league, inspect rules/pairings and follow a completed batch's standings and recorded results. Check players understand external code may be changed/coached and that league points are separate from casual totals.
9. Try mute, block and report with agreed test aliases. Verify blocked proximity text/audio stop in both directions, unblocking recovers, and a report has clear feedback. Use the documented local operator procedure for authorized moderation checks.

Observe whether people can discover a circle without instruction, identify their current role, understand lock/reveal, return to social activity and voluntarily arrange another match. Record usability findings as findings; successful automation does not answer those questions.

## Audio and interruptions

Use actual microphones and listeners at the recorded HTTPS origin. Record each device/browser combination independently.

- Join listening explicitly, then enable the microphone and hold push-to-talk by touch/pointer or keyboard. Release, cancel a gesture and move focus away; listeners should hear only intended transmission.
- Move nearby/distant, block/unblock and leave/rejoin voice. Check the seated spectator filter and same-table human conversation. Record join and restriction-update timings separately from game commands.
- Deny permission, then recover through the browser/device controls and the app's explicit microphone action. Verify text remains usable.
- Background/lock/resume a phone; interrupt capture with an incoming call or audio-device change where available. Confirm unintended transmission stops and explicit reactivation works afterward.
- Disconnect/reconnect Wi-Fi and test cellular reachability. Record whether the intended UDP/TCP/relay route succeeds; HTTPS page access alone does not prove media works.

The hostile-listener/native-RTP authorization suite remains the automated privacy evidence. Human hearing checks add device/network evidence and do not replace that suite. Record interruption recovery failures with the affected candidate/device, then rerun that case after its fix.

## Low-end mobile rendering

Capture at least sixty seconds of measured device performance with the actual yard visible, movement, table/spectator activity and the intended voice mode. Record the profiler/method, device/browser and observed frame-rate statistics. The gate requires at least 30 FPS on the selected physical device. A desktop viewport or socket-client workload does not measure it.

## Result form

For each case record:

| Field | Required value |
| --- | --- |
| Case | Number/audio/rendering scenario |
| Candidate | SHA and build ID |
| Environment | Device, OS/browser, network and origin |
| Observation | What actually happened |
| Evidence | Safe trace/screenshot/measurement reference |
| Result | PASS, FAIL or NOT_TESTED |
| Follow-up | Defect or missing access, fixed SHA and rerun if applicable |

After the session, update the canonical execution record with attributable summaries and exact remaining gates. Keep real-device, human, network, hosting and automated results distinct. A release candidate requires all applicable gates to pass; public deployment also requires existing authority, secret/backup custody and deployment smoke evidence.
