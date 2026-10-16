'use strict';
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {Pairing:p}=require('./pairing.js'),{QrTools}=require('./qr-tools.js');
const qrcode=require('./vendor/qrcode-generator-2.0.4.js'),jsQR=require('./vendor/jsqr-1.4.0.js');
for(let i=0;i<100;i++){const code=p.generate(webcrypto);assert.equal(p.normalize(code),code);assert.equal(code.length,6);}
let called=false;const code=p.generate({getRandomValues(bytes){called=true;for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}});assert.ok(called);assert.equal(code,'234567');
assert.equal(p.parseQr(' 7k4m2q '),'7K4M2Q');assert.equal(p.parseQr(p.receiverUrl('7K4M2Q')),'7K4M2Q');
for(const bad of ['https://evil.example/?session=7K4M2Q',p.receiverUrl('7K4M2Q')+'&session=AAAAAA',p.receiverUrl('7K4M2Q')+'#x','javascript:alert(1)','7K4M2O'])assert.equal(p.parseQr(bad),null);
// Actual locally vendored generator -> decoder, including quiet zone, no canvas package.
const qr=qrcode(0,'M');qr.addData(p.receiverUrl('7K4M2Q'));qr.make();const cells=qr.getModuleCount(),step=6,size=(cells+8)*step,data=new Uint8ClampedArray(size*size*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){const row=Math.floor(y/step)-4,col=Math.floor(x/step)-4;const dark=row>=0&&col>=0&&row<cells&&col<cells&&qr.isDark(row,col);const offset=(y*size+x)*4;data[offset]=data[offset+1]=data[offset+2]=dark?0:255;data[offset+3]=255;}
assert.equal(p.parseQr(jsQR(data,size,size).data),'7K4M2Q');
const video=()=>({srcObject:null,videoWidth:0,play:async()=>{},pause(){}});
(async()=>{
 let stopped=0,resolvePermission;const stream={getTracks:()=>[{stop(){stopped++;}}]};
 const scanner=new QrTools.CameraScanner({video:video(),canvas:{},mediaDevices:{getUserMedia:()=>new Promise(resolve=>resolvePermission=resolve)},onPayload(){throw Error('Cancelled scan delivered a payload');},onError(){throw Error('Cancelled scan delivered error');}});
 const pending=scanner.start();scanner.stop();resolvePermission(stream);await pending;assert.equal(stopped,1);assert.equal(scanner.stream,null);
 let payload,errors=[];class Detector{static async getSupportedFormats(){return ['qr_code'];}async detect(){return [{rawValue:'7K4M2Q'}];}}
 const success=new QrTools.CameraScanner({video:video(),canvas:{},mediaDevices:{getUserMedia:async()=>stream},nativeDetector:Detector,onPayload:value=>payload=value,onError:msg=>errors.push(msg)});
 await success.start();assert.equal(payload,'7K4M2Q');assert.equal(success.stream,null);assert.equal(stopped,2);
 const denied=new QrTools.CameraScanner({video:video(),canvas:{},mediaDevices:{getUserMedia:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});}},onError:msg=>errors.push(msg)});await denied.start();assert.match(errors[0],/permission denied/);
 let requests=0;const fallback=new QrTools.CameraScanner({video:video(),canvas:{},nativeDetector:Detector,mediaDevices:{getUserMedia:async()=>{if(++requests===1)throw Object.assign(Error(),{name:'OverconstrainedError'});return stream;}},onPayload(){},onError:msg=>errors.push(msg)});await fallback.start();assert.equal(requests,2);assert.equal(stopped,3);
 assert.equal(errors.length,1);
 console.log('PASS QR/create/join helpers: Web Crypto code generation, exact alphabet, URL/raw parsing, invalid payloads, real local generator/decoder round trip, cancellation during permission, success cleanup, permission denial and laptop camera fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
