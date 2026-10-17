# Screen Receiver - P2P pairing release

The normal receiver is webrtc-receiver.html. Both phone and browser automatically
create a private waiting pairing and display their own QR/code when opened.
There are no Create/Connect/Continue buttons. Scan the other device or enter its
code to replace your waiting pairing and join. Android always sends and offers;
browser always receives and answers. Only actual peer presence triggers fresh
Android screen-capture consent, never merely opening the app.
A valid ?session=<CODE> link now joins through the same 250 ms debounce as code
entry, because there is no Connect button. Invalid links do not join.
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
- auto-pairing.js: startup, 250 ms code debounce, recovery and waiting rotation.
- pairing.js: short-code validation and query parsing; no persistence.
- qr-tools.js and vendor/: local QR scanning/generation, pinned source and licenses.
- receiver-ui.css and style.css: local styles.
- receiver-release.json and update-receiver-release.cjs: single release version
  and deterministic HTML asset URL updater (development/release tools only).
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
node verify-cancel-retry.cjs
node verify-auto-pairing.cjs
node verify-receiver-state.cjs
node verify-cache-busting.cjs
node verify-orientation.cjs
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

Historical Cancel/retry lifecycle audit:
[CANCEL_RETRY.md](CANCEL_RETRY.md). A fresh Create pairing or Connect closes the
previous attempt; Disconnect also resets it. Android consent cancellation before
registration leaves a browser-created pairing waiting, so it can be replaced
without reloading. The current automatic UX supersedes the manual buttons in
that audit; see [AUTO_PAIRING.md](AUTO_PAIRING.md). Stop retains the latest periodic stats snapshot rather than
waiting for a possibly stalled native getStats call.

The historical PoC 4B TURN sources/tests/docs are preserved exclusively under
experiments/poc4b/. They are not loaded by this receiver or part of the release.

## Receiver views and asset cache version

PAIRING shows code/QR and joining controls with the video panel fully hidden.
Actual peer presence switches to CONNECTING, still without a black video panel.
The first renderable frame switches to STREAMING and hides the pairing controls.
Stop/permanent disconnect returns to automatic pairing. Brief disconnected
states get one four-second grace timer; recovery cancels it.

Before publishing a changed receiver release, change `version` in
`receiver-release.json` to a new value, then run:

```text
node update-receiver-release.cjs
node verify-cache-busting.cjs
```

Publish the updated HTML together with its own JS/CSS. The updater writes the
same `?v=<version>` to every own receiver JS/CSS reference, including style.css.
Pinned vendor filenames remain unchanged. No runtime timestamp, manifest fetch,
bundler or service worker is added. Same-release assets remain cacheable.
See [RECEIVER_UI_RELEASE.md](RECEIVER_UI_RELEASE.md) for state rules, cache scope
and the physical retest. No deployment was performed.

Android content resize is now reflected in Advanced diagnostics as `Current
received video` (actual videoWidth x videoHeight) alongside inbound frame
width/height. Existing contain/full-viewport layout stays unchanged; resolution
changes keep the same STREAMING view. verify-orientation.cjs covers these rules.
