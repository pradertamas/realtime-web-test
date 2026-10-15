# Real-Time Browser Test

A framework-free static browser compatibility test for simultaneous public WSS delivery, structured data, DOM updates, Canvas 2D, WebGL and runtime callbacks. This is a diagnostic application with raw measurements, not an automatic certification tool.

## Architecture and files

- `index.html`: entry page linking the two roles.
- `sender.html`, `sender.js`: synthetic JSON producer at approximately 10 messages/second.
- `receiver.html`, `receiver.js`: live measurements, rendering and manual continuity reports.
- `common.js`: session validation, relay URL, message validation, bounded sequence tracking and interval measurement.
- `style.css`: local responsive dark theme with touch-sized controls.

Only native browser APIs are used. There are no packages, build step, external assets, scripts, fonts, cookies, storage, credentials or telemetry. Session IDs are held in page memory only. The public relay is `wss://realtime-relay-k28l.onrender.com/ws`; its health endpoint is <https://realtime-relay-k28l.onrender.com/>. The relay is external to this repository and is not modified here.

## GitHub Pages

Serve the repository root using GitHub Pages. All local links are relative, including when served at <https://pradertamas.github.io/realtime-web-test/>. No compilation is required. A local static HTTP server can also serve these files.

## Pairing

1. Open Sender and Receiver in separate browser contexts.
2. Enter the same unique temporary session ID on each: 1–64 ASCII letters, digits, underscores or hyphens. Session IDs are case-sensitive and are the access boundary; do not reuse a confidential identifier.
3. CONNECT both roles, then START STREAM on Sender. Confirm changing values and approximately 10 received messages/s on Receiver.
4. STOP STREAM pauses transmission. DISCONNECT also stops the sender. Repeated START clicks cannot add timers. A delayed timer sends one sample on its next tick; it does not catch up with bursts. Excessive outgoing buffering stops the stream visibly in the log.
5. DISCONNECT to edit the session ID. There is no automatic reconnection. Each connection attempt after the first counts as a reconnect attempt, including changes of session.

CONNECT is ignored until the previous socket is fully closed. Sender sequence numbers continue across STOP/START and reconnection within the same page; reloading the sender restarts them. A different receiver session clears the displayed sample and sequence history so stale data is not presented as belonging to the new session.

The relay permits one sender and one receiver per ephemeral session, forwards sender messages unchanged to the receiver, and does not forward receiver messages to the sender. The receiver sends no application messages. The relay may spin down after inactivity, so the first connection may take longer. Retry manually if necessary.

## Manual continuity test

1. Establish the connection and confirm live data.
2. START CONTINUITY TEST on Receiver. This snapshots counters and page state.
3. Change the runtime/environment condition externally. The page does not detect external modes.
4. Return and STOP CONTINUITY TEST.
5. Read the full selectable report. Its text area scrolls and can be resized; use overlapping captures as needed. Clipboard access is not required.
6. RESET TEST clears interval measurements and results without restarting connections, listeners, rendering or timers. Another START replaces the previous report. STOP results otherwise remain available.

Reports include elapsed time, connection states, message and sequence deltas, average receive rate, first/last sequence, reconnect attempts, RAF/Canvas/WebGL frames and average rates, timer ticks/rate, interval-specific receive/RAF/timer maximum gaps, page state and lifecycle event deltas. Interval gaps start at START and include the quiet tail up to STOP, even if no event occurs; pre-test gaps are excluded. Lifetime maximum gaps measure completed callback-to-callback gaps, excluding the initial startup period. Recent rates use local monotonic time over each roughly one-second update window.

The receive rates and receive gaps refer to valid sample messages; total and ignored message counts are shown separately. Recent-window rates count events divided by that window's elapsed time, rather than extrapolating from the last pair of events. Final rates divide interval counter deltas by the full continuity interval, including disconnected or inactive time. A test with no valid samples explicitly reports that transport continuity cannot be inferred; its receive gap is the entire interval without observations. Lifetime receive gaps include disconnected time between samples in the same session; a different session starts a new inter-arrival baseline. Interval receive gaps continue across all connection/session changes within the test. RESET affects only the test, not lifetime counters or recent-window rate baselines. RAF gaps measure callback execution time with the same monotonic clock as START/STOP, rather than the browser's earlier frame timestamp.

## Interpretation and limits

Counter deltas show callback/message activity observed during the interval. They do not by themselves prove that the page remained visibly presented for the entire interval. Receiving messages establishes delivery to JavaScript while callbacks execute; RAF and rendering counts establish callback/render calls, not physical display visibility at every instant. No automatic PASS/FAIL is assigned. No one-way network latency is inferred from different devices' clocks.

Missing sequences count forward jumps larger than one, without assuming the initial sequence is one. Late arrivals do not erase earlier gaps. Duplicates are tracked over the most recent 4096 distinct sequence numbers; older repeated values may be classified as out-of-order. A different session resets sequence history, but cumulative counts remain. Use a fresh page/test when restarting the sender sequence in the same session. Invalid or oversized messages are ignored and counted. Logs contain at most 150 entries.

Canvas and WebGL use one shared RAF loop and the latest data, with small local pulse/color animation between messages. WebGL2 is attempted first, then WebGL1. Standard renderer/vendor/version information is shown without debug extensions. Unavailable and lost contexts are reported; restored contexts rebuild rendering resources. Rendering and timer behavior may be restricted by the runtime. Browser/GPU behavior requires testing in the intended browser.

## Local verification

Run `node --check common.js`, `node --check sender.js`, `node --check receiver.js`, and `node verify.cjs`. The verification harness uses native Node APIs and deterministic browser stubs; it does not replace a real GPU/browser test. `node verify.cjs --remote` additionally attempts an isolated 100-message, approximately 10 Hz relay round trip using a random session, when Node provides a native WebSocket API and network access is available.
