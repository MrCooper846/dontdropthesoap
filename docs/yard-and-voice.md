# Yard client, movement and proximity voice

Status: proposed alpha design; voice authorization requires a feasibility spike before implementation is committed to a provider.

## Rendering and input

Use a Phaser scene inside a client-only Next.js component. React renders menus, match panels, chat, bot editor and accessibility controls. The bridge transfers typed intents/snapshots and is disposed on unmount. Never reconnect the game socket whenever the scene rerenders.

Use original cartoon prisoners and a compact top-down map with depth sorting by foot position. Initial map: one yard, four fixed circles, spawn points and simple rectangular collisions. Circle occupancy comes from server state. No procedural world, combat or NPC guards.

Desktop WASD/arrows; mobile virtual joystick plus large interaction button. Normalise diagonal input. Cancel movement on blur, touch cancel and modal opening. Camera follows the local avatar; respect reduced motion, UI safe areas and landscape/portrait resizing. Include a text list of nearby circles as an alternative to canvas-only interaction.

Initial implemented geometry: 960×640 pixels, 32 pixels per tile, 10-pixel avatar radius, 96 pixels/second movement, four fixed 64-pixel circles and a one-tile extra interaction reach. A shared pure movement function applies the same rectangular collision checks to server authority and planned client prediction. Initial nearby text routing uses eight tiles. These are tuneable map defaults; the domain implementation does not yet imply a mounted yard client.

## Movement protocol

Proposed starting values: 20 Hz authoritative server simulation, input sends at up to 20 Hz, position broadcasts at 10 Hz, 100 ms interpolation buffer for remote avatars. Client render rate is independent.

Send axis values and increasing input sequence, not absolute positions. The server uses its own fixed timestep, bounds speed, resolves map collisions and acknowledges processed input sequence. Missing fresh input for 250 ms stops movement. Ignore old/duplicate input and unreasonable sequence jumps.

Predict local movement with the same collision geometry; reconcile to authoritative position and replay remaining input. Smooth small corrections, snap large discrepancies. Remote players interpolate snapshots and freeze rather than extrapolate indefinitely. Mobile tab suspension triggers resync on return.

Server checks actual distance for circle entry and challenges. Walking into a circle opens its prompt; it does not silently occupy a seat. Spectator admission is separate from competitor seats. Bots are displayed as match participants but have no roaming avatar or independent acoustic location.

## Social and match UI

Circle label includes mode, occupancy, round count and phase. Clicking a nearby circle opens Join myself / Enter bot / Watch as applicable. Bot owners retain free movement while their bot plays. Human competitors remain visually seated with a match overlay.

Results are revealed simultaneously to everyone, then animated locally. Animation must never gate server progression. Reconnect can skip old animations to show current state. Display offline, reconnecting, locked, timeout and service-interruption states distinctly.

Render chat as escaped plain text, never HTML. Server determines nearby text recipients at send time; moving later does not unlock old conversations. No global chat feed in the initial protocol.

## Voice transport

Use WebRTC media via an SFU, with LiveKit as the first candidate. Socket.IO carries game control, never raw audio. One logical voice room per yard is a candidate deployment, not an authorization guarantee.

The game service signs short-lived room-scoped tokens only for human browser sessions currently present in that yard. Allow microphone audio only; disable video, screen sharing and arbitrary data channels. No room-admin credentials reach browsers. Revocation, ban, yard exit and session expiry must remove media access.

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
