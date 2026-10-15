'use strict';
const $ = id => document.getElementById(id);
let socket = null, stream = null, seq = 0, sent = 0, last = '—', latest = '—', rate = 0, windowCount = 0, windowAt = performance.now();
const log = message => TestCore.log($('log'), message);
function status(s) { $('status').textContent = s; $('status').className = 'status ' + (s === 'CONNECTED' ? 'good' : s === 'ERROR' ? 'bad' : 'warn'); }
function stop() { if (stream !== null) { clearInterval(stream); stream = null; log('Stream stopped'); } }
function paint() {
  const data = { 'Sequence': seq, 'Sent messages': sent, 'Target rate': '10 messages/s', 'Send rate (recent window)': rate.toFixed(2) + '/s', 'Last send timestamp': last, 'Current values': latest, 'Stream': stream === null ? 'STOPPED' : 'RUNNING' };
  $('metrics').replaceChildren(...Object.entries(data).flatMap(([k,v]) => { const a=document.createElement('dt'),b=document.createElement('dd');a.textContent=k;b.textContent=v;return [a,b]; }));
}
$('connect').onclick = () => {
  if (socket && socket.readyState !== WebSocket.CLOSED) return;
  try {
    const session = TestCore.session($('session').value);
    // A CLOSED state can be observed before its queued close event is delivered.
    stop();const ws = new WebSocket(TestCore.url(session, 'sender')); socket = ws;
    $('activeSession').textContent=session; $('session').disabled=true; $('notice').textContent=''; status('CONNECTING'); log('WebSocket connecting');
    ws.onopen=()=>{if(socket!==ws||ws.readyState!==WebSocket.OPEN)return;status('CONNECTED');log('WebSocket open');};
    ws.onerror=()=>{if(socket!==ws)return;status('ERROR');log('WebSocket error');};
    ws.onclose=e=>{if(socket!==ws)return;stop();status('DISCONNECTED');$('session').disabled=false;log('WebSocket close '+e.code+' '+e.reason);};
  } catch(e) { $('notice').textContent=e.message; }
};
$('disconnect').onclick=()=>{stop();if(socket)socket.close(1000,'Manual disconnect');};
$('start').onclick=()=>{
  if(stream!==null)return;
  if(!socket || socket.readyState!==WebSocket.OPEN){$('notice').textContent='Connect before starting.';return;}
  stream=setInterval(()=>{
    if(!socket || socket.readyState!==WebSocket.OPEN){stop();return;}
    if(socket.bufferedAmount > 65536){stop();log('Stream stopped: outgoing buffer exceeded 64 KiB');return;}
    const t=performance.now()/1000;
    const m={type:'sample',seq:seq+1,sentAt:Date.now(),senderMono:performance.now(),value:50+50*Math.sin(t),x:.5+.45*Math.sin(t*.7),y:.5+.45*Math.cos(t*.9)};
    try {socket.send(JSON.stringify(m));seq++;sent++;windowCount++;last=new Date(m.sentAt).toISOString();latest=`value ${m.value.toFixed(2)}, x ${m.x.toFixed(3)}, y ${m.y.toFixed(3)}`;}catch(e){stop();log('Send failed: '+e.message);}
  },100);log('Stream started');
};
$('stop').onclick=stop;
setInterval(()=>{const now=performance.now();rate=TestCore.rate(windowCount,(now-windowAt)/1000);windowCount=0;windowAt=now;paint();},1000);
paint();
