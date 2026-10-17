'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {env}=require('./verify-webrtc.cjs');
(async()=>{
 const e=env();e.run(fs.readFileSync('auto-pairing.js','utf8'));
 const s=e.run('active'),pc=e.PC.instances[0],ws=e.WS.instances[0];
 ws.open();ws.message({type:'registration',status:'ok'});ws.message({type:'peer-present'});await s.chain;
 pc.ontrack({track:{kind:'video',stop(){}},streams:[]});
 const video=e.nodes.get('video');
 for(const [width,height] of [[720,1560],[1560,720],[720,1560],[1280,720],[720,1280]]){
  Object.assign(video,{readyState:2,videoWidth:width,videoHeight:height});
  if(!s.streaming)video.onloadeddata(); // Later changes need no playback/view restart event.
  pc.report=new Map([['in',{type:'inbound-rtp',kind:'video',frameWidth:width,frameHeight:height}]]);
  await e.run('sample(active)');
  assert.equal(e.nodes.get('receiver').dataset.view,'STREAMING');
  assert.equal(e.nodes.get('videoPanel').hidden,false);assert.equal(e.nodes.get('pairingPanel').hidden,true);
  assert.ok(e.nodes.get('videoMetrics').children.some(node=>node.textContent===`${width} × ${height}`));
  assert.equal(e.run('active'),s);assert.equal(e.run('active.pc'),pc);
  assert.equal(e.PC.instances.length,1);assert.equal(e.WS.instances.length,1);
 }
 pc.report=new Map();await e.run('sample(active)');
 assert.ok(e.nodes.get('videoMetrics').children.some(node=>node.textContent==='720 × 1280')); // DOM dimensions even without inbound stats.
 const css=fs.readFileSync('receiver-ui.css','utf8');
 const streaming=css.match(/\.receiver\[data-view="STREAMING"\] #video\{([^}]+)\}/)[1];
 assert.match(streaming,/width:100%/);assert.match(streaming,/height:100%/);assert.match(streaming,/object-fit:contain/);
 assert.doesNotMatch(css,/transform\s*:\s*rotate|aspect-ratio\s*:\s*720\s*\/\s*1560/);
 e.fire('pagehide');assert.equal(video.srcObject,null);
 console.log('PASS orientation: dynamic DOM/RTP dimensions, same peer/socket and STREAMING view, missing stats fallback, contain/full-size layout and no rotation workaround.');
})().catch(e=>{console.error('FAIL orientation:',e);process.exitCode=1;});
