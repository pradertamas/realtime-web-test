/* Shared, dependency-free diagnostics. No persistent storage. */
(function (root) {
  'use strict';
  const RELAY = 'wss://realtime-relay-k28l.onrender.com/ws';
  function session(value) {
    const s = value.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) throw new Error('Use 1–64 letters, digits, underscores or hyphens.');
    return s;
  }
  function url(value, role) {
    if (!['sender', 'receiver'].includes(role)) throw new Error('Invalid role');
    return RELAY + '?session=' + encodeURIComponent(session(value)) + '&role=' + encodeURIComponent(role);
  }
  function rate(count, seconds) {
    const result = seconds > 0 ? count / seconds : 0;
    return Number.isFinite(result) ? result : 0;
  }
  function sample(raw) {
    try {
      const m = JSON.parse(raw);
      return m && m.type === 'sample' && Number.isSafeInteger(m.seq) && m.seq > 0 &&
        ['sentAt', 'value', 'x', 'y'].every(k => typeof m[k] === 'number' && Number.isFinite(m[k])) &&
        m.sentAt >= 0 && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1 ? m : null;
    } catch (_) { return null; }
  }
  class Sequence {
    constructor() { this.high = 0; this.missing = 0; this.duplicate = 0; this.order = 0; this.seen = new Set(); }
    add(n) {
      if (this.seen.has(n)) this.duplicate++;
      else {
        if (this.high && n > this.high + 1) this.missing += n - this.high - 1;
        if (n < this.high) this.order++;
        this.high = Math.max(this.high, n);
        this.seen.add(n);
        if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value);
      }
    }
  }
  class Interval {
    start(counters, state, now, epoch) {
      this.base = { ...counters }; this.state = { ...state }; this.startAt = now; this.epoch = epoch;
      this.active = true; this.max = { raf: 0, timer: 0, network: 0 };
      this.last = { raf: now, timer: now, network: now }; this.firstSeq = null; this.lastSeq = null;
    }
    observe(kind, now, seq) {
      if (!this.active) return;
      this.max[kind] = Math.max(this.max[kind], now - this.last[kind]); this.last[kind] = now;
      if (kind === 'network') { if (this.firstSeq === null) this.firstSeq = seq; this.lastSeq = seq; }
    }
    stop(counters, state, now, epoch) {
      if (!this.active) return null;
      Object.keys(this.max).forEach(k => { this.max[k] = Math.max(this.max[k], now - this.last[k]); });
      this.active = false;
      return { start: this.epoch, stop: epoch, seconds: (now - this.startAt) / 1000,
        delta: Object.fromEntries(Object.keys(this.base).map(k => [k, counters[k] - this.base[k]])),
        stateStart: this.state, stateStop: { ...state }, max: { ...this.max }, firstSeq: this.firstSeq, lastSeq: this.lastSeq };
    }
  }
  function log(element, message) {
    const row = document.createElement('div'); row.textContent = new Date().toISOString() + ' ' + message;
    element.prepend(row); while (element.children.length > 150) element.lastChild.remove();
  }
  root.TestCore = { RELAY, session, url, rate, sample, Sequence, Interval, log };
})(globalThis);
