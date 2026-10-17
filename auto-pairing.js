'use strict';
// Waiting registration and UI timers only; the media/signaling implementation stays shared.
const PAIRING_ROTATION_MS=300000;
const PAIRING_INPUT_DEBOUNCE_MS=250;
let inputTimer=null,recoveryTimer=null,pageActive=true;
const remoteEntry=RemoteLink.entry(window.location.search,window.location.hash);
const remoteMode=remoteEntry.mode==='remote';
const REMOTE_RESOLVE_URL='https://realtime-relay-k28l.onrender.com/remote/resolve';
let lookupId=0,lookupAbort=null,lookupTimer=null;
const mobilePresentation=MobileReceiver.create({search:window.location.search,hash:window.location.hash,
  document,element:el('receiver'),node:el,changeView:receiverView,start:()=>startReceiverIntent(),invalid:remoteMode?message=>remoteScreen(message,false):null,
  resume:()=>{if(remoteMode)resolveRemote();else connect('create');}});
function startReceiverIntent(){
  if(!pageActive)return;
  el('remotePanel').hidden=true;el('connectingMessage').hidden=false;
  if(remoteMode)resolveRemote();else if(pairingLink.code){el('session').value=pairingLink.code;connect('join');}else connect('create');
}
function remoteScreen(message,retry=true){
  receiverView('CONNECTING');
  el('remotePanel').hidden=false;el('connectingMessage').hidden=true;
  el('remoteMessage').textContent=message;el('remoteRetry').hidden=!retry;
  el('disconnect').hidden=!active;el('play').hidden=true;
}
async function resolveRemote(){
  if(!mobilePresentation.allowed()||!remoteMode||!pageActive||lookupAbort||active)return;
  if(remoteEntry.error){remoteScreen(remoteEntry.error,false);return;}
  const id=++lookupId,abort=new AbortController();lookupAbort=abort;
  const timeout=setTimeout(()=>abort.abort(),15000);
  lookupTimer=timeout;
  remoteScreen('Connecting to phone...',false);
  try{
    const response=await fetch(REMOTE_RESOLVE_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:remoteEntry.token}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:abort.signal});
    const result=await response.json();
    if(!pageActive||id!==lookupId)return;
    if(!response.ok||result.status!=='available'||!Pairing.normalize(result.session)){
      remoteScreen('This phone is not currently available for screen sharing. Open the sharing app on the phone and try again.');return;
    }
    el('session').value=Pairing.normalize(result.session);
    await connect('join');
    if(pageActive&&id===lookupId){
      if(active)remoteScreen('Waiting for approval on the phone...',false);
      else remoteScreen('This phone is not currently available for screen sharing. Open the sharing app on the phone and try again.');
    }
  }catch{if(pageActive&&id===lookupId)remoteScreen('This phone is not currently available for screen sharing. Open the sharing app on the phone and try again.');}
  finally{clearTimeout(timeout);if(id===lookupId){lookupAbort=null;lookupTimer=null;}}
}
function clearPairingInput(){clearTimeout(inputTimer);inputTimer=null;}
function editablePairing(){return mobilePresentation.allowed()&&!remoteMode&&(!active||['creating','waiting'].includes(active.phase)&&active.intent==='create');}
function showPairingError(text){el('pairingError').textContent=text;el('codeError').textContent=text;}
function joinAutomatically(code){
  clearPairingInput();
  if(!Pairing.normalize(code)||!editablePairing())return;
  clearTimeout(recoveryTimer);recoveryTimer=null;
  el('session').value=code;showPairingError('');
  closeWorkflow();connect('join');
}
function pairingInput(){
  clearPairingInput();
  if(!editablePairing())return;
  const typed=el('session').value.trim();
  const raw=typed.toUpperCase();
  if(typed.length>6||!/^[A-Za-z2-9]*$/.test(typed)||[...raw].some(c=>!Pairing.ALPHABET.includes(c))){showPairingError('Invalid pairing code');return;}
  el('session').value=raw;showPairingError('');
  const code=Pairing.normalize(raw);
  if(code)inputTimer=setTimeout(()=>{inputTimer=null;joinAutomatically(code);},PAIRING_INPUT_DEBOUNCE_MS);
}
onPairingState=(s,phase)=>{
  clearTimeout(s.rotationTimer);
  const waiting=s.intent==='create'&&['creating','waiting'].includes(phase);
  el('session').disabled=!waiting;el('scan').disabled=!waiting;
  el('disconnect').hidden=waiting;
  if(phase==='waiting'){
    if(s.intent==='create'){
      status('Waiting for another device...');
      s.rotationTimer=setTimeout(()=>{
        if(pageActive&&active===s&&s.phase==='waiting'&&!s.streaming){clearPairingInput();connect('create');}
      },PAIRING_ROTATION_MS);
    }
  }else if(phase==='connecting'||phase==='connected'){clearPairingInput();showPairingError('');}
};
onPairingEnded=reason=>{
  closeWorkflow();
  clearPairingInput();clearTimeout(recoveryTimer);
  el('session').value='';showPairingError(reason);
  if(remoteMode){remoteScreen('Screen sharing ended. Try again when the phone is waiting.');return;}
  if(mobilePresentation.ended(reason||'Screen sharing ended.'))return;
  if(pageActive)recoveryTimer=setTimeout(()=>{recoveryTimer=null;if(pageActive&&!active)connect('create');},1000);
};
el('session').oninput=event=>{if(event?.isComposing){clearPairingInput();return;}pairingInput();};
el('session').oncompositionend=pairingInput;
el('session').onpaste=event=>{
  const code=Pairing.normalize(event.clipboardData?.getData('text'));
  if(code&&editablePairing()){
    event.preventDefault();el('session').value=code;pairingInput();
  }
};
const startPairingScan=el('scan').onclick;
el('scan').onclick=()=>{
  clearPairingInput();clearTimeout(recoveryTimer);recoveryTimer=null;
  if(!mobilePresentation.allowed())return;
  if(!active)connect('create');
  startPairingScan();
};
// Native camera implementation is unchanged. Only successful parsing now enters JOIN directly.
// CameraScanner stores callbacks on its instance; replace at the orchestration boundary.
scanner.onPayload=payload=>{
  el('scanPanel').hidden=true;
  const code=Pairing.parseQr(payload);
  if(code)joinAutomatically(code);else showPairingError('QR code is not a valid pairing code.');
};
window.addEventListener('pagehide',()=>{
  lookupId++;lookupAbort?.abort();lookupAbort=null;
  clearTimeout(lookupTimer);lookupTimer=null;
  pageActive=false;mobilePresentation.hide();clearPairingInput();clearTimeout(recoveryTimer);recoveryTimer=null;
});
window.addEventListener('pageshow',()=>{if(!pageActive){pageActive=true;if(!active)mobilePresentation.restore();}});
el('remoteRetry').onclick=()=>mobilePresentation.retry(resolveRemote);
mobilePresentation.startup();
// URL routes are exclusive; only manual six-character input needs a debounce.

