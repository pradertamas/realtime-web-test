'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {versionHtml}=require('./update-receiver-release.cjs');
const {version}=require('./receiver-release.json'),html=fs.readFileSync('webrtc-receiver.html','utf8');
assert.match(version,/^[A-Za-z0-9_-]+$/);assert.equal(versionHtml(html,version),html,'Run node update-receiver-release.cjs');
const own=[];
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const url=new URL(ref,'https://release.test/');assert.equal(url.origin,'https://release.test');
  const file=url.pathname.slice(1);assert.ok(fs.existsSync(file),file);
  if(file.startsWith('vendor/'))continue;
  if(/\.(js|css)$/.test(file)){assert.equal(url.search,'?v='+version,ref);own.push(file);}
}
for(const required of ['style.css','receiver-ui.css','pairing.js','qr-tools.js','webrtc-receiver.js','remote-link.js','auto-pairing.js'])assert.ok(own.includes(required),required);
const next=versionHtml(html,version+'-next');assert.notEqual(next,html);
assert.equal(versionHtml(next,version),html);assert.equal(versionHtml(html,version),html);
assert.ok(!/Date\.now|Math\.random/.test(fs.readFileSync('update-receiver-release.cjs','utf8')));
console.log('PASS receiver cache version: all own critical JS/CSS versioned, pinned vendors unchanged, single source, deterministic/idempotent release update.');
