'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {env}=require('./verify-webrtc.cjs');
function page(frames=true){const e=env(frames);e.nodes.get('session').value='';e.run(fs.readFileSync('auto-pairing.js','utf8'));return e;}
async function registered(e){const s=e.run('active'),ws=e.WS.instances.at(-1);ws.open();ws.message({type:'registration',status:'ok'});await s.chain;return {s,ws,pc:e.PC.instances.at(-1)};}
function view(e,name){
 assert.equal(e.nodes.get('receiver').dataset.view,name);
 for(const [id,v] of [['pairingPanel',name==='PAIRING'],['connectingPanel',name==='CONNECTING'],['videoPanel',name==='STREAMING']]){
  assert.equal(e.nodes.get(id).hidden,!v,id);assert.equal(e.nodes.get(id).attributes['aria-hidden'],String(!v));
 }
}
async function stream(e,p){
 p.ws.message({type:'peer-present'});await p.s.chain;view(e,'CONNECTING');
 p.pc.connectionState='connected';p.pc.onconnectionstatechange();view(e,'CONNECTING');
 let stopped=0;
 p.pc.ontrack({track:{kind:'video',stop(){stopped++;}},streams:[]});view(e,'CONNECTING');
 const video=e.nodes.get('video');video.onplaying();view(e,'CONNECTING'); // No frame yet.
 Object.assign(video,{readyState:2,videoWidth:720,videoHeight:1560});
 video.onloadeddata();view(e,'STREAMING');assert.equal(e.nodes.get('diagnostics').open,false);
 return {video,stopped:()=>stopped,oldPlaying:video.onplaying};
}
(async()=>{
 const e=page();view(e,'PAIRING');const p=await registered(e);
 assert.equal(e.nodes.get('createdPairing').hidden,false);assert.equal(e.nodes.get('createdCode').textContent.length,6);
 const media=await stream(e,p),code=p.s.session;
 p.pc.connectionState='disconnected';p.pc.onconnectionstatechange();const timer=p.s.disconnectTimer;
 p.pc.onconnectionstatechange();p.pc.iceConnectionState='disconnected';p.pc.oniceconnectionstatechange();assert.equal(p.s.disconnectTimer,timer);
 await e.advance(3999);view(e,'STREAMING');
 p.pc.connectionState='connected';p.pc.iceConnectionState='completed';p.pc.oniceconnectionstatechange();assert.equal(p.s.disconnectTimer,null);
 await e.advance(1);assert.equal(e.run('active'),p.s);view(e,'STREAMING');
 await e.advance(300000);assert.equal(e.run('active'),p.s); // No waiting rotation during video.
 p.pc.connectionState='disconnected';p.pc.onconnectionstatechange();await e.advance(4000);view(e,'PAIRING');
 assert.equal(media.video.srcObject,null);assert.equal(media.video.readyState,0);assert.equal(p.s.streaming,false);assert.equal(p.s.pc,null);assert.equal(media.stopped(),1);
 await e.advance(1000);const fresh=await registered(e);assert.notEqual(fresh.s.session,code);view(e,'PAIRING');
 media.oldPlaying();view(e,'PAIRING'); // Retired playback cannot reveal a new black video.
 e.fire('pagehide');assert.equal(e.timers.size,0);
 for(const cause of ['failed','closed','peer-left','bye','stop']){
  const f=page(),q=await registered(f);await stream(f,q);
  if(cause==='stop')f.nodes.get('disconnect').onclick();
  else if(cause==='peer-left'||cause==='bye'){q.ws.message({type:cause});await q.s.chain;}
  else {q.pc.iceConnectionState=cause;q.pc.oniceconnectionstatechange();}
  view(f,'PAIRING');assert.equal(f.run('active'),null);
  await f.advance(1000);await registered(f);view(f,'PAIRING');assert.equal(f.nodes.get('createdPairing').hidden,false);f.fire('pagehide');
 }
 for(const status of ['not-found','rate-limited']){
  const f=page();await registered(f);f.run("joinAutomatically('7K4M2Q')");view(f,'PAIRING');
  const q=f.run('active'),ws=f.WS.instances.at(-1);ws.open();ws.message({type:'registration',status});await q.chain;
  view(f,'PAIRING');await f.advance(1000);await registered(f);assert.equal(f.run('active.intent'),'create');f.fire('pagehide');
 }
 const noFrames=page(false),fallback=await registered(noFrames);await stream(noFrames,fallback);view(noFrames,'STREAMING');noFrames.fire('pagehide');
 const frame=page(),r=await registered(frame);r.ws.message({type:'peer-present'});await r.s.chain;
 r.pc.ontrack({track:{kind:'video',stop(){}},streams:[]});frame.nodes.get('video').callback(0,{width:720,height:1560});view(frame,'STREAMING');frame.fire('pagehide');
 const html=fs.readFileSync('webrtc-receiver.html','utf8');assert.match(html,/id="videoPanel"[^>]*hidden/);assert.match(html,/id="connectingPanel"[^>]*hidden/);
 console.log('PASS receiver states: pairing/no black panel, real-frame gating/fallback, accessible hidden panels, failed/closed/Stop recovery, one 4s grace timer, reconnect, no streaming rotation, video cleanup and stale events.');
})().catch(e=>{console.error('FAIL receiver states:',e);process.exitCode=1;});