// Presentation-only panels: existing auto-CREATE/JOIN and camera decoder stay shared.
var workflowOrigin=null;
function closeWorkflow(){
  clearPairingInput();scanner.stop();
  for(const id of ['scanPanel','codePanel','showPanel']){el(id).hidden=true;el(id).setAttribute('aria-hidden','true');}
  el('receiver').dataset.panel='';
  el('workflowHome').hidden=false;el('diagnostics').hidden=false;
  document.body?.classList.remove('workflow-open');
  const origin=workflowOrigin;workflowOrigin=null;origin?.focus?.();
}
function openWorkflow(id,origin){
  closeWorkflow();workflowOrigin=origin;
  el('workflowHome').hidden=true;el('diagnostics').hidden=true;
  el(id).hidden=false;el(id).setAttribute('aria-hidden','false');el('receiver').dataset.panel=id;
  document.body?.classList.add('workflow-open');
  (id==='codePanel'?el('session'):el(id==='scanPanel'?'cancelScan':'closeShow')).focus?.();
}
const workflowScan=el('scan').onclick;
el('scan').onclick=()=>{if(!editablePairing())return;openWorkflow('scanPanel',el('scan'));el('scanError').textContent='';workflowScan();};
el('enterCode').onclick=()=>{if(editablePairing())openWorkflow('codePanel',el('enterCode'));};
el('showCode').onclick=()=>{if(editablePairing())openWorkflow('showPanel',el('showCode'));};
for(const id of ['cancelScan','closeCode','closeShow'])el(id).onclick=closeWorkflow;
el('scanEnter').onclick=()=>openWorkflow('codePanel',el('enterCode'));
el('codeScan').onclick=()=>el('scan').onclick();
el('codeConnect').onclick=()=>{const code=Pairing.normalize(el('session').value);if(code)joinAutomatically(code);else el('codeError').textContent='Invalid pairing code';};
const workflowPayload=scanner.onPayload;
scanner.onPayload=payload=>{closeWorkflow();workflowPayload(payload);};
scanner.onError=message=>{scanner.stop();el('scanError').textContent=message;};
document.addEventListener('keydown',event=>{
  if(!el('receiver').dataset.panel)return;
  if(event.key==='Escape'){event.preventDefault();closeWorkflow();return;}
  if(event.key==='Tab'){
    const panel=el(el('receiver').dataset.panel),items=panel.querySelectorAll?.('button:not([disabled]),input:not([disabled])');
    if(!items?.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
window.addEventListener('pagehide',closeWorkflow);
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeWorkflow();});
