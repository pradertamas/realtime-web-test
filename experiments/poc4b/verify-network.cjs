'use strict';
const assert = require('node:assert/strict');
const { NetworkTest: n } = require('./webrtc-network.js');
assert.equal(n.gbPerHour(100, 0), null);
assert.equal(n.gbPerHour(0, 120), 0);
assert.equal(n.costPerHour(n.gbPerHour(0, 120), .05, true), 0);
assert.equal(n.costPerHour(n.gbPerHour(100, 0), .05, true), null);
assert.equal(n.gbPerHour(undefined, 120), null);
assert.equal(n.gbPerHour(NaN, 120), null);
assert.equal(n.gbPerHour(-1, 120), null);
assert.equal(n.gbPerHour(100, Infinity), null);
assert.equal(n.gbPerHour(Number.MAX_VALUE, .001), null);
assert.equal(n.gbPerHour(1e12, 1000), 3600);
const gb = n.gbPerHour(25972571, 124.15);
assert.ok(Math.abs(gb - .7531313379) < 1e-10);
assert.equal(n.costPerHour(gb, .05, true), gb * .05);
assert.equal(n.costPerHour(gb, .05, false), null);
assert.equal(n.costPerHour(gb, -1, true), null);
assert.equal(n.costPerHour(null, .05, true), null);
assert.equal(n.costPerHour(Number.MAX_VALUE, Number.MAX_VALUE, true), null);
const now = Date.now();
const config = { version: 1, configId: '01234567-0123-0123-0123-012345678901', mode: 'AUTO', expiresAt: now + 600000,
  usdPerGb: .05, iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'fixture', credential: 'fixture' }] };
assert.equal(n.configuration(config, now).iceTransportPolicy, 'all');
assert.equal(n.configuration(config, now).iceServers.length, 2);
assert.equal(n.configuration({ ...config, mode: 'FORCE_TURN' }, now).iceTransportPolicy, 'relay');
assert.equal(n.configuration({ ...config, mode: 'FORCE_TURN' }, now).iceServers.length, 1);
for (const changed of [{ mode: 'invalid' }, { version: 0 }, { configId: '' }, { expiresAt: now }, { usdPerGb: -1 },
  { iceServers: [] }, { iceServers: [{ urls: ['turn:other.invalid:3478'], username: 'x', credential: 'x' }] }]) {
  assert.throws(() => n.configuration({ ...config, ...changed }, now));
}
assert.equal(n.relayPair('relay', 'relay', 'succeeded'), true);
assert.equal(n.relayPair('relay', 'srflx', 'succeeded'), false);
assert.equal(n.relayPair('relay', 'relay', 'in-progress'), false);
assert.equal(n.relayPair(undefined, undefined, undefined), false);
assert.equal(n.addressFamily('192.0.2.1'), 'IPv4');
assert.equal(n.addressFamily('2001:db8::1'), 'IPv6');
assert.equal(n.addressFamily(undefined), 'N/A');
console.log('PASS network configuration/mode validation, relay proof, decimal GB/hour and cost edge cases (zero, normal, high bitrate, missing/invalid stats).');
