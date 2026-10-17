/* Shared short-code rules. No storage, session listing, allocation or network calls. */
(function (root) {
  'use strict';
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const RECEIVER_URL = 'https://pradertamas.github.io/realtime-web-test/webrtc-receiver.html';
  const recent = new Set();
  function normalize(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!/^[A-Za-z2-9]{6}$/.test(raw)) return null;
    const code = raw.toUpperCase();
    return code.length === 6 && [...code].every(character => ALPHABET.includes(character)) ? code : null;
  }
  function query(search) {
    const params = new URLSearchParams(search);
    if (!params.has('session')) return {code:null,error:null};
    if (params.getAll('session').length !== 1) return {code:null,error:'The connection link is invalid. Enter the code shown on your phone.'};
    const code = normalize(params.get('session'));
    return {code,error:code?null:'The connection link is invalid. Enter the code shown on your phone.'};
  }
  function generate(cryptoApi = globalThis.crypto) {
    if (!cryptoApi?.getRandomValues) throw Error('Secure random generation is unavailable.');
    let code, attempts=0;
    do { if(++attempts>32)throw Error('Secure code generation failed. Please try again.');const bytes = new Uint8Array(6); cryptoApi.getRandomValues(bytes); code = [...bytes].map(v => ALPHABET[v & 31]).join(''); } while (recent.has(code));
    recent.add(code); if(recent.size > 256)recent.delete(recent.values().next().value);
    return code;
  }
  function parseQr(value) {
    const raw = normalize(value); if(raw)return raw;
    try {
      const url = new URL(value.trim());
      if(url.origin !== 'https://pradertamas.github.io' || url.pathname !== '/realtime-web-test/webrtc-receiver.html' ||
        url.username || url.password || url.hash || url.search.slice(1).split('&').length !== 1 || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('session')) return null;
      return normalize(url.searchParams.get('session'));
    } catch {return null;}
  }
  const receiverUrl = code => {if(normalize(code)!==code)throw Error('Invalid connection code');return RECEIVER_URL+'?session='+code;};
  root.Pairing = { ALPHABET, normalize, query, generate, parseQr, receiverUrl };
})(typeof module !== 'undefined' && module.exports ? module.exports : globalThis);
