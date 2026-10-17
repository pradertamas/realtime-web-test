'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {env}=require('./verify-webrtc.cjs');
function page(search=''){
  const e=env(true,search);if(!search)e.nodes.get('session').value='';
  e.run(fs.readFileSync('auto-pairing.js','utf8'));return e;
}
async function register(e,status='ok'){
  const s=e.run('active'),ws=e.WS.instances.at(-1);ws.open();ws.message({type:'registration',status});await s.chain;return {s,ws,pc:e.PC.instances.at(-1)};
}
function input(e,value){e.nodes.get('session').value=value;e.nodes.get('session').oninput();}
(async()=>{
 const e=page();assert.equal(e.WS.instances.length,1);assert.match(e.WS.instances[0].url,/intent=create/);
 const own=await register(e);const ownCode=e.nodes.get('createdCode').textContent;
 assert.equal(ownCode.length,6);assert.equal(e.nodes.get('createdPairing').hidden,false);
 assert.equal(e.nodes.get('scan').disabled,false);
 input(e,'7K4M2O');await e.advance(300);assert.equal(e.WS.instances.length,1);assert.match(e.nodes.get('pairingError').textContent,/Invalid/);
 let pasteHandled=false;
 e.nodes.get('session').onpaste({clipboardData:{getData:()=> ' 6k4m2q '},preventDefault(){pasteHandled=true;}});
 assert.equal(pasteHandled,true);await e.advance(200);input(e,'6K4M2Q');await e.advance(249);assert.equal(e.WS.instances.length,1);
 await e.advance(1);assert.equal(e.WS.instances.length,2);assert.equal(own.pc.closed,true);assert.equal(own.s.ws,null);
 assert.match(e.WS.instances[1].url,/session=6K4M2Q.*intent=join/);
 input(e,'5K4M2Q');await e.advance(300);assert.equal(e.WS.instances.length,2); // No parallel JOIN.
 const joined=await register(e,'not-found');assert.equal(e.run('active'),null);assert.equal(joined.pc.closed,true);
 await e.advance(1000);assert.match(e.WS.instances.at(-1).url,/intent=create/);assert.match(e.nodes.get('pairingError').textContent,/not found/);
 const retry=await register(e);assert.notEqual(retry.s.session,ownCode);
 e.run("scanner.onPayload(Pairing.receiverUrl('5K4M2Q'))");assert.equal(retry.pc.closed,true);
 const qr=await register(e);assert.match(qr.ws.url,/intent=join/);
 qr.ws.message({type:'peer-present'});qr.ws.message({type:'offer',sdp:'new-offer'});await qr.s.chain;
 assert.equal(qr.ws.sent.filter(m=>m.type==='answer').length,1);
 qr.pc.connectionState='connected';qr.pc.onconnectionstatechange();e.nodes.get('video').onplaying();
 const count=e.WS.instances.length;await e.advance(300000);assert.equal(e.WS.instances.length,count); // Never rotate media.
 e.nodes.get('disconnect').onclick();assert.equal(qr.pc.closed,true);await e.advance(1000);
 const ready=await register(e);assert.equal(ready.s.intent,'create');
 const oldCode=ready.s.session;await e.advance(300000);assert.equal(ready.pc.closed,true);assert.notEqual(e.run('active.session'),oldCode);
 const waiting=await register(e);waiting.ws.message({type:'peer-present'});await waiting.s.chain;
 await e.advance(300000);assert.equal(e.run('active'),waiting.s); // Waiting for consent is not waiting rotation.
 waiting.ws.message({type:'peer-left'});await waiting.s.chain;await e.advance(1000);assert.equal(e.run('active.intent'),'create');
 e.fire('pagehide');assert.equal(e.run('active'),null);assert.equal(e.timers.size,0);
 e.fire('pageshow');assert.equal(e.run('active.intent'),'create');e.fire('pagehide');
 const collision=page();for(let i=0;i<4;i++)await register(collision,'conflict');
 assert.equal(collision.WS.instances.length,4);await collision.advance(1000);assert.equal(collision.WS.instances.length,5);collision.fire('pagehide');
 const link=page('?session=7K4M2Q');assert.equal(link.nodes.get('session').value,'7K4M2Q');assert.equal(link.run('active.intent'),'create');await link.advance(250);assert.equal(link.run('active.intent'),'join');link.fire('pagehide');
 const html=fs.readFileSync('webrtc-receiver.html','utf8');assert.doesNotMatch(html,/<button[^>]*id="(?:create|connect)"/);
 assert.match(html,/maxlength="6"/);assert.match(html,/src="auto-pairing.js"/);
 console.log('PASS auto-pairing: page CREATE, QR/code, bounded collisions, debounced lowercase/paste JOIN, invalid/duplicate input, QR replacement, failed JOIN recovery, Stop/peer-left recovery, waiting-only rotation, stale peer cleanup and navigation timers.');
})().catch(e=>{console.error('FAIL auto-pairing:',e);process.exitCode=1;});
