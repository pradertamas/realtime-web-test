'use strict';
const $ = id => document.getElementById(id);
const log = message => TestCore.log($('log'),message);
const c = { messages:0, missing:0, duplicates:0, order:0, reconnects:0, raf:0, canvas:0, webgl:0, timer:0, visibility:0, focus:0, blur:0, pageshow:0, pagehide:0, online:0, offline:0 };
let socket=null, connection='DISCONNECTED', attempts=0, successes=0, lastOpen='—', lastClose='—', closeInfo='—', error='—';
let sequence=new TestCore.Sequence(), sequenceSession='', latest=null, receivedAt='—', invalid=0, totalMessages=0;
let lastReceive=null,lastRaf=null,lastTimer=null, receiveGap=null,maxReceiveGap=0,maxRafGap=0,maxTimerGap=0;
let rates={messages:0,raf:0,canvas:0,webgl:0,timer:0}, rateBase={...c},rateAt=performance.now();
let test=new TestCore.Interval();
const state=()=>({connection,session:$('activeSession').textContent,visibility:document.visibilityState,focus:document.hasFocus(),online:navigator.onLine,webgl:glKind,context:glLost?'LOST':gl?'Available':'Unavailable'});
const stamp=()=>new Date().toISOString();
function setStatus(s){connection=s;$('status').textContent=s;$('status').className='status '+(s==='CONNECTED'?'good':s==='ERROR'?'bad':'warn');}
function list(id,items){$(id).replaceChildren(...Object.entries(items).flatMap(([k,v])=>{const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=String(v);return[a,b];}));}
function connect(){
  if(socket && socket.readyState!==WebSocket.CLOSED)return;
  try {
    const session=TestCore.session($('session').value);
    const address=TestCore.url(session,'receiver');
    attempts++;if(attempts>1)c.reconnects++;
    const ws=new WebSocket(address);socket=ws;
    if(sequenceSession!==session){
      sequence=new TestCore.Sequence();sequenceSession=session;lastReceive=null;receiveGap=null;latest=null;receivedAt='—';
      $('domValue').textContent='Waiting';$('gauge').value=0;$('marker').style.left='0';
    }
    $('activeSession').textContent=session;$('session').disabled=true;$('notice').textContent='';setStatus('CONNECTING');log('WebSocket connecting');
    ws.onopen=()=>{if(socket!==ws||ws.readyState!==WebSocket.OPEN)return;successes++;lastOpen=stamp();setStatus('CONNECTED');log('WebSocket open');};
    ws.onclose=e=>{if(socket!==ws)return;lastClose=stamp();closeInfo=e.code+' / '+(e.reason||'(no reason)');setStatus('DISCONNECTED');$('session').disabled=false;log('WebSocket close '+closeInfo);};
    ws.onerror=()=>{if(socket!==ws)return;error=stamp()+' WebSocket error';setStatus('ERROR');log(error);};
    ws.onmessage=e=>{
      if(socket!==ws)return;
      totalMessages++;
      if(typeof e.data!=='string' || e.data.length>16384){invalid++;return;}
      const m=TestCore.sample(e.data);if(!m){invalid++;return;}
      const now=performance.now();
      if(lastReceive!==null){receiveGap=now-lastReceive;maxReceiveGap=Math.max(maxReceiveGap,receiveGap);}lastReceive=now;
      const before={missing:sequence.missing,duplicate:sequence.duplicate,order:sequence.order};sequence.add(m.seq);
      c.missing+=sequence.missing-before.missing;c.duplicates+=sequence.duplicate-before.duplicate;c.order+=sequence.order-before.order;c.messages++;
      test.observe('network',now,m.seq);latest=m;receivedAt=stamp();
      $('domValue').textContent=m.value.toFixed(2);$('gauge').value=Math.max(0,Math.min(100,m.value));$('marker').style.left=`calc(${m.x*100}% - ${m.x*20}px)`;
    };
  } catch(e){$('notice').textContent=e.message;}
}
$('connect').onclick=connect;
$('disconnect').onclick=()=>{if(socket)socket.close(1000,'Manual disconnect');};
const canvas=$('canvas'),ctx=canvas.getContext('2d'), glCanvas=$('gl');
let gl=null,glKind='unavailable',glLost=false,glDetail={},program=null,position=null,color=null;
function initGL(){
  const shaders=[];let buffer=null;
  try {
    try {gl=glCanvas.getContext('webgl2');} catch(e) {gl=null;log('WebGL2 context request failed: '+e.message);}
    glKind=gl?'WebGL2':'WebGL1';if(!gl)gl=glCanvas.getContext('webgl');
    if(!gl){glKind='unavailable';glDetail={Status:'Context unavailable'};return;}
    glDetail={Renderer:gl.getParameter(gl.RENDERER),Vendor:gl.getParameter(gl.VENDOR),Version:gl.getParameter(gl.VERSION)};
    const modern=glKind==='WebGL2';
    const vertex=modern?'#version 300 es\nin vec2 a; uniform vec2 p; void main(){gl_Position=vec4(a+p,0.,1.);}':'attribute vec2 a; uniform vec2 p; void main(){gl_Position=vec4(a+p,0.,1.);}';
    const fragment=modern?'#version 300 es\nprecision mediump float; uniform vec3 c; out vec4 o; void main(){o=vec4(c,1.);}':'precision mediump float; uniform vec3 c; void main(){gl_FragColor=vec4(c,1.);}';
    function shader(type,source){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Shader compilation failed');return s;}
    const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    shaders.length=0;
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Program linking failed');
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,.12,-.1,-.1,.1,-.1]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);position=gl.getUniformLocation(program,'p');color=gl.getUniformLocation(program,'c');
  }catch(e){
    if(gl){shaders.forEach(s=>gl.deleteShader(s));if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}
    program=null;glDetail={Status:e.message};glKind='unavailable';gl=null;log('WebGL initialization: '+e.message);
  }
}
glCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();glLost=true;log('WebGL context lost');});
glCanvas.addEventListener('webglcontextrestored',()=>{glLost=false;initGL();log('WebGL context restored');});
initGL();
const sizes=new Map([[canvas,{dirty:true,dpr:0}],[glCanvas,{dirty:true,dpr:0}]]);
const dirtySizes=()=>sizes.forEach(s=>{s.dirty=true;});
window.addEventListener('resize',dirtySizes);
if(typeof ResizeObserver!=='undefined'){
  const observer=new ResizeObserver(entries=>entries.forEach(e=>{sizes.get(e.target).dirty=true;}));
  sizes.forEach((_,element)=>observer.observe(element));
}
function resize(element){
  const size=sizes.get(element),d=window.devicePixelRatio||1;if(!size.dirty&&size.dpr===d)return;
  const r=element.getBoundingClientRect(),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));
  if(element.width!==w||element.height!==h){element.width=w;element.height=h;}size.dirty=false;size.dpr=d;
}
function frame(){
  // Measure callback execution time, using the same monotonic clock as START/STOP.
  const now=performance.now();
  if(lastRaf!==null)maxRafGap=Math.max(maxRafGap,now-lastRaf);lastRaf=now;c.raf++;test.observe('raf',now);
  const m=latest||{x:.5,y:.5,value:50};const pulse=1+.12*Math.sin(now/300);
  if(ctx){resize(canvas);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#354760';ctx.strokeRect(1,1,canvas.width-2,canvas.height-2);ctx.fillStyle='#7df2b0';ctx.beginPath();ctx.arc((.05+.9*m.x)*canvas.width,(.05+.9*m.y)*canvas.height,Math.max(3,canvas.height*.035*pulse),0,Math.PI*2);ctx.fill();c.canvas++;}
  if(gl&&!glLost&&!gl.isContextLost()){resize(glCanvas);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.clearColor(.03,.06,.1,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform2f(position,(m.x-.5)*1.6,(.5-m.y)*1.6);gl.uniform3f(color,.3+.2*Math.sin(now/500),.7,Math.max(0,Math.min(1,m.value/100)));gl.drawArrays(gl.TRIANGLES,0,3);c.webgl++;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
for(const name of ['visibilitychange','focus','blur','pageshow','pagehide','online','offline']){
  const target=name==='visibilitychange'?document:window;
  target.addEventListener(name,()=>{const key=name==='visibilitychange'?'visibility':name;c[key]++;log(name+(key==='visibility'?' '+document.visibilityState:''));});
}
function paint(){
  list('connection',{'Connection attempts':attempts,'Successful connections':successes,'Reconnect attempts':c.reconnects,'Last open':lastOpen,'Last close':lastClose,'Last close code / reason':closeInfo,'Last error':error,'Total messages received':totalMessages,'Valid sample messages':c.messages,'Ignored messages':invalid});
  list('data',{'seq':latest?.seq??'—','value':latest?.value.toFixed(3)??'—','x':latest?.x.toFixed(3)??'—','y':latest?.y.toFixed(3)??'—','Sender timestamp (epoch ms)':latest?.sentAt??'—','Local receive timestamp':receivedAt,'Valid sample rate (recent window)':rates.messages.toFixed(2)+'/s','Valid samples received':c.messages,'Highest sequence':sequence.high,'Last sequence':latest?.seq??'—','Missing (forward gaps)':c.missing,'Duplicates (recent 4096)':c.duplicates,'Out-of-order':c.order,'Last inter-arrival gap':receiveGap===null?'—':receiveGap.toFixed(1)+' ms','Lifetime maximum receive gap':maxReceiveGap.toFixed(1)+' ms','Time since last receive':lastReceive===null?'—':((performance.now()-lastReceive)/1000).toFixed(1)+' s'});
  list('canvasMetrics',{'Status':ctx?'Available':'Unavailable','Frames':c.canvas,'FPS (recent window)':rates.canvas.toFixed(2)});
  list('glMetrics',{'Context':glKind,'Context state':glLost?'LOST':gl?'Available':'Unavailable',...glDetail,'Frames':c.webgl,'FPS (recent window)':rates.webgl.toFixed(2)});
  list('runtime',{'RAF frames':c.raf,'RAF FPS (recent window)':rates.raf.toFixed(2),'Maximum RAF gap':maxRafGap.toFixed(1)+' ms','Timer ticks':c.timer,'Timer rate (recent window)':rates.timer.toFixed(2)+'/s','Maximum timer gap':maxTimerGap.toFixed(1)+' ms','Visibility':document.visibilityState,'Visibility events':c.visibility,'Has focus':document.hasFocus(),'Focus events':c.focus,'Blur events':c.blur,'pageshow':c.pageshow,'pagehide':c.pagehide,'Online':navigator.onLine,'Online events':c.online,'Offline events':c.offline});
}
setInterval(()=>{
  const now=performance.now();if(lastTimer!==null)maxTimerGap=Math.max(maxTimerGap,now-lastTimer);lastTimer=now;c.timer++;test.observe('timer',now);
  const elapsed=(now-rateAt)/1000;Object.keys(rates).forEach(k=>rates[k]=TestCore.rate(c[k]-rateBase[k],elapsed));rateBase={...c};rateAt=now;paint();
},1000);
function report(r){
  const d=r.delta,rate=n=>TestCore.rate(n,r.seconds).toFixed(3);
  return [
    'REAL-TIME BROWSER TEST — CONTINUITY RESULTS', 'Session: '+r.stateStart.session+' -> '+r.stateStop.session,
    '', 'TEST INTERVAL', 'Start: '+r.start,'Stop: '+r.stop,'Elapsed seconds: '+r.seconds.toFixed(3),
    '', 'NETWORK','Connection: '+r.stateStart.connection+' -> '+r.stateStop.connection,
    'Messages received delta: '+d.messages+' (valid samples)','Average valid sample rate (messages / full interval): '+rate(d.messages)+'/s',
    d.messages===0?'No valid samples observed; transport continuity cannot be inferred.':'Valid samples observed; examine gaps and connection states.',
    'First sequence in interval: '+(r.firstSeq??'none'),'Last sequence in interval: '+(r.lastSeq??'none'),
    'Missing sequence delta: '+d.missing,'Duplicate delta: '+d.duplicates,'Out-of-order delta: '+d.order,'Reconnect attempt delta: '+d.reconnects,
    'Maximum receive gap in interval: '+r.max.network.toFixed(1)+' ms',
    '', 'RUNTIME',...['raf','canvas','webgl'].map(k=>k.toUpperCase()+' frames delta: '+d[k]+' | average FPS: '+rate(d[k])),
    'WebGL: '+r.stateStart.webgl+' / '+r.stateStart.context+' -> '+r.stateStop.webgl+' / '+r.stateStop.context,
    'Timer ticks delta: '+d.timer+' | average rate: '+rate(d.timer)+'/s',
    'Maximum RAF gap in interval: '+r.max.raf.toFixed(1)+' ms','Maximum timer gap in interval: '+r.max.timer.toFixed(1)+' ms',
    '', 'PAGE STATE',...['visibility','focus','online'].map(k=>k+': '+r.stateStart[k]+' -> '+r.stateStop[k]),
    ...['visibility','focus','blur','pageshow','pagehide','online','offline'].map(k=>k+' event delta: '+d[k]),
    '', 'INTERPRETATION', 'Gaps are clipped to interval boundaries, including quiet time from START and up to STOP.',
    'Duplicate detection uses the most recent 4096 distinct sequence numbers. Older repeats may count as out-of-order.',
    'Missing counts record forward jumps; later arrivals do not subtract previously observed gaps.',
    'Use a fresh test after changing sessions or restarting the sender.',
    'Counter deltas show callback/message activity observed during the interval.',
    'They do not by themselves prove that the page remained visibly presented for the entire interval.',
    'Message receipt shows delivery to JavaScript while callbacks executed.',
    'RAF / Canvas / WebGL counters show callback / render calls, not physical display visibility at every instant.',
    'No one-way network latency is inferred from independent clocks.'
  ].join('\n');
}
$('testStart').onclick=()=>{if(test.active)return;test.start(c,state(),performance.now(),stamp());$('results').value='Test running. STOP to calculate final results.';$('testState').textContent='RUNNING — started '+test.epoch;log('Continuity START');};
$('testStop').onclick=()=>{const r=test.stop(c,state(),performance.now(),stamp());if(!r)return;$('results').value=report(r);$('testState').textContent='STOPPED — '+r.seconds.toFixed(3)+' seconds';log('Continuity STOP');paint();};
$('reset').onclick=()=>{test=new TestCore.Interval();$('results').value='No completed test. Results appear here after STOP.';$('testState').textContent='Test measurements reset; lifetime counters continue.';log('Continuity RESET');};
paint();
