'use strict';
// Actual loopback relay HTTP + protected WebSocket admission; synthetic SDP/media API only.
const assert=require('node:assert/strict'),{once}=require('node:events'),{webcrypto}=require('node:crypto');
const {createRelay}=require('../realtime-relay/server.js'),{WebSocket}=require('../realtime-relay/node_modules/ws');
const {ConnectionRequest:R}=require('./connection-request.js'),{ConnectionRequestMedia:M}=require('./connection-request-media.js');
async function wait(test){for(let n=0;n<200;n++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error('Local protocol event missing');}
(async()=>{
 const relay=createRelay({port:0}),sockets=[],clients=[],withdrawals=[];let client;
 relay.start();await once(relay.server,'listening');
 try{
  const base='http://127.0.0.1:'+relay.server.address().port,records=new Map(),views=[];
  const api=async(path,secret,body,allowGone=false)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(secret?{Authorization:'Bearer '+secret}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.ok(response.ok||(allowGone&&response.status===410));return response.json();};
  const request=await api('/connection-requests',null,{version:1,initiatorRole:'send'}),path='/connection-requests/'+request.requestId;
  const preview=await api(path+'/status',request.recipientCapability);assert.equal(preview.state,'WAITING');
  const preflight=await fetch(base+path+'/accept',{method:'OPTIONS',headers:{Origin:'https://pairing.pradert.synology.me','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);
  class Socket extends WebSocket{constructor(url){super(url.replace(R.WS,base.replace('http:','ws:')+'/ws'));sockets.push(this);}}
  class Peer{async setRemoteDescription(d){this.remoteDescription=d;}async addIceCandidate(){}async createAnswer(){return {type:'answer',sdp:'synthetic-answer'};}async setLocalDescription(d){this.localDescription=d;}close(){}}
  function makeClient(storage,view=()=>{}){const c=new R.Client({crypto:webcrypto,storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
   http:new R.Http((url,options)=>{if(url.endsWith('/withdraw'))withdrawals.push(url);return fetch(url,{...options,headers:{...options.headers,Origin:'https://pairing.pradert.synology.me'}});},base),view,
   media:options=>M.create(options,{video:{play:async()=>{}},Peer,Socket})});clients.push(c);return c;}
  client=makeClient(records,v=>views.push(v));
  await client.open(`#v=1&r=${request.requestId}&c=${request.recipientCapability}&i=send`);assert.equal(views.at(-1).state,'PREVIEW');
  assert.equal((await api(path+'/status',request.initiatorSecret)).state,'WAITING');
  await client.accept();assert.equal((await api(path+'/status',request.initiatorSecret)).recipientReady,true);
  await api(path+'/participant-state',request.initiatorSecret,{ready:true});const binding=await api(path+'/session',request.initiatorSecret,{});
  await client.poll(client.current);await wait(()=>client.current.transportAdmitted); // JOIN first is supported.
  const first=sockets[0],before=await api(path+'/status',request.initiatorSecret);
  const duplicate=makeClient(new Map(records));
  await duplicate.open(`#v=1&r=${request.requestId}&c=${request.recipientCapability}&i=send`);
  await wait(()=>duplicate.current.closed);
  const after=await api(path+'/status',request.initiatorSecret);
  assert.equal(before.state,'CONNECTING');assert.equal(after.state,'CONNECTING');assert.equal(after.failureReason,undefined);
  assert.equal(client.current.closed,false);assert.equal(first.readyState,WebSocket.OPEN);assert.equal(duplicate.current.transportAdmitted,false);assert.equal(withdrawals.length,0);
  console.log('PASS duplicate-tab probe: before=CONNECTING after=CONNECTING failureReason=none firstTabClosed=false secondTabClosed=true withdraw=0');
  const sender=new WebSocket(base.replace('http:','ws:')+'/ws?session='+binding.session.code+'&role=sender&intent=create');sockets.push(sender);
  const messages=[];sender.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);if(m.type==='peer-present')sender.send(JSON.stringify({type:'offer',sdp:'synthetic-offer'}));});
  await once(sender,'open');sender.send(JSON.stringify({type:'request-auth',requestId:request.requestId,secret:request.initiatorSecret}));
  await wait(()=>messages.some(m=>m.type==='answer'));assert.equal(messages.find(m=>m.type==='answer').sdp,'synthetic-answer');
  assert.equal((await api(path+'/status',request.initiatorSecret)).state,'CONNECTED');assert.equal(sockets.length,3);
  client.stop();console.log('PASS local browser client create/preview/explicit Accept/claim/readiness/assignment/protected JOIN + synthetic offer/answer; no native ICE success claimed.');
  for(const reason of ['explicit-stop','owner-transport-failure']){
   const r=await api('/connection-requests',null,{version:1,initiatorRole:'send'}),p='/connection-requests/'+r.requestId;
   const owner=makeClient(new Map());await owner.open(`#v=1&r=${r.requestId}&c=${r.recipientCapability}&i=send`);await owner.accept();
   await api(p+'/participant-state',r.initiatorSecret,{ready:true});await api(p+'/session',r.initiatorSecret,{});await owner.poll(owner.current);await wait(()=>owner.current.transportAdmitted);
   if(reason==='explicit-stop')owner.stop();else sockets.at(-1).terminate();
   await wait(()=>owner.current.closed);
   let result;for(let n=0;n<200;n++){result=await api(p+'/status',r.initiatorSecret,undefined,true);if(result.state==='FAILED')break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(result.state,'FAILED');assert.equal(result.failureReason,'recipient_withdrew');
   assert.equal(withdrawals.filter(url=>url===base+p+'/withdraw').length,1);
   console.log('PASS admitted pre-established '+reason+': exact winner withdraws once');
  }
 }finally{for(const c of clients)c.stop();for(const ws of sockets)ws.terminate();const closed=once(relay.server,'close');relay.shutdown();await closed;}
})().catch(()=>{console.error('FAIL local request browser integration');process.exitCode=1;});
