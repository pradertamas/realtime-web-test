# Remote receiver startup

RemoteLink.entry routes normal page -> existing auto-CREATE; ?session=<CODE> ->
one direct ephemeral receiver JOIN; #device=<TOKEN> -> remote lookup with NO own
CREATE. A valid device fragment takes priority over a session query. Any nonempty
malformed/ambiguous fragment (including extra fields or encoded syntax) shows
Invalid remote sharing link without a network request. Without a fragment, a valid
session query joins; otherwise normal auto-CREATE runs. Legacy device query
parameters are not read as credentials and do not trigger remote resolve. Tokens are canonical
22-character Base64URL encodings of 16 bytes (128 bits), not manually normalized.

Remote mode shows Connecting to phone, POSTs JSON {token:...} to
https://realtime-relay-k28l.onrender.com/remote/resolve, with cache:no-store,
credentials:omit and referrerPolicy:no-referrer. A 15-second abort bounds lookup.
Available response {status:"available",session:"<CODE>"} enters the existing JOIN
receiver and MediaProjection/offer/answer path. The WSS URL has only the short
ephemeral session, role and intent. The long token is never used as session ID.

Unknown/offline/busy, rate-limit/network failure or malformed response shows
This phone is not currently available for screen sharing. Open the sharing app
on the phone and try again. Try again explicitly reuses the SAME token for a new
resolve. No aggressive polling, no local CREATE fallback. There is no token TTL.

The existing CONNECTING panel holds remote lookup/unavailable/ended messages;
no black video and no local QR/code UI appear. First actual frame uses the
unchanged STREAMING path. Stop, peer-left, Android consent Cancel or connection
failure uses existing idempotent cleanup, then remote-ended/Try again, not local
pairing. Android auto-CREATE republishes the same persistent token when waiting.
Pagehide aborts lookup and invalidates late responses/timers; no retired response
can create a socket after navigation. pageshow can resolve again after bfcache.

The fragment is not sent in the hosting HTTP request. The bearer secret may
remain in browser history, bookmarks, clipboard and the selected share app.
Never put it in diagnostics, console/relay logs or request URL parameters.
The secret remains in the bearer page URL and in memory for
Try again; it is not persisted to browser storage or displayed in diagnostics.
Existing no-referrer metadata protects outgoing referrers; fetch explicitly
omits them too. Sharing the URL intentionally gives its bearer capability to
the recipient. It never grants capture permission without phone approval.

remote-link.js is a local versioned asset; receiver-release.json is bumped to
20261017-4 using the existing updater, including all critical own assets. No
runtime CDN, new scanner library, TURN, Cloudflare or media pipeline changes.

Run all existing verifies plus node verify-remote-link.cjs. Tests cover three
startup routes/no competing CREATE, syntax, POST/body/no-store/referrer behavior,
available JOIN/first frame, unavailable/retry, invalid input, Stop/Cancel, stale
fetch after pagehide, and diagnostics leakage. They use fake tokens/media.
Device/process restart, hosted CORS and real video require physical validation.

Physical: open a privately copied link while phone home waits, approve sharing,
test offline/busy -> Try again, reuse after Stop, 5-minute rotation, Regenerate
old/new link, Cancel/retry and portrait/landscape. See Android REMOTE_LINK.md in
this workspace for the A-J matrix. Publish only manually after review: include
remote-link.js and the regenerated HTML plus all referenced assets. The relay
endpoint must also be manually deployed. No deployment was performed here.
