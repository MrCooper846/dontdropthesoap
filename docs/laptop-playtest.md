# Private laptop playtest

This is a local-network device test environment, not a public deployment or completed acceptance evidence. Available hardware reported by the owner: iPhone 12/iOS 17.6.1 and a Mode1 Retro II; Android version, shared Wi-Fi and participant count remain to be confirmed. Borrowed Android phones/tablets and emulators can broaden coverage, but physical audio/background/FPS and four-to-eight-person gates remain distinct.

## Start on this laptop

Run in the Ubuntu repository with Docker Desktop available:

~~~bash
npm run prepare:playtest -- 192.168.1.104
npm run playtest:up
npm run playtest:certificate
npm run test:playtest
~~~

Use the laptop's actual Wi-Fi IPv4 address from Windows ipconfig. The example address was observed during setup; it can change. prepare:playtest accepts only private IPv4 addresses, writes a private .env.playtest once and preserves existing secrets/configuration on later calls. If the address changes, update only SOAP_PLAYTEST_ADDRESS in that private file and restart the stack. Do not rotate database/session secrets casually: the persisted playtest database and guest cookies rely on them.

The separate soap-playtest Compose project builds the production game, creates its own PostgreSQL database/volume and local certificate authority, and enables yard, bots, league and voice. Only HTTPS TCP 3443 and media TCP/UDP 18000–18127 are published on the selected laptop address; the database and application HTTP port are internal. No router forwarding or public tunnel is configured. The original development PostgreSQL service/data are untouched. npm run playtest:down stops this stack and preserves its database and certificate volumes. Do not remove its volumes to stop it.

## Connect the phones

Put the laptop and phones on the same trusted Wi-Fi; guest/client-isolated networks may prevent connections. Open https://192.168.1.104:3443 using the configured address.

Caddy issues a local test certificate using its own CA. Export the public CA with npm run playtest:certificate; it is data/playtest/laptop-root.crt. Compare its SHA-256 fingerprint with the command's printed fingerprint before installing it. Transfer that public certificate to your own test devices through a trusted method. Never transfer Caddy private keys or .env.playtest.

On iPhone, install the downloaded certificate profile, then enable its root under Settings → General → About → Certificate Trust Settings. See [Apple's manual-certificate instructions](https://support.apple.com/en-gb/102390). Remove the test profile after testing. On Android, use that device's certificate installation controls for a CA certificate; record the actual OS/browser and whether Chrome accepts the resulting HTTPS origin. A warning bypass or ignored-certificate browser test does not establish a trusted microphone origin.

Windows may require allowing Docker Desktop on the Private network through its firewall. Confirm the actual connection failure first; no firewall, router, WSL mode or device trust settings are changed by these scripts. Phone reachability must be tested on the phone; a successful laptop request is not sufficient.

## First device pass

On iPhone Safari and Android Chrome, verify trusted HTTPS, alias/yard entry, touch movement/rotation, circle inspection and a complete human match. Then explicitly join voice, enable the microphone and hold/release push-to-talk. Try denial/recovery, lock/background/resume, block/unblock and nearby/distant listening with the other phone. Use headphones where available and record echo/device behavior separately.

Continue with Blockly construction/practice/publish/play/edit and the physical performance capture in [playtest.md](playtest.md). Two devices establish only a two-device technical check; the first social session still needs four to eight people. Emulators do not count as people or physical mobile/audio/FPS evidence.

test:playtest verifies CA/hostname-validated HTTPS, built yard, guest/controller, proxied WebSocket, native voice allocation, advertised LAN ICE candidates and media TCP reachability. It does not transmit real microphone audio or prove UDP RTP/device reachability.

The initial running image has build oJ7hOB8l1WPWJgd_ZnqcV and image ID 5483b0c8f451f2e93ade2c44f711f8860414b7622025138443de461432289361. Its aggregate production metrics also show wall/monotonic clock discontinuities, so this Docker setup does not resolve the laptop timing-validation issue.

This local Wi-Fi stack does not prove cellular/NAT/TURN/public hosting, off-host backups, operational alerts or clock continuity. Keep those gates open. Laptop clock diagnostics remain available through npm run diagnose:clock against the separate development soap_load fixture.

## Technical references

The proxy uses [Caddy's internal TLS issuer](https://caddyserver.com/docs/caddyfile/directives/tls) and [Docker Desktop published-port networking](https://docs.docker.com/desktop/features/networking/). Certificate material and PostgreSQL data persist in the separate project's volumes. The exported public certificate is ignored under data/playtest; private settings match the repository's .env ignore rule.


## Map-first UI retest

After the laptop stack is rebuilt, refresh the same HTTPS URL. The map now remains in the viewport. Use Chat, Tables and People on the bottom dock; approaching a circle also gives an Inspect prompt. Table controls appear below the map in portrait and alongside it in landscape/desktop. Match settings expand separately. The table button keeps the current countdown/locked state visible when another panel is open. Close match view collapses the controls without leaving the game. Voice remains connected while other panels open and close.

On the iPhone, repeat joining/readiness/a complete human game in both orientations, then type with the real keyboard and return to movement. Verify neither the browser toolbar nor keyboard hides the next action. Try microphone/push-to-talk while opening and closing Chat. Automated phone-size and native-RTP tests cover these UI paths, but actual iOS keyboard/safe-area/audio behavior still needs device evidence.
