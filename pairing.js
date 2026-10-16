/* Shared short-code rules. No storage, session listing, allocation or network calls. */
(function (root) {
  'use strict';
  const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
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
    if (params.getAll('session').length !== 1) return {code:null,error:'The pairing link is invalid. Enter the code shown on your phone.'};
    const code = normalize(params.get('session'));
    return {code,error:code?null:'The pairing link is invalid. Enter the code shown on your phone.'};
  }
  root.Pairing = { ALPHABET, normalize, query };
})(typeof module !== 'undefined' && module.exports ? module.exports : globalThis);
