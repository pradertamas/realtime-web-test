# Automatic pairing (local, pending physical validation)

Open webrtc-receiver.html: a new Web Crypto six-character CREATE receiver
registration and local QR appear immediately. The phone separately creates a
SecureRandom CREATE sender registration. Neither side starts capture merely by
opening. Android is always the sender/offerer and browser receiver/answerer.

## States and replacement

creating -> waiting -> connecting (phone consent) -> connected/streaming.
Code entry or scan from an own creating/waiting state first synchronously closes
the old peer/socket, clears its timers/ICE/handlers/video, then allocates a new
JOIN receiver peer/socket. Old callbacks cannot affect the new active identity.
Code input is disabled during JOIN and media; no parallel JOIN is admitted.

Input trims whitespace, uppercases ASCII letters, rejects characters outside
23456789ABCDEFGHJKLMNPQRSTUVWXYZ and limits length to six. A complete code joins
after 250 ms without another edit. Editing/deleting cancels the timer. Paste
handles surrounding whitespace before maxlength truncation; IME composition
waits for completion. An explicit successful QR scan joins immediately. The
existing camera implementation still decodes locally and stops tracks on
success/cancel/hide/navigation; no decoder/dependency change.

Valid ?session=<CODE> links directly JOIN without an own CREATE (see REMOTE_LINK.md).
Ordinary page opening stays on CREATE. Invalid links show an error without JOIN.

CREATE collision: fresh code and at most four attempts in one registration
sequence. Exhaustion, failed JOIN, peer-left, Stop and network failure retire the
attempt and schedule a fresh CREATE after one second, retaining the error in a
separate visible message. No old code is resumed. Pagehide cancels recovery,
input and session timers, camera and sockets; pageshow after bfcache creates
fresh waiting state. No automatic recovery runs while the page is navigating.

PAIRING_ROTATION_MS = 300000 in auto-pairing.js. Only a registered, unpaired own
CREATE rotates; peer-present cancels rotation before consent. JOIN/connected/
streaming never rotate. Rotation closes the old registration/peer and generates
a fresh code. Waiting rotation is separate from connection/registration
deadlines. Retained media summaries use the latest periodic stats snapshot.

## Android handshake

Android's PairingHost owns the pre-consent socket on the main thread without a
foreground service, capture or consent token. Peer-present transitions to
CONSENT. Only a resumed Activity claims one consent request per epoch. JOIN
registers before consent too. On Allow, WebRtcService starts its required
mediaProjection foreground service, fresh ScreenCapturerAndroid and sender peer,
then attaches to the SAME live registration; it must not reconnect a consumed
CREATE/JOIN reservation. Its local peer-present handoff starts the normal offer.
Browser waits for that offer before answering. No new signaling type is needed.
Cancel now closes a real pre-consent registration; existing relay peer-left
retires the browser counterpart. Both then return to fresh automatic pairings.

## Checks and physical matrix

Run all existing web verifies plus verify-auto-pairing.cjs. Run Android
assembleDebug/testDebugUnitTest/lintDebug and relay signaling/privacy/symmetric/
join-limit verifies. State tests do not replace physical camera/consent/video
checks. No commit, push or deployment was performed. For physical tests use the
updated local APK and updated page served over HTTPS/permitted localhost, or
manually publish after review. The existing public receiver is not updated here.

A. Browser open, own QR/code visible without buttons; Android open -> Scan QR ->
consent -> Full screen -> video.
B. Browser open -> Android type the code -> sixth valid character + 250 ms ->
consent -> video. No Continue.
C. Android open, QR/code without consent -> browser Scan QR -> automatic JOIN ->
Android chooser -> video.
D. Android open -> browser type its code -> 250 ms -> Android chooser -> video.
E. Paste a lowercase valid code with outer whitespace on each side; one JOIN.
Try invalid, short, long and edited codes; no premature/duplicate JOIN.
F. With both own codes visible, join one from the other. The joining side's old
code expires; only the target code pairs; no old ICE/diagnostics survive.
G. Cancel consent three times with fresh pairings, then Allow without reloading.
Both sides regain usable own QR/code; no capture notification after Cancel.
H. Stop from either side after video; verify new codes and pair again. Repeat
single-app (only selected app) and full-screen (app switching visible), at least
two minutes each for a streaming stability check.
I. Wait five minutes while unpaired: new code/QR, old JOIN not-found, no extra
live socket. While connected/streaming wait equally long: code must not rotate.

Also test camera permission denial/unavailable/cancel, app background/reopen and
browser reload/navigation. Own waiting Android registrations close on app
background, except scanner/consent overlays; active media stays with its service.
An app reopen creates a new waiting code. Old consent epochs cannot authorize a
new pairing. After Stop the phone regenerates when its home is visible, or on
return to the app if it was sharing another application.

## Relay note

CREATE/JOIN/peer-present remain unchanged; only a `rate-limited` registration
rejection was added. The relay uses code/global in-memory JOIN budgets, not
unverified forwarded IPs. See its README for limits and proxy caveats. If manually
deploying this safeguard, include both server.js and join-limit.cjs. No TURN,
Cloudflare, video relay, new dependencies or provider credentials are involved.
