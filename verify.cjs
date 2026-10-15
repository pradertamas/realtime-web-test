/* Deterministic native-API verification; optional public relay integration. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
function environment(file,glMode='none',options={}){
  let now=0,next=0;const intervals=new Map(),raf=[],nodes=new Map(),events={},listenerCounts={},contextRequests=[];
  const listen=(n,f)=>{events[n]=f;listenerCounts[n]=(listenerCounts[n]||0)+1;};
  class Element{
    constructor(){this.children=[];this.value='';this.textContent='';this.style={};this.listeners={};this.width=0;this.height=0;this.rectReads=0;}
    prepend(e){this.children.unshift(e);e.remove=()=>this.children.splice(this.children.indexOf(e),1);}
    get lastChild(){return this.children.at(-1);}
    replaceChildren(...e){this.children=e;}
    addEventListener(n,f){this.listeners[n]=f;listenerCounts[n]=(listenerCounts[n]||0)+1;}
    getBoundingClientRect(){this.rectReads++;return{width:400,height:230};}
    getContext(kind){contextRequests.push(kind);if(kind==='2d')return options.noCanvas?null:{clearRect(){},strokeRect(){},beginPath(){},arc(){},fill(){}};if(kind==='webgl2'&&options.throwWebGL2)throw Error('Context request failed');if(glMode==='none'||kind==='webgl2'&&glMode==='webgl1')return null;return gl;}
  }
  let draws=0;
  const gl=new Proxy({RENDERER:1,VENDOR:2,VERSION:3,COMPILE_STATUS:4,LINK_STATUS:5,
    getParameter:k=>'standard '+k,getShaderParameter:()=>!options.shaderFailure,getProgramParameter:()=>!options.linkFailure,isContextLost:()=>!!options.contextLost,
    createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getAttribLocation:()=>0,getUniformLocation:()=>({}),drawArrays:()=>draws++}, {get:(t,k)=>k in t?t[k]:()=>{}});
  const document={visibilityState:'visible',hasFocus:()=>true,createElement:()=>new Element(),getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},addEventListener:listen};
  class WS{
    static OPEN=1;static CLOSING=2;static CLOSED=3;static instances=[];
    constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;this.sent=[];WS.instances.push(this);}
    open(){this.readyState=1;this.onopen?.();}
    send(s){assert.equal(this.readyState,1);this.sent.push(s);}
    close(code=1000,reason=''){this.readyState=2;if(!options.asyncClose)this.finishClose(code,reason);}
    finishClose(code=1000,reason=''){this.readyState=3;this.onclose?.({code,reason});}
    message(data){this.onmessage?.({data});}
  }
  const context=vm.createContext({console,document,navigator:{onLine:true},window:{devicePixelRatio:2,addEventListener:listen},WebSocket:WS,performance:{now:()=>now},Date,Math,JSON,Number,Set,Map,Object,Float32Array,
    setInterval:(f,ms)=>{intervals.set(++next,{f,ms});return next;},clearInterval:id=>intervals.delete(id),requestAnimationFrame:f=>raf.push(f)});
  for(const [,id] of fs.readFileSync(file.replace('.js','.html'),'utf8').matchAll(/id="([^"]+)"/g))document.getElementById(id);
  for(const f of ['common.js',file])vm.runInContext(fs.readFileSync(f,'utf8'),context,{filename:f});
  return{context,nodes,events,listenerCounts,contextRequests,intervals,raf,WS,get draws(){return draws;},setNow:n=>now=n,run:s=>vm.runInContext(s,context),click:id=>document.getElementById(id).onclick(),tick:ms=>{for(const t of [...intervals.values()])if(t.ms===ms)t.f();},frame:(n,frameTime=n)=>{now=n;raf.shift()(frameTime);}};
}
const coreContext=vm.createContext({});vm.runInContext(fs.readFileSync('common.js','utf8'),coreContext);const core=coreContext.TestCore;
check('session validation and configured encoded WSS URL',()=>{
  assert.equal(core.url(' Ab_1-2 ','sender'),'wss://realtime-relay-k28l.onrender.com/ws?session=Ab_1-2&role=sender');
  for(const v of ['', 'a b','a&role=sender','<x>','a'.repeat(65)])assert.throws(()=>core.session(v));assert.throws(()=>core.url('x','other'));
});
const msg=n=>JSON.stringify({type:'sample',seq:n,sentAt:123,value:50,x:.2,y:.8});
check('malformed JSON and shapes rejected',()=>{for(const raw of ['{','null','[]','{}',msg(0),msg(1).replace('0.2','2'),msg(1).replace('50','"50"')])assert.equal(core.sample(raw),null);assert.equal(core.sample(msg(1)).seq,1);});
check('sequence normal, missing, duplicate, out-of-order and bounded history',()=>{const s=new core.Sequence();[1,2,5,5,4].forEach(n=>s.add(n));assert.equal(s.high,5);assert.equal(s.missing,2);assert.equal(s.duplicate,1);assert.equal(s.order,1);for(let n=6;n<10000;n++)s.add(n);assert.equal(s.seen.size,4096);});
check('interval snapshots, deltas, boundary gaps and pre-test isolation',()=>{const t=new core.Interval(),c={raf:900,messages:40};t.start(c,{connection:'CONNECTED'},10000,'start');c.raf+=3;c.messages+=2;t.observe('raf',10020);t.observe('network',10050,8);t.observe('network',10100,9);const r=t.stop(c,{connection:'DISCONNECTED'},10200,'stop');assert.equal(r.delta.raf,3);assert.equal(r.delta.messages,2);assert.equal(r.seconds,.2);assert.equal(r.max.raf,180);assert.equal(r.max.network,100);assert.equal(r.max.timer,200);assert.equal(r.firstSeq,8);assert.equal(r.lastSeq,9);assert.equal(r.stateStart.connection,'CONNECTED');assert.equal(t.stop(c,{},10300,''),null);});
const sender=environment('sender.js');sender.nodes.get('session').value='verify';sender.click('connect');const sw=sender.WS.instances[0];sw.open();
check('sender repeated START has one stream and emits valid samples',()=>{sender.click('start');sender.click('start');assert.equal(sender.intervals.size,2);sender.setNow(100);sender.tick(100);assert.equal(sw.sent.length,1);assert.equal(core.sample(sw.sent[0]).seq,1);});
check('sender STOP and DISCONNECT stop sending',()=>{sender.click('stop');sender.tick(100);assert.equal(sw.sent.length,1);sender.click('start');sender.click('disconnect');sender.tick(100);assert.equal(sw.sent.length,1);assert.equal(sender.intervals.size,1);});
const r=environment('receiver.js');r.nodes.get('session').value='verify';r.click('connect');const rw=r.WS.instances[0];rw.open();
check('receiver ignores malformed inputs and accounts sequences',()=>{rw.message('{');rw.message('{}');[1,2,5,5,4].forEach(n=>rw.message(msg(n)));assert.equal(r.run('invalid'),2);assert.equal(r.run('c.messages'),5);assert.equal(r.run('c.missing'),2);assert.equal(r.run('c.duplicates'),1);assert.equal(r.run('c.order'),1);});
check('receiver report remains on-screen with interval-specific measurements',()=>{r.frame(100);r.frame(5000);r.setNow(6000);r.click('testStart');r.frame(6010);r.setNow(6050);rw.message(msg(6));r.setNow(6100);r.tick(1000);r.setNow(6200);r.click('testStop');const text=r.nodes.get('results').value;assert.match(text,/Messages received delta: 1/);assert.match(text,/Maximum RAF gap in interval: 190.0 ms/);assert.match(text,/Maximum timer gap in interval: 100.0 ms/);assert.match(text,/Maximum receive gap in interval: 150.0 ms/);assert.match(text,/First sequence in interval: 6/);r.tick(1000);assert.equal(r.nodes.get('results').value,text);});
check('RESET does not duplicate loops, listeners, timers or connections',()=>{const sizes=[r.intervals.size,r.raf.length,JSON.stringify(r.listenerCounts),r.WS.instances.length];for(let i=0;i<10;i++)r.click('reset');assert.deepEqual([r.intervals.size,r.raf.length,JSON.stringify(r.listenerCounts),r.WS.instances.length],sizes);});
check('diagnostic log bounded at 150',()=>{for(let i=0;i<200;i++)r.events.focus();assert.equal(r.nodes.get('log').children.length,150);});
check('WebGL unavailable handling',()=>{assert.equal(r.run('glKind'),'unavailable');r.frame(7000);assert.equal(r.run('c.webgl'),0);});
for(const mode of ['webgl1','webgl2'])check(mode+' initialization, rendering, lost and restored handling',()=>{const e=environment('receiver.js',mode);assert.equal(e.run('glKind'),mode==='webgl1'?'WebGL1':'WebGL2');e.frame(100);assert.equal(e.draws,1);let prevented=false;e.nodes.get('gl').listeners.webglcontextlost({preventDefault:()=>prevented=true});e.frame(200);assert.equal(e.draws,1);assert.ok(prevented);e.nodes.get('gl').listeners.webglcontextrestored();e.frame(300);assert.equal(e.draws,2);});
check('local references resolve and no external document dependencies',()=>{for(const f of ['index.html','sender.html','receiver.html']){const html=fs.readFileSync(f,'utf8');for(const [,ref]of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert.ok(!/^(https?:)?\/\//.test(ref));assert.ok(fs.existsSync(ref),ref);} }assert.ok(fs.readFileSync('receiver.html','utf8').includes('<textarea id="results" readonly'));});
for(const [values,expected] of [
  [[1,2,3,4,5],[0,0,0]],[[1,2,5],[2,0,0]],[[1,2,2,3],[0,1,0]],
  [[1,3,2,4],[1,0,1]],[[1,5,3,5,6],[3,1,1]],[[10,11,12],[0,0,0]]
])check('sequence case '+values.join(','),()=>{const s=new core.Sequence();values.forEach(n=>s.add(n));assert.deepEqual([s.missing,s.duplicate,s.order],expected);assert.equal(s.high,Math.max(...values));});
check('numeric validation rejects non-finite and invalid sequence fields',()=>{
  for(const patch of [{seq:1.5},{seq:-1},{seq:Number.MAX_SAFE_INTEGER+1},{x:-.1},{y:1.1},{value:null},{sentAt:-1}])assert.equal(core.sample(JSON.stringify({...JSON.parse(msg(1)),...patch})),null);
  for(const key of ['sentAt','value','x','y'])assert.equal(core.sample(msg(1).replace(new RegExp('"'+key+'":-?[0-9.]+'),'"'+key+'":1e999')),null);
});
check('rate denominators handle short and zero-duration windows',()=>{assert.equal(core.rate(2,.1),20);for(const seconds of [0,-1,NaN])assert.equal(core.rate(2,seconds),0);assert.equal(core.rate(1,1e-320),0);});
check('sender and receiver zero-duration displays stay finite',()=>{
  for(const file of ['sender.js','receiver.js']){const e=environment(file);e.tick(1000);assert.doesNotMatch(e.run(file==='sender.js'?'String(rate)':'JSON.stringify(rates)'),/NaN|Infinity|null/);}
});
for(const file of ['sender.js','receiver.js'])check(file+' CONNECT guard and stale socket events',()=>{
  const e=environment(file,'none',{asyncClose:true});e.nodes.get('session').value='guard';e.click('connect');e.click('connect');assert.equal(e.WS.instances.length,1);
  const old=e.WS.instances[0];old.open();e.click('connect');assert.equal(e.WS.instances.length,1);e.click('disconnect');assert.equal(old.readyState,2);e.click('connect');assert.equal(e.WS.instances.length,1);
  old.finishClose();e.click('connect');const fresh=e.WS.instances[1];fresh.open();old.onerror();old.onclose({code:1006,reason:'old'});old.onopen();assert.equal(e.nodes.get('status').textContent,'CONNECTED');
  if(file==='receiver.js'){old.message(msg(9));assert.equal(e.run('c.messages'),0);assert.equal(e.run('c.reconnects'),1);}
});
check('sender STOP/START preserves sequence, delayed ticks send once, closed/error paths stop',()=>{
  const e=environment('sender.js');e.nodes.get('session').value='stream';e.click('connect');const ws=e.WS.instances[0];ws.open();e.click('start');e.setNow(100);e.tick(100);e.click('stop');e.click('start');e.setNow(60000);e.tick(100);
  assert.deepEqual(ws.sent.map(s=>core.sample(s).seq),[1,2]);assert.equal(e.nodes.get('log').children.length,5);
  ws.readyState=2;e.tick(100);assert.equal(e.intervals.size,1);assert.equal(ws.sent.length,2);
  ws.readyState=1;e.click('start');ws.bufferedAmount=65537;e.tick(100);assert.equal(e.intervals.size,1);assert.equal(ws.sent.length,2);
});
check('sender reconnect before queued close event cannot migrate the old stream',()=>{
  const e=environment('sender.js');e.nodes.get('session').value='queued';e.click('connect');const old=e.WS.instances[0];old.open();e.click('start');old.readyState=e.WS.CLOSED;
  e.click('connect');e.WS.instances[1].open();old.onclose({code:1006,reason:'old'});e.tick(100);assert.equal(e.intervals.size,1);assert.equal(e.WS.instances[1].sent.length,0);assert.equal(e.nodes.get('status').textContent,'CONNECTED');
});
check('first sample has no inter-arrival gap; reconnect and session baselines are explicit',()=>{
  const e=environment('receiver.js');e.nodes.get('session').value='first';e.click('connect');let ws=e.WS.instances[0];ws.open();e.setNow(900000);ws.message(msg(10));assert.equal(e.run('receiveGap'),null);assert.equal(e.run('maxReceiveGap'),0);
  e.click('disconnect');e.setNow(901000);e.click('connect');ws=e.WS.instances[1];ws.open();ws.message(msg(11));assert.equal(e.run('receiveGap'),1000);
  e.click('disconnect');e.nodes.get('session').value='second';e.click('connect');assert.equal(e.run('latest'),null);assert.equal(e.run('receiveGap'),null);assert.equal(e.nodes.get('domValue').textContent,'Waiting');
  ws=e.WS.instances[2];ws.open();e.setNow(950000);ws.message(msg(1));assert.equal(e.run('maxReceiveGap'),1000);assert.equal(e.run('receiveGap'),null);
});
check('all interval gaps exclude large pre-test gaps',()=>{
  const e=environment('receiver.js');e.nodes.get('session').value='gaps';e.click('connect');const ws=e.WS.instances[0];ws.open();
  e.frame(100);e.tick(1000);ws.message(msg(1));e.frame(100000);e.tick(1000);ws.message(msg(2));
  assert.equal(e.run('maxRafGap'),99900);assert.equal(e.run('maxTimerGap'),99900);assert.equal(e.run('maxReceiveGap'),99900);
  e.setNow(100100);e.click('testStart');e.frame(100110);e.setNow(100120);e.tick(1000);ws.message(msg(3));e.setNow(100130);e.click('testStop');
  const text=e.nodes.get('results').value;assert.match(text,/Maximum RAF gap in interval: 20.0 ms/);assert.match(text,/Maximum timer gap in interval: 20.0 ms/);assert.match(text,/Maximum receive gap in interval: 20.0 ms/);
});
check('RAF callback clock ignores earlier browser frame timestamp',()=>{
  const e=environment('receiver.js');e.setNow(100);e.click('testStart');e.frame(120,90);e.setNow(150);e.click('testStop');assert.match(e.nodes.get('results').value,/Maximum RAF gap in interval: 30.0 ms/);assert.equal(e.run('c.raf'),1);
});
check('disconnected/no-message and zero-duration tests produce explicit complete reports',()=>{
  const e=environment('receiver.js');e.click('reset');e.setNow(500);e.click('testStart');e.click('testStart');e.setNow(520);e.click('testStop');let text=e.nodes.get('results').value;
  for(const section of ['TEST INTERVAL','NETWORK','RUNTIME','PAGE STATE','INTERPRETATION'])assert.ok(text.includes(section));assert.match(text,/Connection: DISCONNECTED -> DISCONNECTED/);assert.match(text,/No valid samples observed/);assert.match(text,/Maximum receive gap in interval: 20.0 ms/);assert.match(text,/First sequence in interval: none/);
  e.click('reset');e.click('testStart');e.click('testStop');text=e.nodes.get('results').value;assert.doesNotMatch(text,/NaN|Infinity/);assert.match(text,/Elapsed seconds: 0.000/);assert.match(text,/average FPS: 0.000/);
});
check('connection close/reconnect and page events are interval deltas',()=>{
  const e=environment('receiver.js');assert.equal(e.run('c.pageshow'),0);e.events.pageshow();e.nodes.get('session').value='cycle';e.click('connect');let ws=e.WS.instances[0];ws.open();
  e.setNow(100);e.click('testStart');e.setNow(150);ws.message(msg(1));e.click('disconnect');
  for(const event of ['visibilitychange','focus','blur','pageshow','pagehide','online','offline'])e.events[event]();
  e.run("document.visibilityState='hidden';document.hasFocus=()=>false");e.setNow(250);e.click('connect');ws=e.WS.instances[1];ws.open();ws.message(msg(2));e.setNow(300);e.click('testStop');
  const text=e.nodes.get('results').value;assert.match(text,/Reconnect attempt delta: 1/);assert.match(text,/Connection: CONNECTED -> CONNECTED/);assert.match(text,/Maximum receive gap in interval: 100.0 ms/);assert.match(text,/visibility: visible -> hidden/);assert.match(text,/focus: true -> false/);
  for(const event of ['visibility','focus','blur','pageshow','pagehide','online','offline'])assert.ok(text.includes(event+' event delta: 1'));
  e.click('testStart');e.click('disconnect');e.setNow(400);e.click('testStop');assert.match(e.nodes.get('results').value,/Connection: CONNECTED -> DISCONNECTED/);assert.match(e.nodes.get('results').value,/Messages received delta: 0/);
});
check('repeated cycles and RESET preserve infrastructure and recent rate baselines',()=>{
  const e=environment('receiver.js'),counts=JSON.stringify(e.listenerCounts);e.setNow(100);e.frame(100);e.click('reset');e.setNow(1000);e.tick(1000);assert.equal(e.run('rates.raf'),1);
  for(let i=0;i<10;i++){e.click('testStart');e.frame(1100+i*100);e.click('testStop');assert.match(e.nodes.get('results').value,/RAF frames delta: 1/);e.click('reset');}
  assert.equal(e.intervals.size,1);assert.equal(e.raf.length,1);assert.equal(e.WS.instances.length,0);assert.equal(JSON.stringify(e.listenerCounts),counts);
});
check('Canvas sizing caches geometry and responds to resize / DPR changes',()=>{
  const e=environment('receiver.js','webgl2');e.frame(10);e.frame(20);for(const id of ['canvas','gl']){assert.equal(e.nodes.get(id).width,800);assert.equal(e.nodes.get(id).height,460);assert.equal(e.nodes.get(id).rectReads,1);}
  e.events.resize();e.frame(30);assert.equal(e.nodes.get('canvas').rectReads,2);e.run('window.devicePixelRatio=1');e.frame(40);assert.equal(e.nodes.get('canvas').width,400);assert.equal(e.run('c.canvas'),4);assert.equal(e.run('c.webgl'),4);
});
check('unavailable Canvas and silently lost WebGL do not count render calls',()=>{
  const e=environment('receiver.js','webgl2',{noCanvas:true,contextLost:true});e.frame(10);assert.equal(e.run('c.raf'),1);assert.equal(e.run('c.canvas'),0);assert.equal(e.run('c.webgl'),0);
});
check('WebGL2 request exception falls back to WebGL1',()=>{const e=environment('receiver.js','webgl1',{throwWebGL2:true});assert.equal(e.run('glKind'),'WebGL1');assert.deepEqual(e.contextRequests,['2d','webgl2','webgl']);e.frame(10);assert.equal(e.draws,1);});
for(const failure of ['shaderFailure','linkFailure'])check('WebGL '+failure+' is visible and does not interrupt RAF/Canvas',()=>{
  const e=environment('receiver.js','webgl2',{[failure]:true});assert.equal(e.run('glKind'),'unavailable');assert.match(e.run('glDetail.Status'),/failed/);e.frame(10);assert.equal(e.run('c.canvas'),1);assert.equal(e.run('c.webgl'),0);assert.equal(e.raf.length,1);
});
console.log(`${checks} deterministic checks passed.`);
async function remote(){
  if(typeof WebSocket==='undefined')throw new Error('Native WebSocket unavailable in this Node version');
  const session='verify_'+require('node:crypto').randomBytes(16).toString('hex');
  const receiver=new WebSocket(core.url(session,'receiver')),sender=new WebSocket(core.url(session,'sender'));
  let received=[],timer;
  const opened=ws=>new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('WSS open failed')),{once:true});});
  try{
    const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Remote test timed out after 60 seconds')),60000);receiver.addEventListener('message',e=>{const m=core.sample(e.data);if(m){received.push(m.seq);if(received.length===100)resolve();}});});
    await Promise.race([Promise.all([opened(receiver),opened(sender)]),done]);
    const start=performance.now();for(let n=1;n<=100;n++){await new Promise(resolve=>setTimeout(resolve,100));sender.send(msg(n));}await done;
    assert.deepEqual(received,Array.from({length:100},(_,i)=>i+1));console.log(`PASS remote: 100/100 ordered messages, missing/duplicates/out-of-order 0/0/0; ${(performance.now()-start).toFixed(0)} ms; random isolated session.`);
  }finally{clearTimeout(timer);receiver.close();sender.close();}
}
if(process.argv.includes('--remote'))remote().catch(e=>{console.error('REMOTE NOT PASSED: '+e.message);process.exitCode=1;});
