'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env(frameSupport=true){
 let now=0,id=0;const nodes=new Map(),timers=new Map();
 const node=()=>({value:'poc4a_test',disabled:false,textContent:'',srcObject:null,children:[],play:()=>Promise.resolve(),replaceChildren(...v){this.children=v;}});
 const document={getElementById(k){if(!nodes.has(k))nodes.set(k,node());return nodes.get(k);},createElement:node};
 if(frameSupport){document.getElementById('video').requestVideoFrameCallback=f=>{document.getElementById('video').callback=f;return ++id;};document.getElementById('video').cancelVideoFrameCallback=()=>{};}
 class WS{static OPEN=1;static instances=[];constructor(url){this.url=url;this.readyState=0;this.sent=[];WS.instances.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}open(){this.readyState=1;this.onopen();}message(m){if(m.type==='session-config'){this.mode=m.mode;this.configId=m.configId;}if(['offer','ice'].includes(m.type)){m={configId:this.configId,mode:this.mode,...m};}this.onmessage({data:JSON.stringify(m)});}}
 class PC{static instances=[];constructor(config){this.config=config;this.connectionState='new';this.iceConnectionState='new';this.signalingState='stable';this.ice=[];this.report=new Map();PC.instances.push(this);}async setRemoteDescription(d){await Promise.resolve();this.remoteDescription=d;}async addIceCandidate(c){assert.ok(this.remoteDescription);this.ice.push(c);}async createAnswer(){return{type:'answer',sdp:'answer-sdp'};}async setLocalDescription(d){this.localDescription=d;}async getStats(){return this.report;}close(){this.closed=true;}}
 const context=vm.createContext({console,document,window:{addEventListener(){}},performance:{now:()=>now},RTCPeerConnection:PC,WebSocket:WS,TextEncoder,MediaStream:class{constructor(t){this.t=t;}getTracks(){return this.t;}},setInterval(f,ms){timers.set(++id,{f,ms});return id;},clearInterval(i){timers.delete(i);},setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout(i){timers.delete(i);}});
 vm.runInContext(fs.readFileSync('webrtc-network.js','utf8'),context);
 vm.runInContext(fs.readFileSync('webrtc-receiver.js','utf8'),context);
 return{run:s=>vm.runInContext(s,context),nodes,WS,PC,timers,time:n=>now=n};
}
async function configure(e,mode='AUTO'){
 const ws=e.WS.instances.at(-1);
 const m={type:'session-config',version:1,configId:'01234567-0123-0123-0123-012345678901',mode,usdPerGb:.05,expiresAt:Date.now()+600000,
 iceServers:[{urls:['turn:turn.cloudflare.com:3478?transport=udp'],username:'fixture-user',credential:'fixture-temporary-password'}]};
 ws.message(m);await e.run('active.chain');return m;
}
(async()=>{
 const e=env();await e.run('connect()');assert.equal(e.PC.instances.length,0);const ws=e.WS.instances[0];ws.open();await configure(e);const pc=e.PC.instances[0];
 assert.match(ws.url,/role=receiver/);assert.equal(ws.sent[0].type,'ready');assert.equal(pc.config.iceTransportPolicy,'all');
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
 await e.run('connect()');e.WS.instances.at(-1).open();await configure(e);assert.equal(e.PC.instances.length,2);await e.run('stop(active)');assert.match(e.nodes.get('previousSummary').value,/Bytes received: 301000/);
 const u=env(false);await u.run('connect()');u.WS.instances[0].open();await configure(u);u.time(1000);await u.run('sample(active)');await u.run('stop(active)');assert.match(u.nodes.get('summary').value,/avg N\/A/);
 const m=env();await m.run('connect()');m.WS.instances[0].open();const chain=m.run('active');m.WS.instances[0].onmessage({data:'{'});await chain.chain;assert.equal(m.run('active'),null);
 const turn=env();await turn.run('connect()');const tw=turn.WS.instances[0];tw.open();await configure(turn,'FORCE_TURN');assert.equal(turn.PC.instances[0].config.iceTransportPolicy,'relay');assert.equal(turn.PC.instances[0].config.iceServers.length,1);
 const tr=report(1000000,30);tr.get('l').candidateType='relay';tr.get('r').candidateType='relay';tr.get('l').relayProtocol='udp';tr.get('l').address='192.0.2.1';turn.PC.instances[0].report=tr;turn.time(2000);await turn.run('sample(active)');assert.equal(turn.run('active.relayConfirmed'),true);assert.match(turn.run('summary(active)'),/Estimated relay USD\/hour: 0.0900/);
 tr.get('l').candidateType='host';turn.PC.instances[0].report=report(2000000,60);turn.time(3000);await turn.run('sample(active)');assert.equal(turn.run('active.relayConfirmed'),false);assert.match(turn.run('summary(active)'),/Estimated relay USD\/hour: N\/A/);assert.match(turn.nodes.get('turnProof').textContent,/FAIL \/ NOT RELAY/);
 tw.message({type:'ice',mode:'AUTO',candidate:{candidate:'wrong-policy'}});const ts=turn.run('active');await ts.chain;assert.equal(turn.run('active'),null);
 const old=env();await old.run('connect()');old.WS.instances[0].open();const os=old.run('active');old.WS.instances[0].message({type:'offer',sdp:'legacy'});await os.chain;assert.equal(old.PC.instances.length,0);assert.equal(old.run('active'),null);
 for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){for(const [,ref] of fs.readFileSync(file,'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)){if(!/^(https?:|data:)/.test(ref))assert.ok(fs.existsSync(ref),file+': '+ref);}}
 console.log('PASS WebRTC config-before-peer/ack, AUTO and FORCE_TURN policy, mismatched/legacy rejection, signaling order/early ICE, duplicate offer, missing stats, bitrate, relay proof/cost gating, timing, previous summary, cleanup/reconnect, malformed JSON and static links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
