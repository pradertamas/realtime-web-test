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
  if(typed.length>6||!/^[A-Za-z2-9]*$/.test(typed)||[...raw].some(c=>!Pairing.ALPHABET.includes(c))){showPairingError('Invalid connection code');return;}
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
  if(code)joinAutomatically(code);else showPairingError('QR code is not a valid connection code.');
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

// Presentation only: reuse the existing scanner, code input and CREATE registration.
function closeWorkflow(){
  clearPairingInput();scanner.stop();
  for(const id of ['scanPanel','showPanel']){el(id).hidden=true;el(id).setAttribute('aria-hidden','true');}
  el('receiver').dataset.panel='';
  for(const id of ['status','pairingError'])el('messageParking').appendChild?.(el(id));
  el('scan').setAttribute('aria-pressed','false');el('chooseShare').setAttribute('aria-pressed','false');
}
function selectStartPath(path){
  if(!editablePairing())return;
  closeWorkflow();
  if(!path)return;
  const panel=path==='connect'?'scanPanel':'showPanel';
  el(panel).hidden=false;el(panel).setAttribute('aria-hidden','false');el('receiver').dataset.panel=panel;
  el(path==='connect'?'scan':'chooseShare').setAttribute('aria-pressed','true');
  for(const id of ['status','pairingError'])el(path==='connect'?'connectMessages':'shareMessages').appendChild?.(el(id));
  if(path==='connect'){el('scanError').textContent='';scanner.start();}
  el(path==='connect'?'cancelScan':'closeShow').focus?.();
  el(panel).scrollIntoView?.({block:'start'});
}
el('scan').onclick=()=>selectStartPath('connect');
el('chooseShare').onclick=()=>selectStartPath('share');
for(const id of ['cancelScan','closeShow'])el(id).onclick=()=>{closeWorkflow();el('scan').focus?.();};
el('codeConnect').onclick=()=>{const code=Pairing.normalize(el('session').value);if(code)joinAutomatically(code);else el('codeError').textContent='Invalid connection code';};
scanner.onPayload=payload=>{
  scanner.stop();const code=Pairing.parseQr(payload);
  if(code)joinAutomatically(code);else{el('scanError').textContent='QR code is not a valid connection code.';el('scanPanel').hidden=false;}
};
scanner.onError=message=>{scanner.stop();el('scanError').textContent=message;};
function currentShareCode(){return active?.intent==='create'&&active.phase==='waiting'?Pairing.normalize(el('createdCode').textContent):null;}
el('copyCode').onclick=async()=>{
  const code=currentShareCode();if(!code)return;
  try{await navigator.clipboard.writeText(code);el('shareFeedback').textContent='Code copied.';}
  catch{el('shareFeedback').textContent='Copy is unavailable. Select the code to copy it.';}
};
el('shareCode').hidden=typeof globalThis.navigator?.share!=='function';
el('shareCode').onclick=async()=>{
  const code=currentShareCode();if(!code)return;
  try{await navigator.share({title:'Screen Share',text:code});}
  catch(error){if(error.name!=='AbortError')el('shareFeedback').textContent='Sharing is unavailable. Copy the code instead.';}
};
window.addEventListener('pagehide',closeWorkflow);
document.addEventListener('visibilitychange',()=>{if(document.hidden)closeWorkflow();});
