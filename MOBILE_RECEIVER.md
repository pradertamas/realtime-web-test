# Mobile browser fullscreen receiver

Explicit opt-in only; desktop browser remains a first-class receiver alongside
mobile browser and the separate native Android receiver.

## URL API and routing

- webrtc-receiver.html?mode=mobile -> confirmation, then receiver CREATE.
- webrtc-receiver.html?mode=mobile&session=<CODE> -> confirmation, then JOIN.
- webrtc-receiver.html?mode=mobile#device=<TOKEN> -> confirmation, then remote resolve.
- Parameter order does not matter. Tokens remain case-sensitive URL fragments.
- Without mode, all valid desktop routes retain their automatic behavior.
- Valid remote fragment takes precedence over a valid session query, then CREATE.
- Duplicate/unknown/empty mode, invalid/duplicate session and invalid/ambiguous
  fragment are rejected without pairing network activity. This validation also
  prevents an invalid session link silently becoming an unrelated CREATE.

Only the literal single mode=mobile enables the mobile gate; no UA detection.
No identity is inferred: the confirmation uses neutral incoming-screen copy.
Mobile startup parses and validates but does not fetch, open a socket, create a
PeerConnection, join or create a session. MOBILE_CONFIRM shows only confirmation
controls; hidden pairing/video controls are not focusable or screen-reader UI.
Cancel shows Reception cancelled and starts nothing, including after timers elapse.

## Fullscreen and common receiver

mobile-receiver.js is a small presentation controller, not a copy of the receiver.
The original engine, signaling, first-frame gating, stats, STUN, orientation,
disconnect grace, QR tools, remote API and video pipeline are shared.

The Receive in full screen button calls receiverRoot.requestFullscreen()
SYNCHRONOUSLY within its click handler BEFORE running CREATE/JOIN/resolve. There is
no preceding await/fetch/timer. The request Promise is observed only for presentation
feedback, never awaited as a prerequisite. Unsupported, disabled, synchronous throw
or rejected fullscreen all continue receiving with the same full-viewport fallback.
Even a pending fullscreen Promise cannot block signaling. Fullscreen is never
requested automatically after signaling, peer-present, fetch or first-frame events.

Standard API references:
https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event
Browser support varies, notably across mobile browser/platform versions. Runtime
feature detection and graceful rejection handling are used rather than private
WebKit APIs or claims that every Safari/Chrome version supports element fullscreen.

Fullscreen presentation (active/viewport) is independent from receiver connection
PAIRING/CONNECTING/STREAMING. fullscreenchange updates only presentation controls;
fullscreenerror shows a discreet fallback notice. Exiting fullscreen never stops,
recreates or renegotiates the peer. Enter full screen is a new explicit gesture.
Exit full screen is available as a separate control. No orientation lock/history
trap, browser-chrome workaround, Wake Lock, service worker or PWA was introduced.

## Layout and lifecycle

The mobile root uses fixed full-viewport layout, 100vh fallback then 100dvh. Pairing
can scroll normally; STREAMING has no page scrolling or decorative margins, black
background and width/height 100% video with object-fit:contain. Safe-area insets
protect the contained video and small Stop/fullscreen/diagnostics overlays. Remote
portrait/landscape and receiver-device rotation naturally relayout without new
pairing/peer or CSS rotate/canvas reconstruction. Desktop selectors are unchanged.
The video still becomes visible only upon the existing renderable-first-frame gate.

Mobile normal Stop/peer loss/failed JOIN runs existing idempotent cleanup and shows
MOBILE_ENDED with Receive again; no automatic CREATE recovery. Receive again requests
fullscreen if needed, then reruns the original URL intent. For a session URL this
means retrying that code, which may now be expired; open a fresh link in that case.
For normal mobile CREATE, Receive again generates a fresh code/QR.
Remote Stop/Cancel/unavailable retains its existing remote message/Try again path.
That button also requests fullscreen directly before a new resolve, without polling.
Desktop auto-recovery and remote Try again behavior are retained.
Pagehide uses existing peer/media/camera/lookup/timer cleanup. Stale fullscreen
Promise completion is ignored after navigation. On bfcache restore mobile mode
requires confirmation again, preventing an unsolicited new session.

