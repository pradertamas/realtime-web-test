'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {env}=require('./verify-webrtc.cjs');
function page(search=''){
 const e=env(true,search);e.run(fs.readFileSync('auto-pairing.js','utf8'));
 e.run("el('messageParking');el('connectMessages');el('shareMessages');");
 for(const id of ['messageParking','connectMessages','shareMessages'])e.nodes.get(id).appendChild=function(n){this.children.push(n);n.parent=this;};
 return e;
}
const e=page();let stops=0,starts=0;
e.run('(stop,start)=>{scanner.stop=stop;scanner.start=start;}')(()=>stops++,()=>starts++);
const own=e.run('active'),socketCount=e.WS.instances.length;
e.nodes.get('scan').onclick();
assert.equal(e.nodes.get('scanPanel').hidden,false);assert.equal(starts,1);assert.equal(e.nodes.get('showPanel').hidden,true);
assert.equal(e.nodes.get('status').parent,e.nodes.get('connectMessages'));assert.equal(e.nodes.get('pairingError').parent,e.nodes.get('connectMessages'));
e.run("scanner.onError('Camera permission denied. Enter the connection code instead.')");
assert.match(e.nodes.get('scanError').textContent,/permission denied/);assert.equal(e.nodes.get('scanPanel').hidden,false);
e.nodes.get('session').value='bad';e.nodes.get('codeConnect').onclick();assert.match(e.nodes.get('codeError').textContent,/Invalid/);
e.nodes.get('cancelScan').onclick();assert.equal(e.nodes.get('scanPanel').hidden,true);assert.ok(stops>=2);
e.nodes.get('chooseShare').onclick();assert.equal(e.nodes.get('showPanel').hidden,false);
assert.equal(e.nodes.get('status').parent,e.nodes.get('shareMessages'));assert.equal(e.nodes.get('createdPairing').hidden,false);
assert.equal(e.run('active'),own);assert.equal(e.WS.instances.length,socketCount,'Path changes must not recreate registration');
e.nodes.get('closeShow').onclick();assert.equal(e.nodes.get('showPanel').hidden,true);
e.nodes.get('scan').onclick();e.nodes.get('session').value='7K4M2Q';e.nodes.get('codeConnect').onclick();
assert.equal(e.run('active.intent'),'join');assert.equal(e.nodes.get('scanPanel').hidden,true);e.fire('pagehide');
const scan=page();scan.nodes.get('scan').onclick();scan.run("scanner.onPayload('7K4M2Q')");assert.equal(scan.nodes.get('scanPanel').hidden,true);assert.equal(scan.run('active.intent'),'join');scan.fire('pagehide');
const invalid=page();invalid.nodes.get('scan').onclick();invalid.run("scanner.onPayload('invalid QR')");assert.equal(invalid.nodes.get('scanPanel').hidden,false);assert.match(invalid.nodes.get('scanError').textContent,/not a valid/);invalid.fire('pagehide');
const hidden=page();hidden.nodes.get('scan').onclick();hidden.run('document.hidden=true');hidden.fireDocument('visibilitychange');assert.equal(hidden.nodes.get('scanPanel').hidden,true);hidden.fire('pagehide');
const mobile=page('?mode=mobile');mobile.nodes.get('scan').onclick();assert.equal(mobile.WS.instances.length,0);assert.notEqual(mobile.nodes.get('receiver').dataset.panel,'scanPanel');mobile.fire('pagehide');
const html=fs.readFileSync('webrtc-receiver.html','utf8'),css=fs.readFileSync('receiver-ui.css','utf8');
assert.match(html,/<button disabled[^>]*>SEND/);assert.match(html,/aria-pressed="true">RECEIVE/);assert.match(html,/id="pairedDevices" hidden/);
assert.equal((html.match(/class="action-card"/g)||[]).length,2);
for(const obsolete of ['4. Status','3. Connect','connectActions','shareActions','Show QR / code','id="codePanel"','id="enterCode"'])assert.ok(!html.includes(obsolete),obsolete);
const connect=html.slice(html.indexOf('<section id="scanPanel"'),html.indexOf('<section id="showPanel"'));
for(const id of ['scanVideo','scanCanvas','session','codeConnect','connectMessages','scanError','cancelScan'])assert.ok(connect.includes('id="'+id+'"'),id);
assert.match(connect,/OR/);assert.ok(!connect.includes('role="dialog"'));
const show=html.slice(html.indexOf('<section id="showPanel"'),html.indexOf('<section id="connectingPanel"'));
for(const id of ['createdPairing','createdQr','createdCode','copyCode','shareCode','shareMessages','closeShow'])assert.ok(show.includes('id="'+id+'"'),id);
assert.match(html,/id="diagnostics"><summary>Advanced diagnostics/);
assert.match(css,/object-fit:contain/);assert.match(css,/100dvh/);assert.ok(!css.includes('.workflow-panel{position:fixed'));
console.log('PASS integrated workflows: two paths, embedded scanner/code/Connect/status, direct QR/code, Change without session recreation, cleanup, permission errors, invalid QR, explicit and scanned JOIN, mobile gate and desktop regression.');

// Terminology changes must leave the existing code-only Copy/Share payload intact.
assert.match(html,/id="copyCode">Copy connection link<\/button>/);
assert.match(html,/id="shareCode" hidden>Share connection link<\/button>/);
assert.equal((html.match(/>Back<\/button>/g)||[]).length,2);
assert.ok(html.includes('Connection code'));
assert.ok(!/>[^<]*(?:pairing code|pairing link|Change)[^<]*</i.test(html));
assert.ok(fs.readFileSync('webrtc-receiver.js','utf8').includes('Waiting for another device...'));
(async()=>{
 const copy=page(),copied=[],shared=[];
 copy.run('(nav)=>{globalThis.navigator=nav;}')({clipboard:{writeText:async value=>copied.push(value)},share:async value=>shared.push(value)});
 copy.run("active.phase='waiting';el('createdCode').textContent='7K4M2Q';");
 await copy.nodes.get('copyCode').onclick();await copy.nodes.get('shareCode').onclick();
 assert.deepEqual(copied,['7K4M2Q']);assert.equal(shared.length,1);assert.equal(shared[0].title,'Screen Share');assert.equal(shared[0].text,'7K4M2Q');
 copy.fire('pagehide');console.log('PASS connection terminology and unchanged Copy/Share payloads.');
})().catch(error=>{console.error(error);process.exitCode=1;});
