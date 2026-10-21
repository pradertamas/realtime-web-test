'use strict';
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto'),fs=require('node:fs');
const {ConnectionRequest:R}=require('./connection-request.js'),{ConnectionRequestMedia:M}=require('./connection-request-media.js');
const id=Buffer.alloc(16,1).toString('base64url'),cap=Buffer.alloc(16,2).toString('base64url'),savedClaim=Buffer.alloc(32,3).toString('base64url');
const hash=(role='send',request=id)=>`#v=1&r=${request}&c=${cap}&i=${role}`;
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
function fixture({role='send',storage=null}={}){
 let time=0,random=0;const tasks=[],calls=[],views=[],medias=[],records=new Map();
 const store=storage||{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v)};
 const data=(state='WAITING',extra={})=>({requestId:id,initiatorRole:role,state,serverNow:new Date(100000).toISOString(),expiresAt:new Date(400000).toISOString(),...(state!=='WAITING'?{connectBy:new Date(220000).toISOString()}:{}),...extra});
 const f={tasks,calls,views,medias,records,data,accepted:false,assigned:false,failAccept:false,conflict:false,
  now:()=>time,advance:async(ms)=>{time+=ms;for(const t of tasks.filter(t=>!t.cancelled&&t.at<=time)){t.cancelled=true;t.fn();}await settle();}};
 f.client=new R.Client({storage:store,crypto:{getRandomValues:b=>{random++;b.fill(3);return b;}},clock:()=>time,
  later:(fn,ms)=>{const t={fn,at:time+ms,cancelled:false};tasks.push(t);return t;},cancel:t=>{if(t)t.cancelled=true;},view:v=>views.push(v),
  media:options=>{const m={options,stops:0,stop(){this.stops++;}};medias.push(m);return m;},
  http:{call:async(request,op,secret,body)=>{calls.push({request,op,secret,body});
   if(op==='accept'){assert.ok(store.getItem('screen-share-request-v1:'+request),'claim persisted before Accept');if(f.conflict)throw new R.SafeError('conflict');f.accepted=true;if(f.failAccept){f.failAccept=false;throw new R.SafeError('network');}return data('ACCEPTED');}
   if(op==='participant-state'){assert.equal(secret,savedClaim);if(f.readinessNetwork){f.readinessNetwork=false;throw new R.SafeError('network');}if(f.readinessRace){f.assigned=true;throw new R.SafeError('conflict');}return {ready:true};}
   if(op==='withdraw')return {};
   if(secret===cap)return data(f.accepted?'ACCEPTED':'WAITING',f.accepted?{connectBy:undefined}:{});
   if(!f.accepted)throw new R.SafeError('unavailable');
   return f.assigned?data('CONNECTING',{session:{role:'receiver',intent:'join',code:'7K4M2Q'}}):data('ACCEPTED');
  }}});
 f.random=()=>random;return f;
}
async function clientTests(){
 const originalFetch=globalThis.fetch;let defaultFetchCalls=0;
 try{
  globalThis.fetch=function(url,options){
   if(this!==globalThis)throw new TypeError('Illegal invocation');
   defaultFetchCalls++;assert.equal(url,R.API+'/connection-requests/'+id+'/status');assert.equal(options.method,'GET');
   return Promise.resolve(new Response(JSON.stringify({state:'WAITING'}),{headers:{'Content-Type':'application/json'}}));
  };
  const status=await new R.Http().call(id,'status',cap);
  assert.equal(status.state,'WAITING');assert.equal(defaultFetchCalls,1);
 }finally{globalThis.fetch=originalFetch;}
 assert.ok(R.parse(hash()));assert.equal(R.parse(hash('receive')).role,'receive');
 assert.ok(R.parse(`#i=send&c=${cap}&r=${id}&v=1`));
 for(const bad of [hash()+'&v=1',hash()+'&x=1',hash().replace('v=1','v=2'),hash().replace(id,id.slice(1)),hash().replace(id,'B'.repeat(22)),hash()+'%',hash().replace('v=1','v=%31'),'#'+ 'a'.repeat(256)])assert.equal(R.parse(bad),null);
 assert.equal(R.canonical(savedClaim,32),true);assert.equal(R.canonical(savedClaim+'=',32),false);
 const f=fixture();await f.client.open(hash());assert.equal(f.calls.length,1);assert.equal(f.calls[0].secret,cap);assert.equal(f.random(),0);assert.equal(f.views.at(-1).state,'PREVIEW');
 await Promise.all([f.client.accept(),f.client.accept()]);assert.equal(f.random(),1);assert.equal(f.calls.filter(x=>x.op==='accept').length,1);
 await f.advance(2000);assert.equal(f.calls.at(-1).secret,savedClaim);f.assigned=true;await f.advance(2000);assert.equal(f.medias.length,1);
 const a=f.client.current,m=f.medias[0];m.options.connected();m.options.frame();assert.equal(f.views.at(-1).state,'STREAMING');await f.advance(20000);assert.equal(f.medias.length,1);
 f.client.stop();assert.equal(m.stops,1);assert.equal(f.calls.filter(x=>x.op==='withdraw').length,0);await f.advance(120000);assert.equal(m.stops,1);
 const receive=fixture({role:'receive'});await receive.client.open(hash('receive'));await receive.client.accept();assert.equal(receive.random(),0);assert.equal(receive.calls.length,1);assert.equal(receive.views.at(-1).state,'APP_REQUIRED');
 const mismatch=fixture({role:'receive'});await mismatch.client.open(hash());assert.equal(mismatch.views.at(-1).state,'ENDED');assert.equal(mismatch.random(),0);
 const invalid=fixture();await invalid.client.open('#invalid');assert.equal(invalid.calls.length,0);
 const uncertain=fixture();uncertain.failAccept=true;await uncertain.client.open(hash());await uncertain.client.accept();assert.equal(uncertain.views.at(-1).state,'RETRY');await uncertain.client.retry();await uncertain.client.accept();assert.equal(uncertain.random(),1);assert.equal(uncertain.calls.filter(x=>x.op==='accept').length,2);
 const resumed=fixture();resumed.accepted=true;resumed.records.set('screen-share-request-v1:'+id,JSON.stringify({claim:savedClaim,ended:false}));await resumed.client.open(hash());assert.equal(resumed.random(),0);assert.ok(resumed.calls.some(x=>x.op==='participant-state'));assert.equal(resumed.calls.filter(x=>x.op==='accept').length,0);
 const beforeAccept=fixture();beforeAccept.records.set('screen-share-request-v1:'+id,JSON.stringify({claim:savedClaim,ended:false}));await beforeAccept.client.open(hash());assert.equal(beforeAccept.views.at(-1).state,'PREVIEW');await beforeAccept.client.accept();assert.equal(beforeAccept.random(),0);
 const conflict=fixture();conflict.conflict=true;await conflict.client.open(hash());await conflict.client.accept();assert.equal(conflict.views.at(-1).state,'ENDED');await conflict.client.accept();assert.equal(conflict.random(),1);
 const storage=fixture({storage:{getItem(){throw Error();},setItem(){throw Error();}}});await storage.client.open(hash());assert.equal(storage.views.at(-1).state,'ENDED');assert.equal(storage.calls.length,1);
 const stopped=fixture();await stopped.client.open(hash());await stopped.client.accept();const timer=stopped.tasks.find(t=>t.at===2000);stopped.client.stop();const count=stopped.calls.length;timer.fn();await settle();assert.equal(stopped.calls.length,count);assert.equal(stopped.calls.filter(x=>x.op==='withdraw').length,1);
 const stale=fixture();await stale.client.open(hash());await stale.client.accept();stale.assigned=true;await stale.advance(2000);const old=stale.medias[0];await stale.client.open(hash('send',Buffer.alloc(16,8).toString('base64url')));const last=stale.views.at(-1);old.options.frame();old.options.ended();assert.equal(stale.views.at(-1),last);
 const expired=fixture();await expired.client.open(hash());await expired.client.accept();await expired.advance(120000);assert.equal(expired.views.at(-1).state,'ENDED');
 const race=fixture();race.readinessRace=true;await race.client.open(hash());await race.client.accept();assert.equal(race.medias.length,1);assert.equal(race.calls.filter(x=>x.op==='withdraw').length,0);
 const readyRetry=fixture();readyRetry.readinessNetwork=true;await readyRetry.client.open(hash());await readyRetry.client.accept();assert.equal(readyRetry.views.at(-1).state,'RETRY');await readyRetry.client.retry();assert.equal(readyRetry.views.at(-1).state,'WAITING');assert.equal(readyRetry.calls.filter(x=>x.op==='accept').length,1);
 const limited=fixture();let attempts=0;limited.client.http.call=async()=>{attempts++;throw new R.SafeError('rate',60000);};await limited.client.open(hash());await limited.client.retry();assert.equal(attempts,1);await limited.advance(60000);await limited.client.retry();assert.equal(attempts,2);
 const delayed=fixture();let complete;delayed.client.http.call=()=>new Promise(resolve=>{complete=resolve;});const opening=delayed.client.open(hash());await delayed.client.open('#invalid');const unchanged=delayed.views.at(-1);complete(delayed.data());await opening;assert.equal(delayed.views.at(-1),unchanged);
 const reload=fixture();await reload.client.open(hash());await reload.client.accept();reload.client.stop(reload.client.current,false);assert.equal(JSON.parse(reload.records.get('screen-share-request-v1:'+id)).ended,false);assert.equal(reload.calls.filter(x=>x.op==='withdraw').length,0);
 for(const value of [{role:'sender',intent:'join',code:'7K4M2Q'},{role:'receiver',intent:'create',code:'7K4M2Q'},{role:'receiver',intent:'join',code:'BAD'}])assert.equal(!!R.assignment(value),false);
}
async function httpTests(){
 let seen;const client=new R.Http(async(url,options)=>{seen={url,options};return new Response(JSON.stringify({state:'WAITING'}),{headers:{'Content-Type':'application/json'}});});
 await client.call(id,'status',cap);assert.ok(!seen.url.includes(cap));assert.equal(seen.options.headers.Authorization,'Bearer '+cap);assert.equal(seen.options.credentials,'omit');assert.equal(seen.options.referrerPolicy,'no-referrer');assert.equal(seen.options.cache,'no-store');
 for(const [code,kind] of [[400,'invalid'],[404,'unavailable'],[409,'conflict'],[410,'expired'],[429,'rate'],[503,'service']])await assert.rejects(new R.Http(async()=>new Response('{}',{status:code,headers:{'Retry-After':'60'}})).call(id,'status',cap),e=>e.kind===kind&&(kind!=='rate'||e.wait===60000));
 await assert.rejects(new R.Http(async()=>new Response('a'.repeat(17000),{headers:{'Content-Type':'application/json'}})).call(id,'status',cap),e=>e.kind==='invalid');
 await assert.rejects(new R.Http(async()=>new Response('{}',{headers:{'Content-Type':'text/html'}})).call(id,'status',cap),e=>e.kind==='invalid');
 await assert.rejects(new R.Http(async()=>new Response(new ReadableStream({start(controller){controller.error(new TypeError('synthetic interrupted response'));}}),{headers:{'Content-Type':'application/json'}})).call(id,'status',cap),e=>e.kind==='network');
 for(const [header,expected] of [['1'+'0'.repeat(307),300000],['60',60000],['not-a-time',60000]]){
  await assert.rejects(new R.Http(async()=>new Response('{}',{status:429,headers:{'Retry-After':header}})).call(id,'status',cap),e=>e.kind==='rate'&&Number.isFinite(e.wait)&&e.wait===expected);
 }
}
async function cleanupAuthorityTests(){
 async function setup(){const f=fixture();await f.client.open(hash());await f.client.accept();f.assigned=true;await f.advance(2000);return f;}
 for(const admitted of [false,true]){
  const f=await setup(),media=f.medias[0];
  assert.equal(f.client.current.transportAdmitted,false);
  if(admitted)media.options.admitted();
  media.options.ended();media.options.ended();
  assert.equal(f.client.current.closed,true);assert.equal(media.stops,1);
  assert.equal(f.calls.filter(x=>x.op==='withdraw').length,admitted?1:0,'transport failure withdrawal requires successful registration');
 }
 for(const admitted of [false,true]){
  const f=await setup();if(admitted)f.medias[0].options.admitted();f.client.stop();
  assert.equal(f.calls.filter(x=>x.op==='withdraw').length,1,'explicit winner Stop retains claim authority before and after admission');
 }
 const constructor=fixture();constructor.client.media=()=>{throw Error('synthetic unavailable API');};await constructor.client.open(hash());await constructor.client.accept();constructor.assigned=true;await constructor.advance(2000);assert.equal(constructor.calls.filter(x=>x.op==='withdraw').length,0);
 for(const kind of ['network','rate','invalid','expired']){
  const f=await setup(),media=f.medias[0];media.options.admitted();let reject;
  f.client.http.call=async(request,op)=>{f.calls.push({request,op});return new Promise((resolve,fail)=>{reject=fail;});};
  const pending=f.client.poll(f.client.current),staleDeadline=f.tasks.find(t=>t.at===120000);
  media.options.connected();media.options.frame();reject(new R.SafeError(kind,60000));await pending;staleDeadline.fn();
  assert.equal(f.views.at(-1).state,'STREAMING');assert.equal(f.views.at(-1).retry,false);assert.equal(f.client.current.closed,false);assert.equal(media.stops,0);assert.equal(f.calls.filter(x=>x.op==='withdraw').length,0);
  media.options.ended();assert.equal(f.views.at(-1).state,'ENDED');assert.equal(media.stops,1);assert.equal(f.calls.filter(x=>x.op==='withdraw').length,0,'true established media failure remains terminal without withdrawal');
 }
 const frame=await setup();frame.medias[0].options.frame();frame.client.error(frame.client.current,new R.SafeError('network'),()=>{});assert.equal(frame.views.at(-1).state,'STREAMING');assert.equal(frame.client.current.established,true);
 const stale=await setup(),old=stale.medias[0].options;await stale.client.open('#invalid');const replacement=stale.client.current;old.admitted();old.ended();old.frame();assert.equal(replacement.transportAdmitted,false);assert.equal(stale.views.at(-1).state,'INVALID');
 console.log('PASS cleanup authority and late setup probe: rejected transports local-only; explicit/owning Stop preserved; STREAMING remains STREAMING after setup errors; actual media failure still ends.');
}
async function mediaTests(){
 const tasks=[],sockets=[],peers=[];let frames=0,ends=0,connected=0,current=true;
 class Peer{constructor(config){assert.deepEqual(config,M.RTC_CONFIG);peers.push(this);this.applied=[];}async setRemoteDescription(d){this.remoteDescription=d;}async addIceCandidate(c){this.applied.push(c);}async createAnswer(){return {type:'answer',sdp:'synthetic-answer'};}async setLocalDescription(d){this.localDescription=d;}close(){this.closed=true;}}
 class Socket{constructor(url){this.url=url;this.sent=[];this.readyState=1;sockets.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.closed=true;}message(m){this.onmessage?.({data:JSON.stringify(m)});}}
 const video={play:async()=>{},readyState:2,videoWidth:720,videoHeight:1280};
 let admissions=0;
 const options={requestId:id,claim:savedClaim,session:{code:'7K4M2Q'},wsBase:R.WS,current:()=>current,admitted:()=>admissions++,connected:()=>connected++,frame:()=>frames++,ended:()=>ends++};
 const deps={video,Peer,Socket,Stream:class{},later:(fn,ms)=>{const t={fn,ms};tasks.push(t);return t;},cancel:t=>{if(t)t.cancelled=true;}};
 const media=M.create(options,deps),ws=sockets[0],pc=peers[0];assert.ok(!ws.url.includes(cap)&&!ws.url.includes(savedClaim)&&!ws.url.includes(id));ws.onopen();assert.deepEqual(ws.sent,[{type:'request-auth',requestId:id,secret:savedClaim}]);
 pc.onicecandidate({candidate:{toJSON:()=>({candidate:'synthetic',sdpMid:'0',sdpMLineIndex:0})}});assert.equal(ws.sent.length,1);
 assert.equal(admissions,0);ws.message({type:'registration',status:'ok',role:'receiver',intent:'join'});await settle();assert.equal(admissions,1);assert.equal(ws.sent[1].type,'ice');
 ws.message({type:'peer-present'});ws.message({type:'ice',candidate:{candidate:'synthetic',sdpMid:'0',sdpMLineIndex:0}});ws.message({type:'offer',sdp:'synthetic-offer'});await settle();assert.equal(pc.applied.length,1);assert.ok(ws.sent.some(x=>x.type==='answer'));assert.equal(pc.localDescription.type,'answer');
 pc.ontrack({track:{kind:'video'},streams:[{}]});await settle();video.onplaying();assert.equal(frames,1);pc.connectionState='connected';pc.onconnectionstatechange();assert.equal(connected,1);
 pc.connectionState='disconnected';pc.onconnectionstatechange();assert.ok(tasks.some(t=>t.ms===4000));pc.connectionState='connected';pc.onconnectionstatechange();assert.ok(tasks.find(t=>t.ms===4000).cancelled);
 media.stop();media.stop();assert.ok(pc.closed&&ws.closed);assert.equal(ws.sent.filter(x=>x.type==='bye').length,1);assert.equal(ends,0);
 for(const mode of ['auth','peer','timeout','old']){current=true;const m=M.create(options,deps),w=sockets.at(-1),p=peers.at(-1),before=ends;
  if(mode==='auth'){const admitted=admissions;w.message({type:'registration',status:'not-found'});await settle();assert.equal(admissions,admitted);assert.equal(ends,before+1);assert.equal(w.sent.filter(x=>x.type==='answer').length,0);}
  if(mode==='peer'){p.connectionState='failed';p.onconnectionstatechange();assert.equal(ends,before+1);}
  if(mode==='timeout'){tasks.at(-1).fn();assert.equal(ends,before+1);}
  if(mode==='old'){current=false;w.onerror();assert.equal(ends,before);m.stop();}
 }
 current=true;const timed=M.create(options,deps),w=sockets.at(-1),before=ends;
 w.message({type:'registration',status:'ok',role:'receiver',intent:'join'});w.message({type:'peer-present'});w.message({type:'offer',sdp:'synthetic'});await settle();const direct=tasks.findLast(t=>t.ms===45000);direct.fn();assert.equal(ends,before+1);timed.stop();
}
(async()=>{await clientTests();await httpTests();await mediaTests();await cleanupAuthorityTests();
 for(const file of ['connection-request.js','connection-request-media.js','connection-request-entry.js']){const text=fs.readFileSync(file,'utf8');assert.ok(!/console\.|localStorage|indexedDB|Pairing\.|RemoteLink\./.test(text),file);}
 console.log('PASS request-first parser, explicit claim/Accept/reload, readiness/assignment, bounded HTTP, exact attempt isolation, protected answer/ICE/media and secret hygiene.');
})().catch(error=>{console.error('FAIL request-first verifier '+error.name+' '+error.stack?.split('\n').find(line=>line.includes('at clientTests')||line.includes('at httpTests')||line.includes('at mediaTests')));process.exitCode=1;});
