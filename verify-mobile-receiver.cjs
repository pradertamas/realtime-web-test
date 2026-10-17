'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {env}=require('./verify-webrtc.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
const TOKEN='AAAAAAAAAAAAAAAAAAAAAA'; // Public fake fixture, never a live secret.
function page(search='',hash='',fullscreen='supported',response={status:'available',session:'7K4M2Q'}){
 const e=env(true,search,undefined,hash),calls=[],logs=[],order=[];
 e.run('(sink)=>{console={log:(...v)=>sink(v),warn:(...v)=>sink(v),error:(...v)=>sink(v),debug:(...v)=>sink(v),info:(...v)=>sink(v)};}')(v=>logs.push(v.join(' ')));
 e.run('(fn,abort)=>{fetch=fn;AbortController=abort;}')(async(url,options)=>{order.push('resolve');calls.push({url,options});return{ok:response.status==='available',json:async()=>response};},AbortController);
 if(fullscreen!=='unsupported')e.run('(fn)=>{el("receiver").requestFullscreen=fn;}')(()=>{
  order.push('fullscreen');
  assert.equal(e.WS.instances.length,0,'Fullscreen requested before first socket');
  if(fullscreen==='rejected')return Promise.reject(Error('fixture rejection'));
  if(fullscreen==='throw')throw Error('fixture throw');
  if(fullscreen==='pending')return new Promise(()=>{});
  e.run('document.fullscreenElement=el("receiver")');return Promise.resolve();
 });
 e.run('document.exitFullscreen=()=>{document.fullscreenElement=null;return Promise.resolve();}');
 e.run(fs.readFileSync('auto-pairing.js','utf8'));
 return {e,calls,logs,order};
}
function noNetwork(p){assert.equal(p.e.WS.instances.length,0);assert.equal(p.e.PC.instances.length,0);assert.equal(p.calls.length,0);}
function click(p){p.e.nodes.get('mobileReceive').onclick();}
function view(p){return p.e.nodes.get('receiver').dataset.view;}
async function registered(p){const {e}=p,s=e.run('active'),ws=e.WS.instances.at(-1);ws.open();ws.message({type:'registration',status:'ok'});ws.message({type:'peer-present'});await s.chain;return {s,ws,pc:e.PC.instances.at(-1)};}
function hide(p){p.e.fire('pagehide');assert.equal(p.e.timers.size,0);}
(async()=>{
 for(const [search,hash,intent] of [['','','create'],['?session=7K4M2Q','','join'],['','#device='+TOKEN,'join']]){
  const p=page(search,hash);await flush();assert.equal(p.e.run('active.intent'),intent);assert.equal(p.order.includes('fullscreen'),false);hide(p);
 }
 for(const [search,hash,intent] of [['?mode=mobile','','create'],['?mode=mobile&session=7K4M2Q','','join'],['?session=7K4M2Q&mode=mobile','','join'],['?mode=mobile','#device='+TOKEN,'join'],['?mode=mobile&session=8K4M2Q','#device='+TOKEN,'join']]){
  const p=page(search,hash);noNetwork(p);assert.equal(view(p),'MOBILE_CONFIRM');assert.equal(p.e.nodes.get('videoPanel').hidden,true);assert.equal(p.e.nodes.get('pairingPanel').hidden,true);
  await p.e.advance(300001);noNetwork(p);click(p);assert.equal(p.order[0],'fullscreen');await flush();assert.equal(p.e.run('active.intent'),intent);assert.equal(p.e.WS.instances.length,1);
  click(p);await flush();assert.equal(p.e.WS.instances.length,1,'No duplicate confirm');
  if(hash){assert.equal(p.calls.length,1);assert.deepEqual(p.order,['fullscreen','resolve']);assert.equal(p.calls[0].options.method,'POST');assert.equal(JSON.parse(p.calls[0].options.body).token,TOKEN);assert.ok(!p.calls[0].url.includes(TOKEN));assert.match(p.e.WS.instances[0].url,/session=7K4M2Q/);}
  else if(intent==='create'){assert.equal(p.e.nodes.get('createdPairing').hidden,false);assert.match(p.e.nodes.get('createdCode').textContent,/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);}
  hide(p);
 }
 for(const fullscreen of ['unsupported','rejected','throw','pending']){
  const p=page('?mode=mobile','',fullscreen);click(p);await flush();assert.equal(p.e.run('active.intent'),'create');assert.equal(view(p),'PAIRING');
  if(fullscreen!=='pending')assert.match(p.e.nodes.get('fullscreenNotice').textContent,/not available/);hide(p);
 }
 const disabled=page('?mode=mobile');disabled.e.run('document.fullscreenEnabled=false');click(disabled);assert.equal(disabled.order.length,0);assert.equal(disabled.e.WS.instances.length,1);hide(disabled);
 for(const [search,hash] of [['?mode=mobile',''],['?mode=mobile&session=7K4M2Q',''],['?mode=mobile','#device='+TOKEN]]){
  const p=page(search,hash);p.e.nodes.get('mobileCancel').onclick();await p.e.advance(300001);noNetwork(p);assert.equal(p.e.nodes.get('mobileMessage').textContent,'Reception cancelled.');hide(p);
 }
 for(const [search,hash] of [['?mode=bad',''],['?mode=mobile&mode=mobile',''],['?mode=mobile&session=bad',''],['?mode=mobile&session=7K4M2Q&session=8K4M2Q',''],['?mode=mobile','#device=bad'],['?mode=mobile','#device='+TOKEN+'&device='+TOKEN],['?session=bad','']]){
  const p=page(search,hash);noNetwork(p);click(p);await flush();noNetwork(p);hide(p);
 }
 const stream=page('?mode=mobile');click(stream);const p=await registered(stream);assert.equal(view(stream),'CONNECTING');assert.equal(stream.e.nodes.get('videoPanel').hidden,true);
 p.pc.ontrack({track:{kind:'video',stop(){}},streams:[]});Object.assign(stream.e.nodes.get('video'),{readyState:2,videoWidth:720,videoHeight:1560});stream.e.nodes.get('video').onloadeddata();assert.equal(view(stream),'STREAMING');assert.equal(stream.e.nodes.get('pairingPanel').hidden,true);
 stream.e.run('document.fullscreenElement=null');stream.e.fireDocument('fullscreenchange');assert.equal(view(stream),'STREAMING');assert.equal(stream.e.run('active'),p.s);assert.equal(p.pc.closed,undefined);assert.equal(stream.e.nodes.get('enterFullscreen').hidden,false);
 // Re-entry only via another explicit gesture; socket/peer already exist by design.
 let requests=0;stream.e.run('(fn)=>{el("receiver").requestFullscreen=fn;}')(()=>{requests++;stream.e.run('document.fullscreenElement=el("receiver")');return Promise.resolve();});
 stream.e.nodes.get('enterFullscreen').onclick();await flush();assert.equal(requests,1);assert.equal(view(stream),'STREAMING');
 stream.e.nodes.get('exitFullscreen').onclick();stream.e.fireDocument('fullscreenchange');assert.equal(view(stream),'STREAMING');
 Object.assign(stream.e.nodes.get('video'),{videoWidth:1560,videoHeight:720});await stream.e.run('sample(active)');assert.equal(view(stream),'STREAMING');assert.equal(stream.e.PC.instances.length,1);assert.equal(stream.e.WS.instances.length,1);
 stream.e.nodes.get('disconnect').onclick();assert.equal(view(stream),'MOBILE_ENDED');assert.equal(stream.e.run('active'),null);assert.equal(p.pc.closed,true);assert.equal(stream.e.nodes.get('video').srcObject,null);
 await stream.e.advance(300001);assert.equal(stream.e.WS.instances.length,1,'No automatic mobile reconnect');stream.e.nodes.get('mobileAgain').onclick();assert.equal(stream.e.WS.instances.length,2);assert.equal(requests,2);hide(stream);
 const missing=page('?mode=mobile&session=7K4M2Q');click(missing);const ws=missing.e.WS.instances[0];ws.open();ws.message({type:'registration',status:'not-found'});await flush();assert.equal(view(missing),'MOBILE_ENDED');await missing.e.advance(1001);assert.equal(missing.e.WS.instances.length,1);hide(missing);
 const remote=page('?mode=mobile','#device='+TOKEN,'supported',{status:'unavailable'});noNetwork(remote);click(remote);await flush();assert.equal(remote.calls.length,1);assert.equal(remote.e.WS.instances.length,0);
 remote.e.run('document.fullscreenElement=null');remote.e.nodes.get('remoteRetry').onclick();await flush();assert.deepEqual(remote.order,['fullscreen','resolve','fullscreen','resolve']);
 for(const id of ['connection','videoMetrics','bandwidth','latency','summary','previousSummary']){const n=remote.e.nodes.get(id);assert.ok(!JSON.stringify(n??null).includes(TOKEN));}assert.ok(!remote.logs.join('').includes(TOKEN));hide(remote);
 const desktopRestore=page('?session=7K4M2Q');desktopRestore.e.fire('pagehide');desktopRestore.e.fire('pageshow');assert.equal(desktopRestore.e.run('active.intent'),'create');hide(desktopRestore);
 const restored=page('?mode=mobile','#device='+TOKEN);restored.e.fire('pagehide');restored.e.fire('pageshow');noNetwork(restored);assert.equal(view(restored),'MOBILE_CONFIRM');hide(restored);
 const css=fs.readFileSync('receiver-ui.css','utf8');assert.match(css,/100dvh/);assert.match(css,/safe-area-inset/);assert.match(css,/object-fit:contain/);assert.ok(!/transform:\s*rotate|orientation-lock|aspect-ratio\s*:/.test(css));
 const source=fs.readFileSync('mobile-receiver.js','utf8');assert.ok(!/webkit|wakeLock|serviceWorker|Math.random|console\./.test(source));
 console.log('PASS mobile receiver: explicit gate/no pre-confirm network, routing/validation/privacy, synchronous fullscreen-first gesture, rejection/unsupported fallback, first frame, exit/re-entry without reconnect, ended/retry, cleanup and responsive contain layout.');
})().catch(e=>{console.error('FAIL mobile receiver:',e.stack);process.exitCode=1;});


