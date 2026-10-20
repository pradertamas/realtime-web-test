'use strict';
const node=id=>document.getElementById(id);
const client=new ConnectionRequest.Client({storage:{getItem:key=>window.sessionStorage.getItem(key),setItem:(key,value)=>window.sessionStorage.setItem(key,value)},
 media:options=>ConnectionRequestMedia.create(options,{video:node('video')}),
 view:view=>{node('status').textContent=view.message;node('accept').hidden=!view.accept;node('retry').hidden=!view.retry;node('stop').hidden=!view.stop;
  node('video').hidden=!['CONNECTING','STREAMING'].includes(view.state);node('play').hidden=view.state!=='STREAMING'&&view.state!=='CONNECTING';}
});
node('accept').onclick=()=>client.accept();node('retry').onclick=()=>client.retry();node('stop').onclick=()=>client.stop();
node('play').onclick=()=>node('video').play().catch(()=>{});
function openRequest(){if(location.search){client.open('');return;}client.open(location.hash);}
window.addEventListener('hashchange',openRequest);
window.addEventListener('pagehide',()=>client.stop(client.current,false));
// BFCache restores no native session: revalidate the exact saved request on return.
window.addEventListener('pageshow',event=>{if(event.persisted)openRequest();});
openRequest();
