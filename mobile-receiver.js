'use strict';
/* Presentation only. No WebSocket, fetch, token storage, timers or media pipeline. */
(function(root){
 function route(search,hash){
  const params=new URLSearchParams(search),modes=params.getAll('mode');
  const mobile=modes.includes('mobile');
  if(modes.length>1||modes.length===1&&modes[0]!=='mobile')return {mobile,error:'Invalid receiver mode.'};
  const remote=RemoteLink.entry(search,hash),session=Pairing.query(search);
  if(remote.error)return {mobile,error:remote.error};
  if(session.error)return {mobile,error:session.error};
  return {mobile,intent:remote.mode==='remote'?'remote':session.code?'join':'create',code:session.code};
 }
 function create({search,hash,document,element,node,changeView,start,invalid,resume}){
  const entry=route(search,hash);
  let approved=!entry.mobile&&!entry.error,started=false,live=true,presentationEpoch=0;
  const show=(view,message)=>{changeView(view);if(message)node(view==='MOBILE_ENDED'?'mobileEndMessage':'mobileMessage').textContent=message;};
  function fullscreenState(){
   element.dataset.fullscreen=document.fullscreenElement===element?'active':'viewport';
   node('enterFullscreen').hidden=!entry.mobile||!approved||document.fullscreenElement===element;
   node('exitFullscreen').hidden=!entry.mobile||document.fullscreenElement!==element;
  }
  function unavailable(){if(live)node('fullscreenNotice').textContent='Full screen is not available in this browser.';}
  function requestFullscreen(){
   if(!entry.mobile||document.fullscreenElement===element)return;
   const epoch=presentationEpoch;
   if(typeof element.requestFullscreen!=='function'||document.fullscreenEnabled===false){unavailable();fullscreenState();return;}
   try{
    // Intentionally synchronous call from the button gesture, before starting any receiver work.
    const request=element.requestFullscreen();
    Promise.resolve(request).then(()=>{if(live&&epoch===presentationEpoch){node('fullscreenNotice').textContent='';fullscreenState();}},()=>{if(live&&epoch===presentationEpoch){unavailable();fullscreenState();}});
   }catch{unavailable();fullscreenState();}
  }
  function receive(){
   if(!live||entry.error||started)return;
   requestFullscreen();approved=true;started=true;fullscreenState();start();
  }
  function ended(message='Screen sharing ended.'){
   if(!entry.mobile)return false;
   started=false;show('MOBILE_ENDED',message);fullscreenState();return true;
  }
  function retry(action){
   if(!live||!approved||entry.error)return;
   requestFullscreen();started=true;action();
  }
  function startup(){
   element.dataset.mobile=String(entry.mobile);
   if(entry.error){if(!entry.mobile&&invalid){invalid(entry.error);return;}node('mobileReceive').hidden=true;node('mobileCancel').hidden=true;show('MOBILE_CONFIRM',entry.error);return;}
   if(entry.mobile){show('MOBILE_CONFIRM');node('mobileMessage').textContent='The incoming screen will open in full screen.';fullscreenState();}
   else{started=true;start();}
  }
  node('mobileReceive').onclick=receive;
  node('mobileAgain').onclick=receive;
  node('mobileCancel').onclick=()=>{
   if(started||!live)return;
   approved=false;show('MOBILE_CONFIRM','Reception cancelled.');node('mobileReceive').hidden=true;node('mobileCancel').hidden=true;
  };
  node('enterFullscreen').onclick=()=>{if(approved&&live)requestFullscreen();};
  node('exitFullscreen').onclick=()=>{if(document.fullscreenElement===element)try{Promise.resolve(document.exitFullscreen()).catch(()=>{});}catch{}};
  document.addEventListener('fullscreenchange',()=>{if(live)fullscreenState();});
  document.addEventListener('fullscreenerror',()=>{if(live&&entry.mobile){unavailable();fullscreenState();}});
  return {entry,startup,ended,retry,allowed:()=>approved&&live&&!entry.error,
   hide(){live=false;presentationEpoch++;started=false;},
   restore(){live=true;presentationEpoch++;if(entry.mobile){approved=false;started=false;node('mobileReceive').hidden=false;node('mobileCancel').hidden=false;startup();}else if(!entry.error){approved=true;started=true;(resume||start)();}}};
 }
 root.MobileReceiver={route,create};
})(typeof module!=='undefined'&&module.exports?module.exports:globalThis);
