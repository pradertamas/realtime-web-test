'use strict';
const fs=require('node:fs'),path=require('node:path');
function versionHtml(html,version){
  if(!/^[A-Za-z0-9_-]+$/.test(version))throw Error('Invalid release version');
  return html.replace(/((?:src|href)=")([^"?#]+)(?:\?[^"#]*)?(")/g,(all,start,file,end)=>{
    if(/^(?:https?:|data:|\/\/)/.test(file)||file.startsWith('vendor/')||!/\.(?:js|css)$/.test(file))return all;
    return start+file+'?v='+version+end;
  });
}
if(require.main===module){
  const file=path.join(__dirname,'webrtc-receiver.html');
  const {version}=require('./receiver-release.json');
  fs.writeFileSync(file,versionHtml(fs.readFileSync(file,'utf8'),version));
  console.log('Receiver asset URLs updated: '+version);
}
module.exports={versionHtml};
