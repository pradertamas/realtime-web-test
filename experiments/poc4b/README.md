# Inactive PoC 4B receiver source snapshot

The three files here preserve the exact local TURN receiver HTML/JS and verifier
before the pairing UX task changed the active root receiver to STUN/P2P only.
They are historical source references, not a runnable/deployed receiver package.
The old helper webrtc-network.js and verify-network.cjs now also reside here,
outside the release root. The active receiver never loads them. Do not use this snapshot
as a normal receiver or include it in the public release asset list.

No experimental files were deleted. The active entry point is root
webrtc-receiver.html, loading pairing.js and webrtc-receiver.js only.
