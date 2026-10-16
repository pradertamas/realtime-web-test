'use strict';
// Android-authoritative config is validated before either peer negotiates media.
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
  if (['offer','answer','ice','bye'].includes(m.type)) {m.configId=s.configId;m.mode=s.mode;}
  const raw=JSON.stringify(m);
  if(new TextEncoder().encode(raw).length>=65536) throw Error('Signaling payload exceeds 64 KiB');
  s.ws.send(raw);
}
function frameLoop(s) {
  const video=el('video');
  if(!video.requestVideoFrameCallback) return;
  s.frameCallback=video.requestVideoFrameCallback((now,m)=>{
    if(active!==s || s.stopping) return;
    observe(s.timing.captureReceive,number(m.receiveTime)&&number(m.captureTime)?m.receiveTime-m.captureTime:null);
    observe(s.timing.receiveDisplay,number(m.expectedDisplayTime)&&number(m.receiveTime)?m.expectedDisplayTime-m.receiveTime:null);
    observe(s.timing.captureDisplay,number(m.expectedDisplayTime)&&number(m.captureTime)?m.expectedDisplayTime-m.captureTime:null);
    s.timestamps={captureTime:m.captureTime,receiveTime:m.receiveTime,expectedDisplayTime:m.expectedDisplayTime,presentationTime:m.presentationTime};
    frameLoop(s);
  });
}
async function signal(s,m) {
  if(active!==s || s.stopping) return;
  if(m.type==='ready') {send(s,{type:'ready',version:1});return;}
  if(m.type==='bye') {await stop(s,'Android stopped');return;}
  if(m.type==='session-config') {
    const config=NetworkTest.configuration(m);
    if(s.configId) {
      if(m.configId!==s.configId || JSON.stringify(m)!==s.configSignature) throw Error('Configuration changed mid-session');
    } else {
      s.configId=m.configId;s.mode=m.mode;s.price=m.usdPerGb;s.configSignature=JSON.stringify(m);
      s.pc=new RTCPeerConnection(config);
      bindPeer(s);
      el('mode').textContent='Connection mode: '+(s.mode==='AUTO'?'AUTO / P2P preferred':'FORCE TURN relay')+' / policy '+config.iceTransportPolicy;
      s.expiryTimer=setTimeout(()=>stop(s,'Temporary credentials nearing expiry; start a fresh session'),Math.max(1,m.expiresAt-Date.now()-30000));
    }
    send(s,{type:'config-ack',version:1,configId:s.configId,mode:s.mode});
    return;
  }
  if(['offer','answer','ice'].includes(m.type) && (!s.pc || m.configId!==s.configId || m.mode!==s.mode)) throw Error('Missing/mismatched mode configuration; update both peers');
  if(m.type==='offer') {
    if(s.offered) return;
    if(typeof m.sdp!=='string') throw Error('Invalid offer');
    s.offered=true;
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
    e.track.onended=()=>stop(s,'Video track ended');
  };
  pc.onconnectionstatechange=()=>{
    if(active!==s || s.stopping) return;
    status('Peer: '+pc.connectionState+' / ICE: '+pc.iceConnectionState);
    if(pc.connectionState==='failed') stop(s,'Peer failed; reconnect both endpoints');
  };
}
async function connect() {
  if(active) return;
  const session=el('session').value.trim();
  if(!/^[A-Za-z0-9_-]{6,64}$/.test(session)) {status('Use 6–64 ASCII letters, digits, underscores or hyphens.');return;}
  let s;
  try {
    s={pc:null,configId:null,mode:null,price:null,relayConfirmed:false,relayEverConfirmed:false,nonRelayMediaObserved:false,session,start:performance.now(),last:null,firstMedia:null,latest:{},peak:0,stopping:false,offered:false,pendingIce:[],chain:Promise.resolve(),statsPending:false,
      timing:{captureReceive:accumulator(),receiveDisplay:accumulator(),captureDisplay:accumulator()},rtt:accumulator(),timestamps:{}};
    active=s;
    el('mode').textContent='Connection mode: waiting for Android configuration';el('turnProof').textContent='TURN relay confirmed: NO';
    el('summary').value='Session running; disconnect to retain summary.';
    el('session').disabled=true;el('connect').disabled=true;el('disconnect').disabled=false;
    for(const id of ['connection','videoMetrics','bandwidth','latency','economics']) list(id,{'Status':'Waiting for media'});
    const ws=new WebSocket(SIGNALING_URL+'?session='+encodeURIComponent(session)+'&role=receiver');s.ws=ws;
    ws.onopen=()=>{if(active!==s||s.stopping)return;status('Signaling open; waiting for Android mode configuration');send(s,{type:'ready',version:1});
      s.readyTimer=setInterval(()=>{if(!s.offered)send(s,{type:'ready',version:1});},1000);};
    ws.onmessage=e=>{
      if(active!==s||s.stopping||typeof e.data!=='string')return;
      if(new TextEncoder().encode(e.data).length>=65536)return;
      // Serialize SDP and trickle ICE async operations; ICE may arrive before setRemoteDescription completes.
      s.chain=s.chain.then(()=>signal(s,JSON.parse(e.data))).catch(error=>stop(s,'Signaling error: '+error.message));
    };
    ws.onerror=()=>{if(active===s&&!s.stopping)status('WebSocket error; check relay availability / duplicate role');};
    ws.onclose=e=>{if(active===s&&!s.stopping)stop(s,'Signaling closed ('+e.code+')');};
    s.statsTimer=setInterval(()=>sample(s).catch(error=>status('Stats: '+error.message)),1000);
    frameLoop(s);
  }catch(error) {if(s)await stop(s,error.message);else status(error.message);}
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
    s.relayConfirmed=NetworkTest.relayPair(local?.candidateType,remote?.candidateType,pair?.state);
    if(s.relayConfirmed)s.relayEverConfirmed=true;
    if(number(bytes)&&bytes>(s.last?.bytes??0)&&!s.relayConfirmed)s.nonRelayMediaObserved=true;
    el('turnProof').textContent='TURN relay confirmed: '+(s.relayConfirmed?'YES':s.mode==='FORCE_TURN'?'NO / FAIL / NOT RELAY (or not yet selected)':'NO');
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
      family:`${NetworkTest.addressFamily(local?.address??local?.ip)} / ${NetworkTest.addressFamily(remote?.address??remote?.ip)}`};
    list('connection',{'peerConnectionState':s.pc.connectionState,'iceConnectionState':s.pc.iceConnectionState,'signalingState':s.pc.signalingState,
      'Selected local / remote candidate':s.latest.candidate,'Protocol':s.latest.protocol,'Relay protocol local / remote':s.latest.relayProtocol,
      'Address family local / remote':s.latest.family,'Selected pair state':pair?.state,'Current RTT':fmt(s.rtt.current,' ms')});
    const gb=NetworkTest.gbPerHour(bytes,elapsed),cost=NetworkTest.costPerHour(gb,s.price,s.relayConfirmed&&s.relayEverConfirmed&&!s.nonRelayMediaObserved);
    list('economics',{'Measured RTP GB/hour':number(gb)?gb.toFixed(6):NA,'Configured cost assumption USD/GB':String(s.price??NA),
      'Estimated relay USD/hour':number(cost)?cost.toFixed(4):NA,'TURN cost test eligible':cost===null?'NO / mixed, missing or non-relay path':'YES (sampled pair evidence)'});
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
  const gb=NetworkTest.gbPerHour(m.bytes,m.duration),cost=NetworkTest.costPerHour(gb,s.price,s.relayConfirmed&&s.relayEverConfirmed&&!s.nonRelayMediaObserved);
  return Object.entries({'Session':s.session,'Mode':s.mode??NA,'TURN relay confirmed':s.relayConfirmed?'YES':'NO',
    'TURN cost test eligible':cost===null?'NO / NOT RELAY, mixed path or missing stats':'YES (sampled pair evidence)',
    'Measured RTP GB/hour (decimal 1 GB = 1,000,000,000 bytes)':number(gb)?gb.toFixed(6):NA,'Configured cost assumption USD/GB':String(s.price??NA),
    'Estimated relay USD/hour':number(cost)?cost.toFixed(4):NA,'Estimate limits':'Excludes protocol/provider billing differences; receiver RTP only, do not add sender bytes.',
    'Relay protocol local / remote':m.relayProtocol??NA,'Address family local / remote':m.family??NA,
    'Duration':fmt(m.duration,' s'),'Bytes received':m.bytes??NA,'Current bitrate':fmt(m.bitrate,' bps'),'Average bitrate':fmt(m.averageBitrate,' bps'),
    'Peak bitrate (~1 s)':fmt(s.peak,' bps'),'Frames decoded':m.frames??NA,'Frames dropped':m.dropped??NA,'Average decoded FPS (full session)':fmt(m.averageFps),
    'Codec':m.codec??NA,'Resolution':m.resolution??NA,'Selected local / remote candidate':m.candidate??NA,'Protocol':m.protocol??NA,
    'Average RTT':fmt(s.rtt.count?s.rtt.sum/s.rtt.count:null,' ms'),'Maximum RTT':fmt(s.rtt.max,' ms'),
    'Estimated capture → receive':timingValues(s.timing.captureReceive),'Estimated receive → expected display':timingValues(s.timing.receiveDisplay),
    'Estimated capture → expected display':timingValues(s.timing.captureDisplay)}).map(([k,v])=>k+': '+v).join('\n');
}
async function stop(s,reason='Disconnected') {
  if(active!==s||s.stopping)return;
  s.stopping=true;clearInterval(s.readyTimer);clearInterval(s.statsTimer);clearTimeout(s.expiryTimer);
  try{send(s,{type:'bye'});}catch(_){}
  try{await sample(s,true);}catch(_){}
  if(lastCompleted)el('previousSummary').value=lastCompleted;
  lastCompleted=summary(s);el('summary').value=lastCompleted;
  if(s.frameCallback!=null&&el('video').cancelVideoFrameCallback)el('video').cancelVideoFrameCallback(s.frameCallback);
  if(s.pc){s.pc.onconnectionstatechange=null;s.pc.onicecandidate=null;s.pc.ontrack=null;s.pc.close();}
  s.configSignature=null;s.ws?.close(1000,'Session stopped');
  if(el('video').srcObject)el('video').srcObject.getTracks().forEach(t=>t.stop());
  el('video').srcObject=null;active=null;
  el('session').disabled=false;el('connect').disabled=false;el('disconnect').disabled=true;status(reason+' — summary retained');
}
el('connect').onclick=connect;
el('disconnect').onclick=()=>{if(active)stop(active);};
el('play').onclick=()=>el('video').play().catch(error=>status(error.message));
window.addEventListener('pagehide',()=>{if(active)stop(active,'Page hidden/unloaded');});
