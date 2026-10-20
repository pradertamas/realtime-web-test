# Request-first browser recipient (local implementation; not deployed)

Canonical entry: https://pairing.pradert.synology.me/connect with the V1 fragment
defined in realtime-relay/docs/CONNECTION_REQUEST_V1.md. The parser accepts exactly
v/r/c/i in any order, canonical unpadded 16-byte Base64URL ID/capability, send/receive,
and a maximum 256-character fragment. Percent encoding and unknown fields are rejected.
The capability stays in browser-local fragment memory and Authorization headers.
The HTTP landing page never sees it and never Accepts. No analytics or external code.

Only SEND initiators support browser RECEIVE. Preview must agree with the role hint.
RECEIVE initiators get an Android-application-required message, without Accept or capture.
Accept is an explicit button action. A secure 32-byte claim is saved in sessionStorage
before submission and reused after uncertain responses. Subsequent winner status and
readiness use claim auth, never capability continuation. Private tab storage failure
disables Accept. Storage is not durable recovery or a cross-tab ownership guarantee.
Server first-winner and duplicate socket checks remain authoritative.

During ACCEPTED setup, a serialized two-second polling cycle renews ready:true (the
existing ten-second server lease is unchanged). Android creates the binding; browser
only reads its receiver/JOIN assignment from winner status. The protected WebSocket
uses the assigned code, role and intent, then a request-auth frame with claim auth.
There is no unprotected fallback, initiator Session call, or secret in its URL.

connection-request-media.js is a request-specific adapter using the proven native
browser answerer pattern: STUN-only ALL, serialized offer/answer/early ICE, bounded
candidate queues, video track, first-frame detection, 45-second offer setup timeout
and four-second disconnect grace. Existing legacy receiver files are unchanged.
An explicit Play video control is available for autoplay restrictions.

All callbacks/timers belong to an exact local attempt. Replacement retires old work.
Setup polling has an absolute server-derived connectBy bound, requests have a 15-second
I/O bound and 16 KiB response limit, and network/rate failures require explicit retry.
Retry-After gates retries; no infinite automatic retry or reconnect is introduced.

Stop closes local media immediately, attempts bye on an admitted socket, and makes one
best-effort winner withdraw only before establishment/known CONNECTED. Unload does not
claim withdrawal success; it closes local resources and preserves the saved claim for
setup reload. Reload of already CONNECTED media cannot reconstruct/re-register that
session: request a new link. No signaling reconnect, ICE restart or renegotiation.
Server setup deadlines remain authoritative when a tab disappears.

## Same-origin asset export and review

The five connection-request HTML/CSS/JS files here are the source of truth. Run:

    node export-connect.cjs
    node export-connect.cjs --check
    node verify-connection-request.cjs
    node verify-connection-request-integration.cjs

Export writes only the explicit allowlisted copies in pairing-api/public/connect-assets.
The verifier compares bytes. No build system, CDN or runtime GitHub Pages dependency.
The integration test uses the sibling relay locally with synthetic requests and real
HTTP/protected WebSocket admission plus synthetic SDP. It does not prove native ICE,
video, or physical PASS. Neither local export nor tests deploy anything.

Later deployment must publish the PHP route and matching complete asset export on the
pairing origin, with the route-specific CSP and no-store/no-referrer/nosniff headers.
Do not change Android links, assetlinks, relay protocol or the legacy pages. Review the
NAS routing instructions before deployment; no deployment has been performed.
