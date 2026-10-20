/* Isolated request adapter: mirrors the proven receiver answer/early-ICE pipeline.
 * Legacy webrtc-receiver.js and its startup/remote-link behavior are untouched. */
(function(root){
 'use strict';
 const RTC_CONFIG={iceServers:[{urls:'stun:stun.l.google.com:19302'}],iceTransportPolicy:'all'};
 function create(options,{video,Peer=globalThis.RTCPeerConnection,Socket=globalThis.WebSocket,Stream=globalThis.MediaStream,later=setTimeout,cancel=clearTimeout}={}){
  let stopped=false,registered=false,present=false,offered=false,remote=false,queue=[],local=[],chain=Promise.resolve(),direct=null,grace=null,auth=null,framed=false;
  const current=()=>!stopped&&options.current();
  let pc,ws;
  const timers=()=>{cancel(auth);cancel(direct);cancel(grace);};
  function stop(){if(stopped)return;stopped=true;timers();
   if(ws){if(registered&&ws.readyState===1)try{ws.send(JSON.stringify({type:'bye'}));}catch{}ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;try{ws.close();}catch{}}
   if(pc){pc.ontrack=pc.onicecandidate=pc.onconnectionstatechange=pc.oniceconnectionstatechange=null;pc.close();}
   if(video){video.onloadeddata=video.onplaying=null;video.srcObject=null;}
   queue=[];local=[];
  }
  function fail(){if(!current())return;stop();options.ended();}
  function send(message){if(!current()||!registered||ws.readyState!==1)throw Error('Unavailable');const text=JSON.stringify(message);if(new TextEncoder().encode(text).length>=65536)throw Error('Invalid');ws.send(text);}
  function firstFrame(){if(current()&&!framed&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0){framed=true;cancel(direct);options.frame();}}
  try{
   pc=new Peer(RTC_CONFIG);
   pc.onicecandidate=e=>{if(!current()||!e.candidate)return;try{const candidate=e.candidate.toJSON();if(registered)send({type:'ice',candidate});else{if(local.length>=256)throw Error();local.push(candidate);}}catch{fail();}};
   pc.ontrack=e=>{if(!current()||e.track.kind!=='video')return;video.srcObject=e.streams[0]||new Stream([e.track]);video.onloadeddata=video.onplaying=firstFrame;e.track.onended=fail;Promise.resolve(video.play()).catch(()=>{});};
   const network=()=>{if(!current())return;const states=[pc.connectionState,pc.iceConnectionState];
    if(states.some(s=>s==='failed'||s==='closed')){fail();return;}
    if(states.includes('disconnected')){if(grace===null)grace=later(fail,4000);return;}
    if(states.some(s=>s==='connected'||s==='completed')){cancel(grace);grace=null;options.connected();}
   };
   pc.onconnectionstatechange=pc.oniceconnectionstatechange=network;
   ws=new Socket(options.wsBase+'?session='+encodeURIComponent(options.session.code)+'&role=receiver&intent=join');
   auth=later(fail,15000);
   ws.onopen=()=>{if(!current())return;try{ws.send(JSON.stringify({type:'request-auth',requestId:options.requestId,secret:options.claim}));}catch{fail();}};
   async function message(m){
    if(!current())return;
    if(m.type==='registration'){
     if(registered||m.status!=='ok'||m.role!=='receiver'||m.intent!=='join')throw Error();registered=true;cancel(auth);options.admitted();
     for(const candidate of local)send({type:'ice',candidate});local=[];return;
    }
    if(!registered)throw Error();
    if(m.type==='peer-present'){present=true;return;}
    if(m.type==='bye'||m.type==='peer-left'){fail();return;}
    if(m.type==='ready'){send({type:'ready'});return;}
    if(m.type==='ice'){
     const c=m.candidate;if(!c||typeof c.candidate!=='string'||c.candidate.length>8192||!Number.isInteger(c.sdpMLineIndex)||(c.sdpMid!==null&&typeof c.sdpMid!=='string'))throw Error();
     if(remote)await pc.addIceCandidate(c);else{if(queue.length>=256)throw Error();queue.push(c);}return;
    }
    if(m.type!=='offer'||!present||offered||typeof m.sdp!=='string')throw Error();offered=true;direct=later(fail,45000);
    await pc.setRemoteDescription({type:'offer',sdp:m.sdp});if(!current())return;remote=true;
    for(const c of queue){await pc.addIceCandidate(c);if(!current())return;}queue=[];
    const answer=await pc.createAnswer();if(!current())return;await pc.setLocalDescription(answer);if(!current())return;
    send({type:'answer',sdp:pc.localDescription.sdp});
   }
   ws.onmessage=e=>{if(!current())return;if(typeof e.data!=='string'||new TextEncoder().encode(e.data).length>=65536){fail();return;}
    chain=chain.then(()=>{if(current())return message(JSON.parse(e.data));}).catch(fail);
   };
   ws.onerror=ws.onclose=fail;
  }catch{stop();throw Error('Receiver unavailable');}
  return {stop};
 }
 root.ConnectionRequestMedia={RTC_CONFIG,create};
})(typeof module!=='undefined'&&module.exports?module.exports:globalThis);
