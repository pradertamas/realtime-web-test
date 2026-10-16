# Screen Receiver - P2P pairing release

The normal receiver is webrtc-receiver.html. Both phone and browser offer Create
pairing, Scan QR code and Enter pairing code. Either can create; Android always
sends the screen and makes the offer, browser always receives and answers.
The joining phone requests fresh screen-capture consent after code validation.
A QR URL opened normally prefills ?session=<CODE> and waits for Connect; an
explicit successful in-page Scan validates the payload and joins immediately.
Input is trimmed, uppercased and validated against
23456789ABCDEFGHJKLMNPQRSTUVWXYZ. No long session ID, account or receiver app.

The active code uses native RTCPeerConnection, STUN discovery and policy all.
There are no TURN servers, Cloudflare requests, credential endpoints or tokens.
The WSS service at wss://realtime-relay-k28l.onrender.com/ws carries only
ready/offer/answer/trickle ICE/bye. Video travels directly through WebRTC to a
normal autoplay/playsinline video element. Failed direct connections show:
Direct connection could not be established.

## Release files

- webrtc-receiver.html: pairing input, video and collapsible diagnostics.
- webrtc-receiver.js: direct signaling/media, stats, timing and summaries.
- pairing.js: short-code validation and query parsing; no persistence.
- qr-tools.js and vendor/: local QR scanning/generation, pinned source and licenses.
- receiver-ui.css and style.css: local styles.
- index.html: entry page.

Advanced diagnostics retain ICE/peer state, selected candidates, resolution,
codec, FPS, bitrate, bytes, RTT, dropped frames and best-effort frame timing.
Timestamp support varies: N/A is valid; this is not laboratory glass-to-glass
latency. Summaries remain only in page memory. Codes/QR URLs are session secrets;
referrer policy is no-referrer, but browser history can retain the URL.

The older diagnostic sender.html/sender.js, receiver.html/receiver.js and
common.js remain available via index.html. They send synthetic JSON samples,
not Android video. They use manual diagnostic IDs; the relay requires 6-64
ASCII letters/digits/underscore/hyphen even if the older UI accepts shorter IDs.
The relay is two-way; the old sample receiver simply does not send messages.

## Run and check

Serve the project root locally, for example:

```text
npx --yes http-server . -p 8080 -c-1
```

Open http://localhost:8080/webrtc-receiver.html. The public URL is
https://pradertamas.github.io/realtime-web-test/webrtc-receiver.html . New assets
must be manually published before the public QR flow uses them. No deployment
was performed. A static release must include the listed root assets and exclude
experiments/; do not publish the historical snapshot receiver as an entry point.

```text
node verify.cjs
node verify-webrtc.cjs
node verify-pairing.cjs
node verify-qr-pairing.cjs
node --check pairing.js
node --check webrtc-receiver.js
```

These cover existing diagnostics, direct signaling/ICE/stats/timing, create/join,
collision/not-found, pairing/QR rules and local camera cleanup. Scan requests
video-only permission only on click, prefers environment/any camera, and stops
tracks on success/cancel/hide/navigation, including late permission resolution.
Native BarcodeDetector has a local jsQR fallback; local qrcode-generator makes
browser QR images. No camera frames are uploaded or attached to a media peer.
Camera scanning needs HTTPS or permitted localhost; denied/unavailable cameras
have a manual-code fallback. No runtime CDN is required.
Physical stability still requires device/browser runs. Full four-flow matrix:
sibling ui-capture-test/SYMMETRIC_PAIRING.md. Release the intent-aware relay and
both updated clients together; no deployment was performed here.

The historical PoC 4B TURN sources/tests/docs are preserved exclusively under
experiments/poc4b/. They are not loaded by this receiver or part of the release.