## Privacy and release

Persistent secret remains #device= and only enters the existing POST resolve body.
No mobile logs, session-code logs, diagnostics secrets or token query parameter.
No backend, relay, Android or native receiver source changes.
Cache release is 20261017-5 in receiver-release.json. Run the existing
node update-receiver-release.cjs after changing the version; it versions all own
critical assets, including mobile-receiver.js. No per-load timestamp or CDN added.

Run every existing web verify plus node verify-mobile-receiver.cjs. The latter
exercises the actual shared engine and mobile controller in the deterministic DOM/
WebRTC harness: default-route regression, all three gates, invalid inputs, request
ordering, failed/unsupported/disabled/pending fullscreen, double clicks, first frame,
exit/re-entry, rotation without new peer, Stop/retry, unavailable remote, no secret
logs and navigation cleanup. Native browser fullscreen grants and real CSS/video
presentation require the later physical matrix; this is not a physical PASS.

## Later physical matrix (no publishing was performed)

1. Android A sender waiting; on phone B Chrome open ?mode=mobile&session=<A_CODE>.
   Before acceptance A must not receive peer/consent. Press Receive in full screen;
   approve A's MediaProjection chooser and check B's live native HTML video.
2. Open private ?mode=mobile#device=<TOKEN>. Confirm no resolve/phone consent before
   the button. Accept, approve on A, check stream. Keep token out of screenshots/logs.
3. Use a browser where element fullscreen is unsupported/denied: confirm video still
   works in full viewport with contain and a nonfatal notice.
4. Rotate A portrait -> landscape -> portrait; record actual received dimensions,
   ensure no crop/stretch/reconnect. Rotate B independently and repeat.
5. Exit fullscreen while streaming; stream stays alive. Enter full screen returns
   through a new gesture with no peer/session recreation.
6. A Stop -> B ended UI. Receive again in normal mobile CREATE gives a fresh QR/code.
   Session-link retry may require a newly issued sender link if its code expired.
7. Remote phone unavailable -> Try again; make A waiting, try again and approve.
   Also test consent Cancel -> remote Try again and normal mobile Receive again.
8. ?mode=mobile normal CREATE: no code/session before accept; after accept QR/code
   appears. A joins that code, then consent/first-frame/video. Confirmation Cancel
   must produce no pairing traffic and no automatically regenerated session.
9. Desktop default / ?session / #device regression: no confirmation gate, existing
   auto-pairing, remote, Cancel/retry, Stop, rotation and diagnostics still work.
10. Separately execute Android NATIVE_RECEIVER.md's two-device matrix. Its local
    uncommitted implementation is preserved; mobile web does not replace it.

No Android build is needed for this web-only change. No commit/push/deploy.

## Local automated result — 2026-10-17

All 11 web verify scripts PASS: verify.cjs, verify-webrtc.cjs,
verify-pairing.cjs, verify-qr-pairing.cjs, verify-cancel-retry.cjs,
verify-auto-pairing.cjs, verify-receiver-state.cjs, verify-cache-busting.cjs,
verify-orientation.cjs, verify-remote-link.cjs, verify-mobile-receiver.cjs.
Android source/config/docs preservation: 70 tracked/untracked file SHA-256 hashes
match the pre-task snapshot (workspace android-before-mobile-audit.json).
Android's pre-existing 2 modified + 8 new native receiver files remain unchanged.
No Android build was run for this web-only task. Relay working tree stays clean.
Web main has 8 modified files and 3 new files (this document, mobile-receiver.js,
verify-mobile-receiver.cjs). No archive/experiment edits or deployment.
Physical mobile browser/fullscreen/native Android validation remains pending.
