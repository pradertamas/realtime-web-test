/* Pure PoC 4B configuration and measurement helpers. No credentials are persisted. */
(function (root) {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function gbPerHour(bytes, seconds) {
    if (!finite(bytes) || bytes < 0 || !finite(seconds) || seconds <= 0) return null;
    const result = bytes / seconds * 3600 / 1e9;
    return finite(result) ? result : null;
  }
  function costPerHour(gb, price, relayConfirmed) {
    const result = relayConfirmed && finite(gb) && gb >= 0 && finite(price) && price >= 0 ? gb * price : null;
    return finite(result) ? result : null;
  }
  function configuration(m, now = Date.now()) {
    if (m.version !== 1 || !['AUTO', 'FORCE_TURN'].includes(m.mode) ||
        typeof m.configId !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(m.configId) ||
        !finite(m.usdPerGb) || m.usdPerGb < 0 || !finite(m.expiresAt) ||
        m.expiresAt - now < 60000 || m.expiresAt - now > 660000 ||
        !Array.isArray(m.iceServers) || !m.iceServers.length || m.iceServers.length > 8) throw Error('Invalid/expired network configuration');
    for (const entry of m.iceServers) {
      if (!Array.isArray(entry.urls) || !entry.urls.length || entry.urls.length > 8 ||
          !entry.urls.every(url => typeof url === 'string' && /^(turn|turns):turn\.cloudflare\.com:(3478|443|80|5349)\?transport=(udp|tcp)$/.test(url)) ||
          typeof entry.username !== 'string' || !entry.username || entry.username.length > 2048 ||
          typeof entry.credential !== 'string' || !entry.credential || entry.credential.length > 2048) throw Error('Invalid temporary TURN servers');
    }
    return { iceServers: m.mode === 'AUTO' ? [{ urls: 'stun:stun.l.google.com:19302' }, ...m.iceServers] : m.iceServers,
      iceTransportPolicy: m.mode === 'FORCE_TURN' ? 'relay' : 'all' };
  }
  const relayPair = (local, remote, state) => state === 'succeeded' && local === 'relay' && remote === 'relay';
  const addressFamily = address => typeof address !== 'string' || !address ? 'N/A' :
    address.includes(':') ? 'IPv6' : /^\d+(\.\d+){3}$/.test(address) ? 'IPv4' : 'N/A / obfuscated';
  root.NetworkTest = { gbPerHour, costPerHour, configuration, relayPair, addressFamily };
})(typeof module !== 'undefined' && module.exports ? module.exports : globalThis);
