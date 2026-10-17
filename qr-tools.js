/* Local QR-only camera processing. No uploads or media-peer camera tracks. */
(function(root){
  'use strict';
  function render(element,payload){
    const qr=qrcode(0,'M');qr.addData(payload);qr.make();
    const cell=6,border=4,count=qr.getModuleCount(),size=(count+border*2)*cell;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    canvas.setAttribute('aria-label','Connection QR code');canvas.setAttribute('role','img');
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);ctx.fillStyle='#000';
    for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))ctx.fillRect((x+border)*cell,(y+border)*cell,cell,cell);
    element.replaceChildren(canvas);
  }
  function stopTracks(stream){stream?.getTracks().forEach(track=>track.stop());}
  class CameraScanner {
    constructor({video,canvas,onPayload,onError,mediaDevices,nativeDetector}={}){
      Object.assign(this,{video,canvas,onPayload,onError});
      this.mediaDevices=mediaDevices??globalThis.navigator?.mediaDevices;
      this.Detector=nativeDetector??globalThis.BarcodeDetector;
      this.generation=0;this.stream=null;this.timer=null;
    }
    stop(){this.generation++;clearTimeout(this.timer);this.timer=null;stopTracks(this.stream);this.stream=null;this.video.pause?.();this.video.srcObject=null;if(this.canvas){this.canvas.width=0;this.canvas.height=0;}}
    async start(){
      this.stop();const run=this.generation;
      try{
        if(!this.mediaDevices?.getUserMedia)throw Error('unavailable');
        let stream;
        try{stream=await this.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});}
        catch(error){if(!['OverconstrainedError','NotFoundError'].includes(error.name))throw error;stream=await this.mediaDevices.getUserMedia({video:true,audio:false});}
        if(run!==this.generation){stopTracks(stream);return;}
        this.stream=stream;this.video.srcObject=stream;await this.video.play();
        if(run!==this.generation)return;
        let detector=null;
        if(this.Detector)try{const supported=await this.Detector.getSupportedFormats();if(supported.includes('qr_code'))detector=new this.Detector({formats:['qr_code']});}catch{}
        const loop=async()=>{
          if(run!==this.generation)return;
          try{
            let payload=null;
            if(detector)try{const hits=await detector.detect(this.video);payload=hits[0]?.rawValue;}catch{detector=null;}
            if(run!==this.generation)return;
            if(!payload && this.video.videoWidth && typeof jsQR==='function'){
              const scale=Math.min(1,640/this.video.videoWidth);this.canvas.width=Math.round(this.video.videoWidth*scale);this.canvas.height=Math.round(this.video.videoHeight*scale);
              const ctx=this.canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.video,0,0,this.canvas.width,this.canvas.height);
              const pixels=ctx.getImageData(0,0,this.canvas.width,this.canvas.height);
              payload=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data;
            }
            if(run!==this.generation)return;
            if(payload){this.stop();this.onPayload(payload);return;}
          }catch{if(run===this.generation){this.stop();this.onError('Camera is not available. Enter the connection code instead.');}return;}
          this.timer=setTimeout(loop,200);
        };
        await loop();
      }catch(error){if(run===this.generation){this.stop();this.onError(error.name==='NotAllowedError'?'Camera permission denied. Enter the connection code instead.':'Camera is not available. Enter the connection code instead.');}}
    }
  }
  root.QrTools={render,stopTracks,CameraScanner};
})(typeof module!=='undefined'&&module.exports?module.exports:globalThis);
