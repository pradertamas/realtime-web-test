'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {RemoteLink}=require('./remote-link.js'),{env}=require('./verify-webrtc.cjs');
const TOKEN='AAAAAAAAAAAAAAAAAAAAAA'; // Fake fixture; never print live credentials.
assert.equal(RemoteLink.valid(TOKEN),true);
for(const bad of ['',TOKEN+'=',TOKEN+'A',TOKEN+'\n','7K4M2Q','AAAAAAAAAAAAAAAAAAAAAB'])assert.equal(RemoteLink.valid(bad),false);
assert.equal(RemoteLink.entry('').mode,'local');
assert.equal(RemoteLink.entry('?session=7k4m2q').mode,'session');
assert.equal(RemoteLink.entry('?session=bad').mode,'local');
assert.equal(RemoteLink.entry('?device='+TOKEN).mode,'local');
assert.equal(RemoteLink.entry('?session=7K4M2Q','#device='+TOKEN).token,TOKEN);
const invalidHashes=['#device=bad','#device=','#device='+TOKEN+'&device='+TOKEN,'#device='+TOKEN+'&session=7K4M2Q','#device=%41'+TOKEN.slice(1),'#other='+TOKEN,'#device='+TOKEN+'%0A','#device='+TOKEN+'\n'];
for(const hash of invalidHashes){
 assert.equal(RemoteLink.entry('?session=7K4M2Q',hash).error,'Invalid remote sharing link.');
}
function page(hash,response={status:'available',session:'7K4M2Q'},code=200,search=''){
 const e=env(true,search,undefined,hash),calls=[],logs=[];
 e.run('(sink)=>{console={log:(...v)=>sink(v),warn:(...v)=>sink(v),error:(...v)=>sink(v),info:(...v)=>sink(v),debug:(...v)=>sink(v)};}')(v=>logs.push(v.join(' ')));
 e.run('(f,a)=>{globalThis.fetch=f;globalThis.AbortController=a;}')(async(url,options)=>{calls.push({url,options});return {ok:code===200,status:code,json:async()=>response};},AbortController);
 e.run(fs.readFileSync('auto-pairing.js','utf8'));return {e,calls,logs};
}
const flush=()=>new Promise(r=>setImmediate(r));
async function registered(e){const s=e.run('active'),ws=e.WS.instances.at(-1);ws.open();ws.message({type:'registration',status:'ok'});ws.message({type:'peer-present'});await s.chain;return {s,ws,pc:e.PC.instances.at(-1)};}
(async()=>{
 const normal=page('');assert.equal(normal.e.run('active.intent'),'create');assert.equal(normal.calls.length,0);normal.e.fire('pagehide');
 const legacy=page('',undefined,200,'?device='+TOKEN);assert.equal(legacy.e.run('active.intent'),'create');assert.equal(legacy.calls.length,0);legacy.e.fire('pagehide');
 for(const hash of invalidHashes){const bad=page(hash,undefined,200,'?session=7K4M2Q');await flush();assert.equal(bad.calls.length,0);assert.equal(bad.e.WS.instances.length,0);assert.equal(bad.e.nodes.get('remoteMessage').textContent,'Invalid remote sharing link.');assert.ok(!bad.logs.join('').includes(TOKEN));bad.e.fire('pagehide');}
 const local=page('',undefined,200,'?session=7K4M2Q');await local.e.advance(250);assert.equal(local.e.run('active.intent'),'join');assert.equal(local.calls.length,0);local.e.fire('pagehide');
 const remote=page('#device='+TOKEN,undefined,200,'?session=8K4M2Q');assert.equal(remote.e.WS.instances.length,0);await flush();
 const {e,calls}=remote;assert.equal(calls.length,1);assert.ok(!calls[0].url.includes(TOKEN));assert.equal(JSON.parse(calls[0].options.body).token,TOKEN);
 assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.referrerPolicy,'no-referrer');
 assert.equal(e.WS.instances.length,1);assert.match(e.WS.instances[0].url,/intent=join/);assert.ok(!e.WS.instances[0].url.includes(TOKEN));
 const p=await registered(e);assert.equal(e.nodes.get('receiver').dataset.view,'CONNECTING');
 p.pc.ontrack({track:{kind:'video',stop(){}},streams:[]});Object.assign(e.nodes.get('video'),{readyState:2,videoWidth:720,videoHeight:1560});e.nodes.get('video').onloadeddata();assert.equal(e.nodes.get('receiver').dataset.view,'STREAMING');
 p.ws.message({type:'bye'});await p.s.chain;assert.equal(e.run('active'),null);assert.equal(e.nodes.get('remoteRetry').hidden,false);
 await e.advance(1000);assert.equal(e.WS.instances.length,1); // Never falls into local CREATE.
 e.nodes.get('remoteRetry').onclick();await flush();assert.equal(calls.length,2);assert.equal(e.WS.instances.length,2);
 const retry=await registered(e);retry.ws.message({type:'peer-left'});await retry.s.chain;assert.equal(e.nodes.get('remoteRetry').hidden,false);
 for(const id of ['summary','previousSummary','connection','videoMetrics','bandwidth','latency']){
  const node=e.nodes.get(id);assert.ok(!String(node.value||node.textContent||'').includes(TOKEN));
 }
 e.fire('pagehide');assert.equal(e.timers.size,0);
 assert.ok(!remote.logs.join('').includes(TOKEN));assert.ok(!remote.logs.join('').includes('#device='));
 const unavailable=page('#device='+TOKEN,{status:'unavailable'},404);await flush();assert.equal(unavailable.e.WS.instances.length,0);assert.match(unavailable.e.nodes.get('remoteMessage').textContent,/not currently available/);assert.equal(unavailable.e.nodes.get('videoPanel').hidden,true);unavailable.e.fire('pagehide');
 const invalid=page('#device=bad');await flush();assert.equal(invalid.calls.length,0);assert.equal(invalid.e.WS.instances.length,0);assert.equal(invalid.e.nodes.get('remoteMessage').textContent,'Invalid remote sharing link.');invalid.e.fire('pagehide');
 const delayed=env(true,'',undefined,'#device='+TOKEN);let finishFetch;
 delayed.run('(f,a)=>{globalThis.fetch=f;globalThis.AbortController=a;}')(()=>new Promise(resolve=>finishFetch=resolve),AbortController);
 delayed.run(fs.readFileSync('auto-pairing.js','utf8'));delayed.fire('pagehide');assert.equal(delayed.timers.size,0);
 finishFetch({ok:true,json:async()=>({status:'available',session:'7K4M2Q'})});await flush();assert.equal(delayed.WS.instances.length,0);
 console.log('PASS remote link: strict token/startup routing, POST-only secret, no competing CREATE, normal JOIN/first frame, unavailable/retry, Stop/Cancel recovery and no diagnostics leakage.');
})().catch(e=>{console.error('FAIL remote link:',e.message);process.exitCode=1;});
