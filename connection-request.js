/* Request-first recipient only. No legacy code/remote-link startup and no secret diagnostics. */
(function(root){
 'use strict';
 const API='https://realtime-relay-k28l.onrender.com', WS='wss://realtime-relay-k28l.onrender.com/ws';
 const MAX_FRAGMENT=256, MAX_RESPONSE=16384;
 // UI retry gate only: preserve the relay's normal 60s value; never wait over five minutes.
 const MAX_RETRY_SECONDS=300;
 function canonical(value,bytes){
  if(typeof value!=='string'||value.length!==Math.ceil(bytes*4/3)||!/^[A-Za-z0-9_-]+$/.test(value))return false;
  try{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return raw.length===bytes&&btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')===value;}catch{return false;}
 }
 function parse(hash){
  if(typeof hash!=='string'||hash.length>MAX_FRAGMENT||!hash.startsWith('#')||hash.includes('%'))return null;
  const fields=hash.slice(1).split('&'), m={};
  for(const field of fields){const pair=field.split('=');if(pair.length!==2||!['v','r','c','i'].includes(pair[0])||Object.hasOwn(m,pair[0]))return null;m[pair[0]]=pair[1];}
  return fields.length===4&&m.v==='1'&&canonical(m.r,16)&&canonical(m.c,16)&&['send','receive'].includes(m.i)?{id:m.r,capability:m.c,role:m.i}:null;
 }
 function claim(crypto){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 class SafeError extends Error{constructor(kind,wait=0){super(kind);this.kind=kind;this.wait=wait;}}
 class Http {
  constructor(fetcher=globalThis.fetch,base=API){this.fetcher=fetcher;this.base=base;}
  async call(id,operation,secret,body,signal){
   const controller=new AbortController(),abort=()=>controller.abort();
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const timer=setTimeout(abort,15000);
   try{return await this.request(id,operation,secret,body,controller.signal);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async request(id,operation,secret,body,signal){
   if(!canonical(id,16)||![16,32].some(n=>canonical(secret,n))||!['status','accept','participant-state','withdraw'].includes(operation))throw new SafeError('invalid');
   let response;
   try{response=await this.fetcher(this.base+'/connection-requests/'+id+'/'+operation,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+secret,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal});}catch{throw new SafeError('network');}
   const retry=response.headers.get('Retry-After');
   const seconds=retry&&/^\d+$/.test(retry)?Number(retry):retry?Math.max(0,(Date.parse(retry)-Date.now())/1000):60;
   if(response.status===429)throw new SafeError('rate',Math.min(MAX_RETRY_SECONDS,Math.max(1,Number.isFinite(seconds)?seconds:60))*1000);
   if(!response.ok)throw new SafeError(({400:'invalid',404:'unavailable',409:'conflict',410:'expired'})[response.status]||'service');
   if(!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new SafeError('invalid');
   const reader=response.body?.getReader();let text='';
   try{
    if(!reader)throw new SafeError('invalid');
    const decoder=new TextDecoder('utf-8',{fatal:true});let size=0;
    while(true){let part;try{part=await reader.read();}catch{throw new SafeError('network');}const {done,value}=part;if(done)break;size+=value.length;if(size>MAX_RESPONSE){await reader.cancel();throw new SafeError('invalid');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
    const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw new SafeError('invalid');return data;
   }catch(error){throw error instanceof SafeError?error:new SafeError('invalid');}finally{reader?.releaseLock();}
  }
 }
 function assignment(value){return value&&Object.keys(value).length===3&&value.role==='receiver'&&value.intent==='join'&&/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(value.code);}
 class Client {
  constructor({http=new Http(),storage,crypto=globalThis.crypto,media,view=()=>{},later=setTimeout,cancel=clearTimeout,clock=()=>performance.now()}){Object.assign(this,{http,storage,crypto,media,view,later,cancel,clock});this.current=null;}
  owns(a){return this.current===a&&!a.closed;}
  show(a,state,message,retry=false){if(this.owns(a)){a.ui=state;this.view({state,message,retry,accept:state==='PREVIEW',stop:!!a.winner||!!a.media});}}
  key(a){return 'screen-share-request-v1:'+a.link.id;}
  save(a,ended=false){try{this.storage.setItem(this.key(a),JSON.stringify({claim:a.claim,ended}));}catch{throw new SafeError('storage');}}
  validate(a,data,winner=false){
   if(data.requestId!==a.link.id||data.initiatorRole!==a.link.role||!['WAITING','ACCEPTED','CONNECTING','CONNECTED','CANCELED','EXPIRED','FAILED'].includes(data.state)||!Number.isFinite(Date.parse(data.serverNow))||!Number.isFinite(Date.parse(data.expiresAt)))throw new SafeError('invalid');
   if(winner&&['ACCEPTED','CONNECTING'].includes(data.state)&&(!Number.isFinite(Date.parse(data.connectBy))||Date.parse(data.connectBy)<=Date.parse(data.serverNow)))throw new SafeError('expired');
   return data;
  }
  async open(hash){
   if(this.current)this.stop(this.current,true);
   const a={link:parse(hash),closed:false,claim:null,winner:false,transportAdmitted:false,busy:false,retryAt:0,timer:null,deadline:null,media:null,controller:new AbortController()};this.current=a;
   if(!a.link){this.show(a,'INVALID','Invalid connection link.');return;}
   this.show(a,'LOADING','Loading connection request...');await this.preview(a);
  }
  async preview(a){
   try{
    const data=this.validate(a,await this.http.call(a.link.id,'status',a.link.capability,undefined,a.controller.signal));if(!this.owns(a))return;
    if(a.link.role==='receive'){this.show(a,'APP_REQUIRED',"Android application required to share this device's screen.");return;}
    let saved;
    try{const raw=this.storage.getItem(this.key(a));saved=raw?JSON.parse(raw):null;if(saved&&(!canonical(saved.claim,32)||typeof saved.ended!=='boolean'))throw Error();}catch{throw new SafeError('storage');}
    if(saved?.ended){this.show(a,'ENDED','This browser attempt has ended. Ask for a new connection link.');return;}
    if(saved){a.claim=saved.claim;
     try{const winner=this.validate(a,await this.http.call(a.link.id,'status',a.claim,undefined,a.controller.signal),true);if(!this.owns(a))return;
      if(winner.state==='ACCEPTED'||winner.state==='CONNECTING'){a.winner=true;await this.advance(a,winner);return;}
      this.show(a,'ENDED','This connection cannot be resumed. Ask for a new connection link.');return;
     }catch(error){if(!this.owns(a))return;if(!(error.kind==='unavailable'&&data.state==='WAITING'))throw error;}
    }
    if(data.state!=='WAITING')throw new SafeError('conflict');
    this.show(a,'PREVIEW','The other device wants to share its screen with you.');
   }catch(error){this.error(a,error,()=>this.preview(a));}
  }
  async accept(){
   const a=this.current;if(!this.owns(a)||a.link.role!=='send'||a.busy||a.winner||a.ui!=='PREVIEW'||this.clock()<a.retryAt)return;
   a.busy=true;this.show(a,'ACCEPTING','Accepting connection request...');
   try{if(!a.claim){a.claim=claim(this.crypto);this.save(a);}else this.save(a);
    a.acceptSubmitted=true;
    const data=this.validate(a,await this.http.call(a.link.id,'accept',a.link.capability,{claimSecret:a.claim},a.controller.signal),true);if(!this.owns(a))return;
    if(!['ACCEPTED','CONNECTING'].includes(data.state))throw new SafeError('invalid');a.winner=true;await this.advance(a,data);
   }catch(error){this.error(a,error,a.winner?()=>this.poll(a):()=>{this.show(a,'PREVIEW','Retry Accept using the same saved claim.');});}finally{a.busy=false;}
  }
  async advance(a,data){
   if(!this.owns(a)||a.established)return;
   a.serverState=data.state;
   if(data.state==='CONNECTED'){if(!a.media)throw new SafeError('unavailable');return;}
   if(!['ACCEPTED','CONNECTING'].includes(data.state))throw new SafeError('expired');
   if(a.deadline==null){a.until=this.clock()+Math.min(120000,Date.parse(data.connectBy)-Date.parse(data.serverNow));a.deadline=this.later(()=>{if(!a.established)this.end(a,'Connection setup expired.');},Math.max(0,a.until-this.clock()));}
   if(data.state==='ACCEPTED'){
    try{await this.http.call(a.link.id,'participant-state',a.claim,{ready:true},a.controller.signal);}
    catch(error){
     // Initiator may bind immediately after our ACCEPTED status snapshot. A
     // readiness 409 is not permission to discard that exact winning assignment.
     if(error.kind!=='conflict')throw error;
     const latest=this.validate(a,await this.http.call(a.link.id,'status',a.claim,undefined,a.controller.signal),true);
     if(!this.owns(a)||a.established)return;
     if(!['CONNECTING','CONNECTED'].includes(latest.state))throw error;
     return this.advance(a,latest);
    }
    if(!this.owns(a)||a.established)return;
    this.show(a,'WAITING','Waiting for the phone. Return to Screen Share on the phone to continue.');
   }else{
    if(!assignment(data.session))throw new SafeError('invalid');
    if(!a.media){this.show(a,'CONNECTING','Connecting...');
     try{a.media=this.media({requestId:a.link.id,claim:a.claim,session:data.session,wsBase:WS,
      current:()=>this.owns(a),admitted:()=>{if(this.owns(a))a.transportAdmitted=true;},
      connected:()=>{if(this.owns(a)){a.established=true;this.clearTimers(a);}},
      frame:()=>{if(this.owns(a)){a.established=true;this.clearTimers(a);this.show(a,'STREAMING','Receiving screen');}},
      // A winning claim is not proof that this socket owns the protected participant.
      ended:()=>this.end(a,'Connection ended. Ask for a new link to reconnect.',a.transportAdmitted)});}
     catch{this.end(a,'Connection unavailable. Ask for a new link to reconnect.',a.transportAdmitted);return;}
    }
   }
   if(!a.established&&this.owns(a))a.timer=this.later(()=>this.poll(a),2000);
  }
  async poll(a){a.timer=null;if(!this.owns(a)||a.established)return;try{await this.advance(a,this.validate(a,await this.http.call(a.link.id,'status',a.claim,undefined,a.controller.signal),true));}catch(error){this.error(a,error,()=>this.poll(a));}}
  error(a,error,retry){
   if(!this.owns(a)||a.established)return; // Late setup HTTP cannot govern established media/UI.
   const kind=error instanceof SafeError?error.kind:'invalid';
   if(['network','service','rate'].includes(kind)){
    a.retryAt=this.clock()+(error.wait||0);a.retry=retry;
    this.show(a,'RETRY',kind==='rate'?'Too many attempts. Wait before trying again.':'Connection service unavailable. You can retry safely.',true);
   }else this.end(a,kind==='storage'?'Private tab storage is unavailable. Accept is disabled because reload recovery cannot be saved.':kind==='conflict'?'This request is already accepted or unavailable.':kind==='expired'?'This request has expired or ended.':'This connection request is unavailable or invalid.');
  }
  async retry(){const a=this.current;if(!this.owns(a)||a.busy||a.ui!=='RETRY'||this.clock()<a.retryAt)return;const retry=a.retry;a.retry=null;a.busy=true;try{if(retry)await retry();}finally{a.busy=false;}}
  clearTimers(a){this.cancel(a.timer);this.cancel(a.deadline);a.timer=a.deadline=null;}
  end(a,message,withdraw=true){if(!this.owns(a))return;this.stop(a,withdraw,message);}
  stop(a=this.current,withdraw=true,message=null){
   if(!a||a.closed)return;const hadMedia=!!a.media;a.closed=true;this.clearTimers(a);a.controller.abort();
   if(a.claim&&withdraw){try{this.save(a,true);}catch{}}
   a.media?.stop();a.media=null;
   // Best effort only, exact old request/claim. CONNECTED cannot be withdrawn.
   if(withdraw&&(a.winner||a.acceptSubmitted)&&!a.established&&a.serverState!=='CONNECTED')this.http.call(a.link.id,'withdraw',a.claim,{}).catch(()=>{});
   if(this.current===a)this.view({state:'ENDED',message:message||(hadMedia?'Connection ended.':'Connection request closed.'),retry:false,accept:false,stop:false});
  }
 }
 root.ConnectionRequest={API,WS,MAX_FRAGMENT,canonical,parse,claim,assignment,Http,SafeError,Client};
})(typeof module!=='undefined'&&module.exports?module.exports:globalThis);
