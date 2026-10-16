'use strict';
// Proven PoC 4A media/signaling flow: STUN discovery, ALL policy, no TURN credentials.
const RTC_CONFIG = {iceServers:[{urls:"stun:stun.l.google.com:19302"}],iceTransportPolicy:"all"};
const SIGNALING_URL = 'wss://realtime-relay-k28l.onrender.com/ws';
const el = id => document.getElementById(id);
const NA = 'N/A';
const number = v => typeof v === 'number' && Number.isFinite(v);
const fmt = (v, suffix='') => number(v) ? v.toFixed(2)+suffix : NA;
function list(id, values) {
  el(id).replaceChildren(...Object.entries(values).flatMap(([key,value]) => {
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=key; dd.textContent=value??NA; return [dt,dd];
  }));
}
function accumulator() { return {current:null,sum:0,count:0,max:null}; }
function observe(a,value) {
  a.current=null;
  if (!number(value) || value<0) return;
  a.current=value; a.sum+=value; a.count++; a.max=Math.max(a.max??0,value);
}
function timingValues(a) {return `current ${fmt(a.current,' ms')} / avg ${fmt(a.count?a.sum/a.count:null,' ms')} / max ${fmt(a.max,' ms')}`;}
let active=null, lastCompleted=null;
function status(text) {el('status').textContent=text;}
function send(s,m) {
  if(active!==s || s.ws.readyState!==WebSocket.OPEN) return;
  const raw=JSON.stringify(m);
  if(new TextEncoder().encode(raw).length>=65536) throw Error('Signaling payload exceeds 64 KiB');
  s.ws.send(raw);
}
function frameLoop(s) {
  const video=el('video');
  if(!video.requestVideoFrameCallback) return;
  s.frameCallback=video.requestVideoFrameCallback((now,m)=>{
    if(active!==s || s.stopping) return;
    if(!s.streaming){s.streaming=true;status('Streaming');}
    observe(s.timing.captureReceive,number(m.receiveTime)&&number(m.captureTime)?m.receiveTime-m.captureTime:null);
    observe(s.timing.receiveDisplay,number(m.expectedDisplayTime)&&number(m.receiveTime)?m.expectedDisplayTime-m.receiveTime:null);
    observe(s.timing.captureDisplay,number(m.expectedDisplayTime)&&number(m.captureTime)?m.expectedDisplayTime-m.captureTime:null);
    s.timestamps={captureTime:m.captureTime,receiveTime:m.receiveTime,expectedDisplayTime:m.expectedDisplayTime,presentationTime:m.presentationTime};
    frameLoop(s);
  });
}
async function signal(s,m) {
  if(active!==s || s.stopping) return;
  if(m.type==='ready') {send(s,{type:'ready'});return;}
  if(m.type==='bye') {await stop(s,'Android stopped');return;}
  if(m.type==='session-config') throw Error('Use the updated direct-connection app.');
  if(m.type==='offer') {
    if(s.offered) return;
    if(typeof m.sdp!=='string') throw Error('Invalid offer');
    s.offered=true;
    clearTimeout(s.waitingTimer);
    s.directTimer=setTimeout(()=>stop(s,"Direct connection could not be established."),45000);
    status("Starting stream");
    await s.pc.setRemoteDescription({type:'offer',sdp:m.sdp});
    if(active!==s || s.stopping) return;
    for(const c of s.pendingIce) await s.pc.addIceCandidate(c);
    s.pendingIce=[];
    await s.pc.setLocalDescription(await s.pc.createAnswer());
    send(s,{type:'answer',sdp:s.pc.localDescription.sdp});
    clearInterval(s.readyTimer);
  } else if(m.type==='ice' && m.candidate) {
    if(s.pc.remoteDescription) await s.pc.addIceCandidate(m.candidate);
    else {if(s.pendingIce.length>=256) throw Error('Too many pending ICE candidates');s.pendingIce.push(m.candidate);}
  }
}
function bindPeer(s) {
  const pc=s.pc;
  pc.onicecandidate=e=>{if(e.candidate) send(s,{type:'ice',candidate:e.candidate.toJSON()});};
  pc.ontrack=e=>{
    if(active!==s || s.stopping || e.track.kind!=='video') return;
    el('video').srcObject=e.streams[0]||new MediaStream([e.track]);
    el('video').play().catch(()=>status('Video autoplay blocked; press Play video.'));
    e.track.onended=()=>stop(s,'Disconnected');
  };
  pc.onconnectionstatechange=()=>{
    if(active!==s || s.stopping) return;
    if(pc.connectionState==='connected'){clearTimeout(s.directTimer);status(s.streaming?'Streaming':'Connected');}
    if(pc.connectionState==='disconnected'){status('Disconnected');clearTimeout(s.directTimer);s.directTimer=setTimeout(()=>stop(s,'Direct connection could not be established.'),15000);}
    if(pc.connectionState==='failed') stop(s,'Direct connection could not be established.');
  };
}
async function connect() {
  if(active) return;
  const session=Pairing.normalize(el('session').value);
  if(!session){status('Enter the 6-character pairing code shown on your phone.');return;}
  el('session').value=session;
  let s;
  try {
    s={pc:new RTCPeerConnection(RTC_CONFIG),streaming:false,session,start:performance.now(),last:null,firstMedia:null,latest:{},peak:0,stopping:false,offered:false,pendingIce:[],chain:Promise.resolve(),statsPending:false,
      timing:{captureReceive:accumulator(),receiveDisplay:accumulator(),captureDisplay:accumulator()},rtt:accumulator(),timestamps:{}};
    active=s;
    bindPeer(s);
    status('Connecting');
    s.waitingTimer=setTimeout(()=>stop(s,'The phone is not available. Start a new share and try its new code.'),300000);
    el('summary').value='Session running; disconnect to retain summary.';
    el('session').disabled=true;el('connect').disabled=true;el('disconnect').disabled=false;
    for(const id of ['connection','videoMetrics','bandwidth','latency']) list(id,{'Status':'Waiting for media'});
    const ws=new WebSocket(SIGNALING_URL+'?session='+encodeURIComponent(session)+'&role=receiver');s.ws=ws;
    ws.onopen=()=>{if(active!==s||s.stopping)return;status('Connected. Waiting for phone...');send(s,{type:'ready'});
      s.readyTimer=setInterval(()=>{if(!s.offered)send(s,{type:'ready'});},1000);};
    ws.onmessage=e=>{
      if(active!==s||s.stopping||typeof e.data!=='string')return;
      if(new TextEncoder().encode(e.data).length>=65536)return;
      // Serialize SDP and trickle ICE async operations; ICE may arrive before setRemoteDescription completes.
      s.chain=s.chain.then(()=>signal(s,JSON.parse(e.data))).catch(()=>stop(s,'Connection could not be established. Start a new share and try again.'));
    };
    ws.onerror=()=>{if(active===s&&!s.stopping)stop(s,'Could not connect. Check your code and internet connection.');};
    ws.onclose=e=>{if(active===s&&!s.stopping)stop(s,'Disconnected');};
    s.statsTimer=setInterval(()=>sample(s).catch(()=>{}),1000);
    frameLoop(s);
  }catch(error) {if(s)await stop(s,'Direct connection could not be established.');else status('WebRTC is unavailable in this browser.');}
}
async function sample(s,final=false) {
  if(active!==s || !s.pc || (!final&&s.stopping)) return;
  if(s.statsPending) {if(final) await s.statsPending;else return;}
  const task=(async()=>{
    const report=await s.pc.getStats();
    if(active!==s)return;
    const all=[...report.values()];
    const inbound=all.find(v=>v.type==='inbound-rtp'&&(v.kind==='video'||v.mediaType==='video'));
    const transport=all.find(v=>v.type==='transport'&&v.selectedCandidatePairId);
    const nominated=all.filter(v=>v.type==='candidate-pair'&&v.nominated&&v.state==='succeeded');
    const pair=report.get(transport?.selectedCandidatePairId)||all.find(v=>v.type==='candidate-pair'&&v.selected===true)||(nominated.length===1?nominated[0]:null);
    const local=report.get(pair?.localCandidateId),remote=report.get(pair?.remoteCandidateId);
    const codec=report.get(inbound?.codecId);
    const now=performance.now();
    const bytes=inbound?.bytesReceived;
    const elapsed=(now-s.start)/1000;
    const bitrate=s.last&&number(bytes)&&number(s.last.bytes)&&now>s.last.at?Math.max(0,bytes-s.last.bytes)*8000/(now-s.last.at):null;
    if(number(bitrate))s.peak=Math.max(s.peak,bitrate);
    const receivedFps=s.last&&number(inbound?.framesReceived)&&number(s.last.received)&&now>s.last.at?Math.max(0,inbound.framesReceived-s.last.received)*1000/(now-s.last.at):null;
    const decodedFps=s.last&&number(inbound?.framesDecoded)&&number(s.last.frames)?Math.max(0,inbound.framesDecoded-s.last.frames)*1000/(now-s.last.at):null;
    s.last={at:now,bytes,frames:inbound?.framesDecoded,received:inbound?.framesReceived};
    observe(s.rtt,number(pair?.currentRoundTripTime)?pair.currentRoundTripTime*1000:null);
    s.latest={duration:elapsed,bytes,bitrate,averageBitrate:number(bytes)?bytes*8/elapsed:null,frames:inbound?.framesDecoded,dropped:inbound?.framesDropped,
      averageFps:number(inbound?.framesDecoded)?inbound.framesDecoded/elapsed:null,codec:codec?.mimeType,resolution:inbound?.frameWidth&&inbound?.frameHeight?`${inbound.frameWidth} × ${inbound.frameHeight}`:NA,
      candidate:`${local?.candidateType??NA} / ${remote?.candidateType??NA}`,protocol:local?.protocol??NA,
      relayProtocol:`${local?.relayProtocol??NA} / ${remote?.relayProtocol??NA}`,
      family:`${addressFamily(local?.address??local?.ip)} / ${addressFamily(remote?.address??remote?.ip)}`};
    list('connection',{'peerConnectionState':s.pc.connectionState,'iceConnectionState':s.pc.iceConnectionState,'signalingState':s.pc.signalingState,
      'Selected local / remote candidate':s.latest.candidate,'Protocol':s.latest.protocol,'Relay protocol local / remote':s.latest.relayProtocol,
      'Address family local / remote':s.latest.family,'Selected pair state':pair?.state,'Current RTT':fmt(s.rtt.current,' ms')});
    list('videoMetrics',{'Negotiated codec':codec?.mimeType,'Received width':inbound?.frameWidth,'Received height':inbound?.frameHeight,
      'Received FPS (delta)':fmt(receivedFps),'Decoded FPS (browser framesPerSecond)':fmt(inbound?.framesPerSecond),'Decoded FPS (delta)':fmt(decodedFps),'Frames received':inbound?.framesReceived,'Frames decoded':inbound?.framesDecoded,
      'Frames dropped':inbound?.framesDropped,'Key frames decoded':inbound?.keyFramesDecoded,'Packets received':inbound?.packetsReceived,'Packets lost':inbound?.packetsLost});
    list('bandwidth',{'Cumulative RTP bytes received':bytes,'Current bitrate':fmt(bitrate,' bps'),'Average bitrate (full session)':fmt(s.latest.averageBitrate,' bps'),
      'Peak bitrate (~1 s)':fmt(s.peak,' bps'),'Available incoming bitrate':fmt(pair?.availableIncomingBitrate,' bps'),'Available outgoing bitrate':fmt(pair?.availableOutgoingBitrate,' bps')});
    list('latency',{'capture → receive':timingValues(s.timing.captureReceive),'receive → expected display':timingValues(s.timing.receiveDisplay),
      'capture → expected display':timingValues(s.timing.captureDisplay),...Object.fromEntries(Object.entries(s.timestamps).map(([k,v])=>[k,fmt(v,' ms')]))});
  })();
  s.statsPending=task;
  try{await task;}finally{s.statsPending=false;}
}
function summary(s) {
  const m=s.latest;
  return Object.entries({'Connection':'Direct P2P / STUN only','Address family local / remote':m.family??NA,
    'Duration':fmt(m.duration,' s'),'Bytes received':m.bytes??NA,'Current bitrate':fmt(m.bitrate,' bps'),'Average bitrate':fmt(m.averageBitrate,' bps'),
    'Peak bitrate (~1 s)':fmt(s.peak,' bps'),'Frames decoded':m.frames??NA,'Frames dropped':m.dropped??NA,'Average decoded FPS (full session)':fmt(m.averageFps),
    'Codec':m.codec??NA,'Resolution':m.resolution??NA,'Selected local / remote candidate':m.candidate??NA,'Protocol':m.protocol??NA,
    'Average RTT':fmt(s.rtt.count?s.rtt.sum/s.rtt.count:null,' ms'),'Maximum RTT':fmt(s.rtt.max,' ms'),
    'Estimated capture → receive':timingValues(s.timing.captureReceive),'Estimated receive → expected display':timingValues(s.timing.receiveDisplay),
    'Estimated capture → expected display':timingValues(s.timing.captureDisplay)}).map(([k,v])=>k+': '+v).join('\n');
}
async function stop(s,reason='Disconnected') {
  if(active!==s||s.stopping)return;
  s.stopping=true;clearInterval(s.readyTimer);clearInterval(s.statsTimer);clearTimeout(s.directTimer);clearTimeout(s.waitingTimer);
  try{send(s,{type:'bye'});}catch(_){}
  try{await sample(s,true);}catch(_){}
  if(lastCompleted)el('previousSummary').value=lastCompleted;
  lastCompleted=summary(s);el('summary').value=lastCompleted;
  if(s.frameCallback!=null&&el('video').cancelVideoFrameCallback)el('video').cancelVideoFrameCallback(s.frameCallback);
  if(s.pc){s.pc.onconnectionstatechange=null;s.pc.onicecandidate=null;s.pc.ontrack=null;s.pc.close();}
  s.ws?.close(1000,'Session stopped');
  if(el('video').srcObject)el('video').srcObject.getTracks().forEach(t=>t.stop());
  el('video').srcObject=null;active=null;
  el('session').disabled=false;el('connect').disabled=false;el('disconnect').disabled=true;status(reason);
}
el('connect').onclick=connect;
el('disconnect').onclick=()=>{if(active)stop(active);};
el('play').onclick=()=>el('video').play().catch(error=>status(error.message));
window.addEventListener('pagehide',()=>{if(active)stop(active,'Page hidden/unloaded');});

// QR links prefill only. No automatic connection or persistent code storage.
const pairingLink=Pairing.query(window.location.search);
if(pairingLink.code)el('session').value=pairingLink.code;
if(pairingLink.error)status(pairingLink.error);
el('video').onplaying=()=>{if(active&&!active.stopping){active.streaming=true;status('Streaming');}};
function addressFamily(address){return typeof address!=='string'||!address?'N/A':address.includes(':')?'IPv6':/^\d+(\.\d+){3}$/.test(address)?'IPv4':'N/A / obfuscated';}
