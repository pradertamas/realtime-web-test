# Receiver views and release cache version

Only this web project changes. Android, relay, pairing protocol, auto-pairing,
QR/scanner, media roles, video profile and five-minute rotation are unchanged.

## View rules

PAIRING: default HTML view and every fresh/retired attempt. Own CREATE displays
its QR/code as soon as the existing auto-pairing code runs. Registration/open
alone cannot reveal video. A JOIN in progress retains the pairing view until
peer-present, though its consumed own code is correctly removed.

CONNECTING: peer-present or a validated offer. Pairing controls and video are
both hidden; only a simple waiting message and Stop/optional Play are available.
ICE/connection connected is not sufficient to show video.

STREAMING: loadeddata/playing with HAVE_CURRENT_DATA (readyState >= 2) and
positive video dimensions, or a current-session requestVideoFrameCallback with
an attached stream. loadeddata is needed even on rVFC browsers: display:none
can suppress compositor callbacks. This checks frame availability, not a fixed
timeout or an unmuted track alone. rVFC timing collection is unchanged. View DOM
updates occur on the first frame only, not on every frame. Diagnostics collapse
when streaming begins; the picture uses object-fit:contain without cropping.

All three view panels use hidden and aria-hidden together. Hidden form controls
are removed from tab navigation and the accessibility tree. Streaming hides the
pairing QR/code/input/instructions. The connecting panel has aria-live. Video is
hidden in initial markup before JS/CSS loads, preventing a black startup panel.

Playback references:
https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState

## Disconnect and cleanup

DISCONNECT_GRACE_MS = 4000 in webrtc-receiver.js. Both connection and ICE events
use one per-attempt timer. Repeated disconnected events do not extend or stack
it. Once neither state is disconnected and connected/completed is observed,
the timer is cancelled and an already streaming view stays visible. Failed or
closed immediately retires the attempt. Track ended, peer-left, bye and Stop
also retire immediately. These are real end signals, not temporary ICE states.

Cleanup cancels grace/frame/session timers, detaches playback and peer handlers,
pauses video, stops/removes tracks, clears srcObject and calls load() to discard
the previous media resource. The first-frame flag and view reset. Existing
identity guards reject old playback/SDP/stats callbacks. The existing auto-pairing
recovery creates a fresh own QR/code after one second without reload. JOIN
not-found/rate-limited/signaling errors take the same pairing recovery path.
Rotation still applies only to waiting own CREATE, never connecting/streaming.

## Cache/release source of truth

receiver-release.json contains the one editable release version. For example,
20261017-1. Bump it for every release that changes receiver HTML/own JS/CSS,
then run node update-receiver-release.cjs. It deterministically writes explicit
?v=<release> URLs into static HTML for style.css, receiver-ui.css, pairing.js,
qr-tools.js, webrtc-receiver.js and auto-pairing.js (and future own JS/CSS refs).
Run node verify-cache-busting.cjs; it fails on a missing or mismatched version,
checks all critical refs and tests version changes/idempotence without editing
release files. There is no additional browser bootstrap or JSON fetch.

Local vendor files are pinned by filename/version; neither their contents nor
URLs are changed. If changing a vendor in the future, use a new pinned filename.
Do not reuse a published release version after changing its assets. Publish
HTML and assets together; include the updated receiver-ui.css and every referenced
own JS. Unchanged release URLs remain cacheable. The guarantee concerns fresh
HTML fetching the new asset URLs: it cannot refresh an already open tab or
override hosting HTML-cache policy, offline caches or external service workers.
No service worker or blanket no-cache policy is introduced.

## Verification and physical retest

All prior web verifies remain active. verify-receiver-state.cjs executes the
actual receiver/auto-pairing code with a fake clock/media/network to test views,
first-frame/fallback, grace/recovery, single timer, cleanup and stale events.
It does not prove physical browser decoding, layout or hosted caching.

1. Open updated receiver normally: own QR/code, Scan/input, no video rectangle.
2. Join from Android via QR or code: waiting text, no black video before consent.
3. Allow either sharing choice: first actual image reveals video and hides all
   pairing controls. Check portrait scaling and collapsed diagnostics; repeat
   both Android-first and browser-first pairing directions.
4. Android Stop: video vanishes, new QR/code returns without reload; pair again.
5. Hard network loss/failed/closed: verify automatic new pairing and no old frame.
6. Controlled disconnected shorter than four seconds: no pairing flash; recovery
   keeps the stream. Longer than four seconds: cleanup and new own pairing.
7. Join a nonexistent code, cancel consent, repeat: no black panel or stuck view;
   own pairing returns. Check five-minute waiting rotation and no media rotation.
8. Cache test on a manually approved hosting/staging release: load release A
   with browser caching enabled, publish coherent release B with a bumped JSON
   version and regenerated HTML, then normal refresh. DevTools Network should
   show B's ?v= URLs for every own JS/CSS, without Ctrl+F5. A second B refresh
   may reuse cached B assets. Deployment/cache validation was not performed here.

No commit, push or deployment. No experiment/archive modifications.
