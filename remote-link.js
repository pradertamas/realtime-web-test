(function(root){
 'use strict';
 const valid=token=>typeof token==='string'&&token.length===22&&/^[A-Za-z0-9_-]{21}[AQgw]$/.test(token);
 function entry(search,hash=''){
  const params=new URLSearchParams(search);
  if(hash){
   // Exact, canonical grammar: no decoding, extra fields or ambiguous duplicates.
   const match=/^#device=([A-Za-z0-9_-]{21}[AQgw])$/.exec(hash);
   return match&&match[0]===hash?{mode:'remote',token:match[1]}:{mode:'remote',error:'Invalid remote sharing link.'};
  }
  const code=params.get('session');
  return {mode:params.getAll('session').length===1&&typeof code==='string'&&/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/i.test(code.trim())?'session':'local'};
 }
 root.RemoteLink={valid,entry};
})(typeof module!=='undefined'&&module.exports?module.exports:globalThis);
