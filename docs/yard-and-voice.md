# Yard client, movement and proximity voice

Status: yard/movement/social alpha and server-authorized mediasoup voice are implemented with automated browser evidence. Physical-device audio, public-network reachability and human playtest gates remain pending. Historical feasibility checkpoints below explain the adapter choice.

## Rendering and input

Use a Phaser scene inside a client-only Next.js component. React renders menus, match panels, chat, bot editor and accessibility controls. The bridge transfers typed intents/snapshots and is disposed on unmount. Never reconnect the game socket whenever the scene rerenders.

Use original cartoon prisoners and a compact top-down map with depth sorting by foot position. Initial map: one yard, four fixed circles, spawn points and simple rectangular collisions. Circle occupancy comes from server state. No procedural world, combat or NPC guards.

Desktop WASD/arrows; mobile virtual joystick plus large interaction button. Normalise diagonal input. Cancel movement on blur, touch cancel and modal opening. Camera follows the local avatar; respect reduced motion, UI safe areas and landscape/portrait resizing. Include a text list of nearby circles as an alternative to canvas-only interaction.

Initial implemented geometry: 960×640 pixels, 32 pixels per tile, 10-pixel avatar radius, 96 pixels/second movement, four fixed 64-pixel circles and a one-tile extra interaction reach. A shared pure movement function applies the same rectangular collision checks to server authority and planned client prediction. Initial nearby text routing uses eight tiles. These are tuneable map defaults; these defaults now back the mounted Phaser client and live server. Disconnected presences reserve their last position for 30 seconds before expiry; reconnect binds a new authenticated socket, while service restart respawns at the entrance.

## Movement protocol

Proposed starting values: 20 Hz authoritative server simulation, input sends at up to 20 Hz, position broadcasts at 10 Hz, 100 ms interpolation buffer for remote avatars. Client render rate is independent.

Send axis values and increasing input sequence, not absolute positions. The server uses its own fixed timestep, bounds speed, resolves map collisions and acknowledges processed input sequence. Missing fresh input for 250 ms stops movement. Ignore old/duplicate input and unreasonable sequence jumps.

Predict local movement with the same collision geometry; reconcile to authoritative position and replay remaining input. Smooth small corrections, snap large discrepancies. Remote players interpolate snapshots and freeze rather than extrapolate indefinitely. Mobile tab suspension triggers resync on return.

Server checks actual distance for circle entry and challenges. Walking into a circle opens its prompt; it does not silently occupy a seat. Spectator admission is separate from competitor seats. Bots are displayed as match participants but have no roaming avatar or independent acoustic location.

## Social and match UI

Circle label includes mode, occupancy, round count and phase. Clicking a nearby circle opens Join myself / Enter bot / Watch as applicable. Bot owners retain free movement while their bot plays. Human competitors remain visually seated with a match overlay.

Results are revealed simultaneously to everyone, then animated locally. Animation must never gate server progression. Reconnect can skip old animations to show current state. Display offline, reconnecting, locked, timeout and service-interruption states distinctly.

Render chat as escaped plain text, never HTML. Server determines nearby text recipients at send time; moving later does not unlock old conversations. No global chat feed in the initial protocol.

## Media feasibility result — 14 October 2026

A real browser/SFU spike used LiveKit server 1.13.10, client 2.22.4 and server SDK 2.19.1. An ordinary subscriber received real synthetic-tone RTP packets. A canSubscribe:false listener received zero tracks/packets even after the room-admin updateSubscriptions RPC. A canSubscribe:true listener could resubscribe after server-admin unsubscribe and receive packets again. The real media transport worked; the proposed server-only permission pattern did not.

