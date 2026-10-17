# Consent Cancel -> cleanup -> fresh pairing (no page reload)

Historical audit of the manual pairing release. The current automatic UX and
pre-consent registration supersede its timing/buttons: see AUTO_PAIRING.md.
Cleanup identity guards and regression verifies remain active.

## Root cause audit

Android MainActivity requests consent before starting WebRtcService. Only
RESULT_OK plus non-null data starts that service. Thus, on consent Cancel there
is no sender WebSocket registration, PeerConnection, offer, ICE queue, capture
or foreground service to disconnect. WebRtcUi is reset; the pending manual code
and scanner/entry UI flags are now explicitly cleared as well. Every retry uses
the unchanged user-choice request and fresh consent.

The browser had a real stale-state gate: after a browser CREATE, `active` held
the waiting receiver PeerConnection and WebSocket. Create, Connect and the input
were disabled, and connect() returned immediately whenever active was non-null.
Android Cancel before registration cannot send peer-left, so those gates lasted
until manual Disconnect or the five-minute waiting timeout. A direct invocation
of connect('create') against the original Git HEAD reproduced retention of the
old peer/socket instead of a new attempt. Page reload discarded active, timers,
event handlers and sockets, allowing the next session to work.

There was also an unbounded asynchronous cleanup dependency: stop() awaited
getStats before closing resources or clearing active/UI. A stalled native stats
promise could retain the same gate even after Disconnect. This risk is covered
by a deliberately never-resolving stats test; it is not claimed to be a captured
Samsung/browser runtime trace.

No separate spinner/connecting/joining/peerPresent boolean exists in this
receiver. Pending UI was represented by active, status and disabled controls.
Offer and ICE state live on that active session; video uses a normal video
element. Cleanup clears srcObject and stops/detaches its tracks too.

Relay registration is scoped to one WebSocket, not reusable for another code.
Existing cleanup deletes an explicit session and sends peer-left/closes the
other peer when either registered party disconnects. No new protocol/runtime
change is necessary. Sender and receiver creator departures were already
tested; tests now also cover joiner departure in both role orders, not-found
after retirement, and subsequent CREATE using the released identifier.

## Fix and lifetime boundaries

* New valid Create/Connect explicitly retires any active attempt before allocating
  a new RTCPeerConnection and WebSocket. Invalid input does not retire a session.
* stop() is synchronous and idempotent, including null/repeated calls. It
  invalidates active before disposing resources, clears timers and frame
  callbacks, detaches handlers, closes/nulls peer/socket, clears queued ICE,
  registration/offer/streaming flags and session intent/code, clears video,
  resets diagnostics and restores controls.
* Old SDP awaits, queued signaling messages, native stats, frame callbacks and
  autoplay failures verify session identity before affecting the current UI or
  sending an answer. Old resources are never reconnected or reused.
* Stop summaries retain the latest one-second periodic stats snapshot. A final
  asynchronous native stats read no longer blocks cleanup; counters may omit
  traffic after the last successful sample. Metric definitions are unchanged.
* Browser creator + Android consent Cancel: browser creator can keep waiting
  because the phone never registered. New Create/Connect retires it explicitly.
  Joining the same still-live creator again remains possible.
* Android creator + consent Cancel: sender CREATE has not registered yet in this
  architecture. The displayed pending code is cleared, and JOIN may report
  not-found. A fresh Android Create requires new consent. If a previously
  registered peer disconnects, the existing relay peer-left/close path retires
  the browser session.

No changes to CREATE/JOIN meanings, media roles, QR/scanner algorithms, STUN,
user-choice configuration or video profile. No TURN/Cloudflare runtime.
experiments/poc4b remains untouched. No commit, push or deployment.

## Automated verification

Run all existing web verifies plus `node verify-cancel-retry.cjs`. The new test
executes the actual receiver code repeatedly in one DOM/VM with controlled peer,
socket and timers. It covers Create/Join after three cancelled pre-registration
attempts, new peer/socket identity, late events and SDP completion, stale ICE,
peer-left/close/error/not-found, stuck stats, UI reset and repeated cleanup.
It models consent Cancel as no sender registration, matching Android ordering;
it does not pretend to test the Android system dialog or real video decoding.

Android ConsentCancellationTest covers both pending intents, repeated Cancel,
state reset and a new pending session. Run assembleDebug, testDebugUnitTest,
lintDebug, plus relay signaling/privacy/symmetric verifies locally.

## Physical retest (required, no reload between attempts)

Use the locally built APK and updated receiver served over HTTPS or permitted
localhost. The existing public page is unchanged until manually published.

1. Browser Create -> Android Enter code -> consent Cancel. On the same page,
   choose Create again. Enter the new code on Android, grant fresh consent and
   verify live video. Repeat choosing single-app and full-screen separately.
2. Browser Create -> Android Scan QR -> consent Cancel. Without reloading,
   Create again, scan the new QR, grant fresh consent and verify video.
3. Android Create -> Cancel at consent. If a browser JOIN was attempted before
   consent completed, not-found is expected because the sender is not registered
   yet. Create again on Android, approve consent, then Connect the new code on
   the same browser page; verify video. Also test Android Stop after an actual
   pairing and repeat with a fresh code, exercising registered peer-left.
4. Repeat three Cancel attempts in sequence without browser reload, then approve
   a completely new attempt and verify video, live diagnostics and Stop.

For every case verify no capture notification/service after Cancel, no stuck
Connecting UI blocking a new attempt, no inherited ICE/offer/diagnostics, and no
camera left active. After closing/replacing a creator, JOIN to its old code must
return not-found/expired; a still-live browser creator remains joinable. Stop
must close the stream. In single-app mode only the chosen app is visible; in
full-screen mode app switching is visible. Physical PASS is not established by
unit/static verification alone.
