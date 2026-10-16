'use strict';
const assert=require('node:assert/strict');
const {env}=require('./verify-webrtc.cjs');
async function registered(e,intent){
  await e.run(`connect('${intent}')`);
  const s=e.run('active'),ws=e.WS.instances.at(-1);
  ws.open();ws.message({type:'registration',status:'ok'});await s.chain;
  return {s,ws,pc:e.PC.instances.at(-1)};
}
function cleaned(e,old){
  assert.equal(old.pc.closed,true);
  for(const key of ['pc','ws'])assert.equal(old.s[key],null,key);
  assert.equal(old.s.pendingIce.length,0);assert.equal(old.s.offered,false);
  assert.equal(old.s.registered,false);assert.equal(old.s.streaming,false);
  assert.equal(old.s.session,'');assert.equal(e.nodes.get('video').srcObject,null);
  assert.equal(old.pc.ontrack,null);assert.equal(old.pc.onicecandidate,null);
  assert.equal(old.ws.onmessage,null);assert.equal(old.ws.onclose,null);
}
async function offer(e,p){
  p.ws.message({type:'peer-present'});p.ws.message({type:'offer',sdp:'fresh-offer'});
  await p.s.chain;
  assert.equal(p.ws.sent.filter(m=>m.type==='answer').length,1);
}
(async()=>{
  // Consent happens before Android registration. A waiting browser creator gets
  // no peer-left on Cancel. New Create/Join must nevertheless replace it.
  for(const nextIntent of ['create','join']){
    const e=env();let old=await registered(e,'create');
    for(let i=0;i<3;i++){
      assert.equal(e.nodes.get('create').disabled,false);
      assert.equal(e.nodes.get('connect').disabled,false);
      const oldClose=old.ws.onclose,oldMessage=old.ws.onmessage,oldFrame=e.nodes.get('video').callback;
      e.nodes.get('session').value='8K4M2Q';
      const fresh=await registered(e,nextIntent);cleaned(e,old);
      assert.notEqual(fresh.pc,old.pc);assert.notEqual(fresh.ws,old.ws);
      oldClose({});oldMessage({data:JSON.stringify({type:'peer-left'})});oldFrame(0,{});
      assert.equal(e.run('active'),fresh.s); // Stale callbacks cannot stop a new session.
      e.run('stop')(old.s); // Repeated cleanup cannot affect the new peer.
      assert.equal(e.run('active'),fresh.s);old=fresh;
    }
    await offer(e,old);old.pc.connectionState='connected';old.pc.onconnectionstatechange();
    e.nodes.get('video').onplaying();assert.equal(e.nodes.get('status').textContent,'Streaming');
    await e.run('stop(active)');await e.run('stop(null)');assert.equal(e.timers.size,0);
    assert.equal(e.nodes.get('disconnect').disabled,true);
  }
  // Sender creator disappearing / failed join: close peer, queued ICE and UI,
  // then a completely new sender session is joinable on the same document.
  const e=env();const old=await registered(e,'join');
  old.ws.message({type:'ice',candidate:{candidate:'old-ice'}});await old.s.chain;
  let tracksStopped=0;e.nodes.get('video').srcObject={getTracks:()=>[{onended:()=>{},stop(){tracksStopped++;}}]};
  old.ws.message({type:'peer-left'});await old.s.chain;cleaned(e,old);
  assert.equal(tracksStopped,1);assert.equal(e.run('active'),null);assert.equal(e.timers.size,0);
  assert.equal(e.nodes.get('status').textContent,'Disconnected');
  e.nodes.get('session').value='9K4M2Q';const fresh=await registered(e,'join');await offer(e,fresh);
  assert.equal(fresh.pc.ice.length,0);assert.equal(fresh.s.latest.codec,undefined);
  await e.run('stop(active)');
  for(const failure of ['close','error','not-found']){
    const f=env(),failed=await registered(f,'join');
    if(failure==='close')failed.ws.onclose({});
    else if(failure==='error')failed.ws.onerror({});
    else {failed.ws.message({type:'registration',status:'not-found'});await failed.s.chain;}
    cleaned(f,failed);assert.equal(f.run('active'),null);assert.equal(f.timers.size,0);
    const retry=await registered(f,'create');await offer(f,retry);await f.run('stop(active)');
  }
  // A never-resolving native stats request must not hold cleanup/UI hostage.
  const h=env(),hung=await registered(h,'create');let resolveStats;
  hung.pc.getStats=()=>new Promise(resolve=>resolveStats=resolve);
  const pending=h.run('sample(active)');await h.run('stop(active)');cleaned(h,hung);
  assert.equal(h.run('active'),null);assert.equal(h.timers.size,0);
  const next=await registered(h,'create');resolveStats(new Map());await pending;
  assert.equal(h.run('active'),next.s);assert.equal(next.s.last,null);
  await h.run('stop(active)');
  // Retire during asynchronous answer creation: no old SDP/answer is sent and
  // its eventual completion cannot touch the new peer or status.
  const a=env(),answerOld=await registered(a,'join');let resolveAnswer;
  answerOld.pc.createAnswer=()=>new Promise(resolve=>resolveAnswer=resolve);
  answerOld.ws.message({type:'offer',sdp:'old-offer'});
  while(!resolveAnswer)await Promise.resolve();
  const oldChain=answerOld.s.chain;const answerNew=await registered(a,'create');
  resolveAnswer({type:'answer',sdp:'stale'});await oldChain;
  assert.equal(answerOld.ws.sent.filter(m=>m.type==='answer').length,0);
  assert.equal(answerOld.pc.localDescription,undefined);assert.equal(a.run('active'),answerNew.s);
  await a.run('stop(active)');
  console.log('PASS cancel/retry lifecycle: creator Cancel without peer-left, three retries without reload, fresh Create/Join peers and sockets, peer-left cleanup, stale ICE/SDP/events, hanging stats, UI reset and idempotent cleanup.');
})().catch(e=>{console.error('FAIL cancel/retry lifecycle:',e);process.exitCode=1;});
