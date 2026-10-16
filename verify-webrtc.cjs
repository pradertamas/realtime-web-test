'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env(frameSupport=true,search=''){
 let now=0,id=0;const nodes=new Map(),timers=new Map();
 const node=()=>({value:' 7k4m2q ',disabled:false,textContent:'',srcObject:null,children:[],play:()=>Promise.resolve(),replaceChildren(...v){this.children=v;}});
 const document={getElementById(k){if(!nodes.has(k))nodes.set(k,node());return nodes.get(k);},createElement:node,addEventListener(){}};
 document.getElementById('session');
 if(frameSupport){document.getElementById('video').requestVideoFrameCallback=f=>{document.getElementById('video').callback=f;return ++id;};document.getElementById('video').cancelVideoFrameCallback=()=>{};}
 class WS{static OPEN=1;static instances=[];constructor(url){this.url=url;this.readyState=0;this.sent=[];WS.instances.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}open(){this.readyState=1;this.onopen();}message(m){if(m.type==='session-config'){this.mode=m.mode;this.configId=m.configId;}if(['offer','ice'].includes(m.type)){m={configId:this.configId,mode:this.mode,...m};}this.onmessage({data:JSON.stringify(m)});}}
 class PC{static instances=[];constructor(config){this.config=config;this.connectionState='new';this.iceConnectionState='new';this.signalingState='stable';this.ice=[];this.report=new Map();PC.instances.push(this);}async setRemoteDescription(d){await Promise.resolve();this.remoteDescription=d;}async addIceCandidate(c){assert.ok(this.remoteDescription);this.ice.push(c);}async createAnswer(){return{type:'answer',sdp:'answer-sdp'};}async setLocalDescription(d){this.localDescription=d;}async getStats(){return this.report;}close(){this.closed=true;}}
 const context=vm.createContext({console,document,window:{location:{search},addEventListener(){}},performance:{now:()=>now},RTCPeerConnection:PC,WebSocket:WS,TextEncoder,URLSearchParams,URL,crypto:require("node:crypto").webcrypto,QrTools:{render(){},CameraScanner:class{stop(){}start(){}}},MediaStream:class{constructor(t){this.t=t;}getTracks(){return this.t;}},setInterval(f,ms){timers.set(++id,{f,ms});return id;},clearInterval(i){timers.delete(i);},setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout(i){timers.delete(i);}});
 vm.runInContext(fs.readFileSync('pairing.js','utf8'),context);
 vm.runInContext(fs.readFileSync('webrtc-receiver.js','utf8'),context);
 return{run:s=>vm.runInContext(s,context),nodes,WS,PC,timers,time:n=>now=n};
}
(async()=>{
 const e=env();await e.run('connect()');assert.equal(e.PC.instances.length,1);const ws=e.WS.instances[0];ws.open();ws.message({type:'registration',status:'ok'});await e.run('active.chain');const pc=e.PC.instances[0];
 assert.match(ws.url,/intent=join/);assert.match(ws.url,/role=receiver/);assert.equal(ws.sent[0].type,'ready');assert.equal(pc.config.iceTransportPolicy,'all');
 ws.message({type:'ice',candidate:{candidate:'early',sdpMLineIndex:0}});ws.message({type:'offer',sdp:'offer-sdp'});ws.message({type:'ice',candidate:{candidate:'late',sdpMLineIndex:0}});
 await e.run('active.chain');assert.equal(ws.sent.filter(m=>m.type==='answer').length,1);assert.equal(pc.ice.length,2);
 ws.message({type:'offer',sdp:'duplicate'});await e.run('active.chain');assert.equal(ws.sent.filter(m=>m.type==='answer').length,1);
 e.time(1000);await e.run('sample(active)');assert.ok(e.nodes.get('videoMetrics').children.some(n=>n.textContent==='N/A'));
 const report=(bytes,frames)=>new Map([
 ['in',{id:'in',type:'inbound-rtp',kind:'video',bytesReceived:bytes,framesDecoded:frames,framesDropped:2,frameWidth:720,frameHeight:1560,codecId:'codec'}],
 ['codec',{id:'codec',type:'codec',mimeType:'video/VP8'}],['t',{type:'transport',selectedCandidatePairId:'pair'}],
 ['pair',{type:'candidate-pair',localCandidateId:'l',remoteCandidateId:'r',state:'succeeded',currentRoundTripTime:.012}],
 ['l',{type:'local-candidate',candidateType:'host',protocol:'udp'}],['r',{type:'remote-candidate',candidateType:'host'}]]);
 pc.report=report(1000,30);e.time(2000);await e.run('sample(active)');pc.report=report(301000,60);e.time(3000);await e.run('sample(active)');
 assert.equal(e.run('active.latest.bitrate'),2400000);assert.equal(e.run('active.latest.resolution'),'720 × 1560');assert.equal(e.run('active.latest.candidate'),'host / host');
 const video=e.nodes.get('video');video.callback(3000,{captureTime:2900,receiveTime:2920,expectedDisplayTime:2950,presentationTime:2940});
 assert.equal(e.run('active.timing.captureDisplay.current'),50);assert.equal(e.run('active.timing.captureReceive.current'),20);
 video.callback(3100,{});assert.equal(e.run('active.timing.captureDisplay.current'),null);assert.equal(e.run('active.timing.captureDisplay.count'),1);
 e.time(4000);await e.run('stop(active)');assert.ok(pc.closed);assert.equal(e.timers.size,0);assert.match(e.nodes.get('summary').value,/Bytes received: 301000/);assert.match(e.nodes.get('summary').value,/avg 50.00 ms/);assert.equal(e.run('active'),null);
 await e.run('connect()');e.WS.instances.at(-1).open();assert.equal(e.PC.instances.length,2);await e.run('stop(active)');assert.match(e.nodes.get('previousSummary').value,/Bytes received: 301000/);
 const u=env(false);await u.run('connect()');u.WS.instances[0].open();u.time(1000);await u.run('sample(active)');await u.run('stop(active)');assert.match(u.nodes.get('summary').value,/avg N\/A/);
 const m=env();await m.run('connect()');m.WS.instances[0].open();const chain=m.run('active');m.WS.instances[0].onmessage({data:'{'});await chain.chain;assert.equal(m.run('active'),null);
 const query=env(true,'?session=%207k4m2q%20');assert.equal(query.nodes.get('session').value,'7K4M2Q');assert.equal(query.WS.instances.length,0);await query.run('connect()');assert.match(query.WS.instances[0].url,/session=7K4M2Q/);await query.run('stop(active)');
 const bad=env(true,'?session=0O1IAB');assert.match(bad.nodes.get('status').textContent,/invalid/);bad.nodes.get('session').value='0O1IAB';await bad.run('connect()');assert.equal(bad.WS.instances.length,0);
 const turn=env();await turn.run('connect()');turn.WS.instances[0].open();const ts=turn.run('active');turn.WS.instances[0].message({type:'session-config',mode:'FORCE_TURN'});await ts.chain;assert.equal(turn.run('active'),null);
 const creator=env();await creator.run("connect('create')");const cw=creator.WS.instances[0];assert.match(cw.url,/intent=create/);cw.open();cw.message({type:'registration',status:'conflict'});await creator.run('active.chain');assert.equal(creator.WS.instances.length,2);assert.notEqual(creator.WS.instances[0].url,creator.WS.instances[1].url);creator.WS.instances[1].open();creator.WS.instances[1].message({type:'registration',status:'ok'});await creator.run('active.chain');assert.equal(creator.nodes.get('createdPairing').hidden,false);await creator.run('stop(active)');
 const missing=env();await missing.run('connect()');const mw=missing.WS.instances[0];mw.open();const ms=missing.run('active');mw.message({type:'registration',status:'not-found'});await ms.chain;assert.equal(missing.nodes.get('status').textContent,'Pairing code not found or expired.');assert.equal(missing.WS.instances.length,1);
 const legacy=env();await legacy.run('connect()');const lw=legacy.WS.instances[0];lw.open();const ls=legacy.run('active');lw.message({type:'offer',sdp:'old-relay-no-create-join'});await ls.chain;assert.equal(legacy.run('active'),null);assert.equal(legacy.PC.instances[0].remoteDescription,undefined);
 const exhausted=env();await exhausted.run("connect('create')");let finished;
 for(let i=0;i<4;i++){const current=exhausted.WS.instances.at(-1);current.open();finished=exhausted.run('active');current.message({type:'registration',status:'conflict'});await finished.chain;}
 assert.equal(exhausted.WS.instances.length,4);assert.equal(exhausted.run('active'),null);assert.equal(exhausted.nodes.get('status').textContent,'Pairing code already in use.');
 const failed=env();await failed.run('connect()');const fp=failed.PC.instances[0];fp.connectionState='failed';const failing=failed.run('active');fp.onconnectionstatechange();await new Promise(resolve=>setImmediate(resolve));assert.equal(failed.run('active'),null);assert.equal(failed.nodes.get('status').textContent,'Direct connection could not be established.');
 assert.equal(pc.config.iceServers.length,1);assert.match(pc.config.iceServers[0].urls,/^stun:/);assert.equal(e.run('typeof NetworkTest'),'undefined');
 for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){for(const [,ref] of fs.readFileSync(file,'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)){if(!/^(https?:|data:)/.test(ref))assert.ok(fs.existsSync(ref),file+': '+ref);}}
 console.log('PASS direct STUN-only signaling/early ICE, duplicate offer, missing stats, bitrate, selected pair, frame timing, summary/cleanup/reconnect, code normalization, QR query prefill without auto-connect, invalid code, TURN-config rejection, direct failure and static links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
