'use strict';
// Waiting registration and UI timers only; the media/signaling implementation stays shared.
const PAIRING_ROTATION_MS=300000;
const PAIRING_INPUT_DEBOUNCE_MS=250;
let inputTimer=null,recoveryTimer=null,pageActive=true;
function clearPairingInput(){clearTimeout(inputTimer);inputTimer=null;}
function editablePairing(){return !active||['creating','waiting'].includes(active.phase)&&active.intent==='create';}
function showPairingError(text){el('pairingError').textContent=text;}
function joinAutomatically(code){
  clearPairingInput();
  if(!Pairing.normalize(code)||!editablePairing())return;
  clearTimeout(recoveryTimer);recoveryTimer=null;
  el('session').value=code;showPairingError('');
  connect('join');
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
  clearPairingInput();clearTimeout(recoveryTimer);
  el('session').value='';showPairingError(reason);
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
  pageActive=false;clearPairingInput();clearTimeout(recoveryTimer);recoveryTimer=null;
});
window.addEventListener('pageshow',()=>{if(!pageActive){pageActive=true;if(!active)connect('create');}});
connect('create');
// With no Connect button, opening an explicit valid pairing link uses the same
// debounced JOIN as pasting its code. Plain page loads stay on their own CREATE.
if(pairingLink.code)pairingInput();
