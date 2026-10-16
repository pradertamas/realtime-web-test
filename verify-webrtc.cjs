'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function env(frameSupport=true){
 let now=0,id=0;const nodes=new Map(),timers=new Map();
 const node=()=>({value:'poc4a_test',disabled:false,textContent:'',srcObject:null,children:[],play:()=>Promise.resolve(),replaceChildren(...v){this.children=v;}});
 const document={getElementById(k){if(!nodes.has(k))nodes.set(k,node());return nodes.get(k);},createElement:node};
 if(frameSupport){document.getElementById('video').requestVideoFrameCallback=f=>{document.getElementById('video').callback=f;return ++id;};document.getElementById('video').cancelVideoFrameCallback=()=>{};}
 class WS{static OPEN=1;static instances=[];constructor(url){this.url=url;this.readyState=0;this.sent=[];WS.instances.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}open(){this.readyState=1;this.onopen();}message(m){this.onmessage({data:JSON.stringify(m)});}}
 class PC{static instances=[];constructor(config){this.config=config;this.connectionState='new';this.iceConnectionState='new';this.signalingState='stable';this.ice=[];this.report=new Map();PC.instances.push(this);}async setRemoteDescription(d){await Promise.resolve();this.remoteDescription=d;}async addIceCandidate(c){assert.ok(this.remoteDescription);this.ice.push(c);}async createAnswer(){return{type:'answer',sdp:'answer-sdp'};}async setLocalDescription(d){this.localDescription=d;}async getStats(){return this.report;}close(){this.closed=true;}}
 const context=vm.createContext({console,document,window:{addEventListener(){}},performance:{now:()=>now},RTCPeerConnection:PC,WebSocket:WS,TextEncoder,MediaStream:class{constructor(t){this.t=t;}getTracks(){return this.t;}},setInterval(f,ms){timers.set(++id,{f,ms});return id;},clearInterval(i){timers.delete(i);}});
 vm.runInContext(fs.readFileSync('webrtc-receiver.js','utf8'),context);
 return{run:s=>vm.runInContext(s,context),nodes,WS,PC,timers,time:n=>now=n};
}
(async()=>{
 const e=env();await e.run('connect()');const ws=e.WS.instances[0],pc=e.PC.instances[0];ws.open();
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
 await e.run('connect()');assert.equal(e.PC.instances.length,2);await e.run('stop(active)');
 const u=env(false);await u.run('connect()');u.WS.instances[0].open();u.time(1000);await u.run('sample(active)');await u.run('stop(active)');assert.match(u.nodes.get('summary').value,/avg N\/A/);
 const m=env();await m.run('connect()');m.WS.instances[0].open();const chain=m.run('active');m.WS.instances[0].onmessage({data:'{'});await chain.chain;assert.equal(m.run('active'),null);
 for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.html'))){for(const [,ref] of fs.readFileSync(file,'utf8').matchAll(/(?:src|href)="([^"#]+)"/g)){if(!/^(https?:|data:)/.test(ref))assert.ok(fs.existsSync(ref),file+': '+ref);}}
 console.log('PASS WebRTC signaling order/early ICE, duplicate offer, missing stats, bitrate, selected pair, timing, cleanup/summary, reconnect, unsupported timestamps, malformed JSON and static links.');
})().catch(e=>{console.error(e);process.exitCode=1;});