The related upstream [admin override fix](https://github.com/livekit/livekit/pull/4701) remained open when checked. This is not a claim that client-side attenuation or unsubscribe provides private proximity. The green diagnostic test records the failed design condition; it is not a passed game voice gate.

Next implementation uses a media adapter that creates and closes consumers only through server-authorized signaling (mediasoup is the next candidate), preserving exact distance/block/table rules instead of weakening them. Prove it with modified listeners, reconnection, republish and revocation before enabling the game voice feature. The LiveKit lab is development-only and uses local placeholder credentials, synthetic audio and loopback-only published ports; no real microphone/device/playtest validation is claimed.

## Voice transport

Use WebRTC media via an SFU. The initial LiveKit candidate failed its permission gate; the next adapter uses mediasoup with server-created consumers. Socket.IO carries game control, never raw audio. One logical voice room per yard is a candidate deployment, not an authorization guarantee.

The game service authenticates media signaling through the existing human browser session and controller. Only the current yard connection can allocate transports. Mediasoup requires no reusable room token; transport credentials are ephemeral and disappear on revocation. Allow microphone audio only; disable video, screen sharing and arbitrary data channels. No room-admin credentials reach browsers. Revocation, ban, yard exit and session expiry must remove media access.

Proximity must be enforced on what media a receiver can obtain. Client-side volume alone is not sufficient: a modified client could turn distant audio back up. The media adapter must restrict subscriptions using server-owned membership and positions.

LiveKit exposes subscription management and permissions, but the exact chosen version must prove that clients cannot self-subscribe around server decisions. Test denied subscriptions with a modified client, rejoin, new track publication and token reuse. If hard enforcement cannot be demonstrated, use server-controlled smaller rooms/acoustic zones or a different adapter; do not ship “private proximity” based only on local attenuation.

## Proposed audibility rules

Distances use map tiles. Start with full volume within 3 tiles and attenuation to zero at 8. Server eligibility is distance <=8; remove immediately once outside the permitted range, with no hysteresis extending access. Refresh eligibility at 5 Hz; up to one policy tick of transition latency is expected and should be measured. Instant acoustic privacy is not promised.

Human competitors at the same table hear each other at full volume regardless of small seating distances. Nearby spectators hear table players and can speak normally. A local “mute spectators” filter lets competitors suppress non-seated owners; it does not remove spectators' ability to hear the table. A bot owner's audibility follows the owner's avatar, not their bot's seat.

Blocking suppresses voice and text between the two owners in both directions at the routing layer. It does not erase public match results or identity. Text/voice routing must check the block graph before delivery. A block takes effect at the next routing update; already heard audio cannot be retracted.

Basic proximity uses distance, not wall acoustics. Do not label corners or rooms confidential. More nuanced obstruction is deferred.

## Device behaviour and agent listening

Require an explicit microphone action; default push-to-talk, visible speaking/mute status and one-tap mute/block/report. HTTPS is required for deployed media access. Test permission denial, autoplay restrictions, headphones, speaker echo, audio interruptions, Bluetooth changes and background/resume on real mobile browsers.

No built-in voice recording, transcription or AI hearing. Explain that nearby players may process what they hear through their own bots. Owners implement that themselves within the available device permissions; no game API for arbitrary remote yard audio.

If voice fails, keep gameplay and nearby text operational and show the failure clearly.

## References and gate

Reviewed 14 October 2026:
- [LiveKit receiving media](https://docs.livekit.io/transport/media/subscribe/)
- [Room service API](https://docs.livekit.io/reference/other/roomservice-api/)
- [Tokens and grants](https://docs.livekit.io/frontends/reference/tokens-grants/)

Subscription selection, publish permissions and an enforceable listener ACL are different things. Complete the hostile-client proof in [testing](testing.md) before considering voice privacy solved.

### Server-owned consumer checkpoint

Pinned mediasoup 3.29.0 and mediasoup-client 3.24.5. The native worker runs outside the Node game event loop. The transport layer permits one send/receive transport and one Opus microphone producer per identity, disables SCTP, creates consumers paused, and rechecks authority/audience after asynchronous allocation and before resume. Concurrent allocations are bounded per owner/action. Policy reconciliation closes consumers when eligibility disappears; connection replacement fences old callers.

A real native-worker test verifies denied creation, audience-change closure, publisher revocation and stale connection rejection. It does not transmit browser RTP and therefore is not the final hostile-listener/audio gate. Authenticated signaling, browser transport integration, device controls, routing-failure behavior and actual-device evidence remain incomplete.

### Integrated lifecycle and browser checks

The game now uses the native mediasoup worker through authenticated browser-only signaling. Commands run in a bounded per-socket queue so leave/rejoin order survives asynchronous operations. Join forces an authorization refresh after yard entry; ordinary requests can reuse a snapshot less than 100 ms old. Native callbacks and pending sender allocations check the exact current peer instance, so an old transport cannot close a replacement connection on the same socket.

Real Chromium scenarios cover republishing with blocked/distant listeners, fresh reentry after controller takeover, retained consumers after session expiry/revocation or owner disable, bot-principal media exclusion, and one-way spectator suppression at a real two-human table. The nearby table competitor retains gain 1, while spectators continue hearing the table. Tests walk to acknowledged server positions rather than assuming elapsed wall time proves distance.

Firefox 157.0 and WebKit 27.2 run the real synthetic-RTP privacy scenario alongside Chromium 156.0.8078.4. These are Linux browser-engine checks, not Safari/iOS/Android hardware evidence. Firefox did not establish ICE against the initial loopback-only media listener, even with its local-loopback preference; the same scenario passed on the machine's local network interface without that preference. The test configuration therefore binds media to that interface. Mozilla documents its [loopback ICE restrictions](https://bugzilla.mozilla.org/show_bug.cgi?id=1659672); production must advertise an actually reachable media address. Local Firefox users should configure VOICE_LISTEN_IP to their local interface rather than assuming loopback media works.

Actual microphones, speaker echo, headphones/Bluetooth, background/resume and network changes on physical devices remain release gates. No first-party recording or transcription was added.

## Production HTTPS browser acceptance

test:voice now builds the frontend and runs the actual production game/SFU behind a loopback HTTPS/WSS fixture (3107 → 3119). Browser contexts ignore certificate errors for this loopback-only test fixture; Node Socket.IO clients explicitly trust its generated CA. Keys/certificates have restricted permissions and are removed on teardown/creator exit, including startup failure. These are ephemeral test keys, never deployment credentials.

The production app continues returning 404 for its lab media page. The loopback fixture serves a separately compiled trusted MediaProbe/VoiceClient entry solely for test controls; all identity, movement, media authorization and RTP use the real production backend/native worker. The actual yard's microphone/mute/permission UI is also tested over HTTPS with Secure/HttpOnly cookies. This is local TLS evidence, not public certificates, TURN/NAT, physical-device or human-playtest validation.

Investigation of a development acceptance failure recorded a 671–672 ms stale policy age during an event-loop stall, with current sockets/controllers/yard membership. The guard correctly removed the peers. Acceptance excludes the development compiler, and local authority freshness now uses monotonic elapsed time with the same strict 600-ms bound. The lease anchors to query start, so a slow result cannot renew already stale authority. Structured voice.peer.closed diagnostics include only reason/freshness/authority booleans, not identities or audio; aggregate windows include policy-refresh duration.
