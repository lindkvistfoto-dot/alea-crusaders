/* Synthetic desktop / mobile Chromium proof with real ARCANE IVORY assets.
 * No credentials, Supabase calls, production publishing or campaign data.
 */
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const port=9291,chrome=process.env.CHROME_BIN||'chromium';
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-gpu','--no-first-run','--hide-scrollbars','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--user-data-dir=/tmp/alea-art-viewer-'+process.pid,
  '--window-size=1500,1300','about:blank'],{stdio:'ignore'});
 let socket;
 try{
  let page;
  for(let i=0;i<120;i++){
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/json/list');
    if(response.ok){page=(await response.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(page)break}
   }catch{}
   await wait(100);
  }
  if(!page)throw Error('CHROMIUM_NOT_AVAILABLE');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});
  });
  let id=0;const callbacks=new Map();
  socket.addEventListener('message',event=>{
   let parsed;try{parsed=JSON.parse(String(event.data))}catch{return}
   const cb=callbacks.get(parsed.id);if(!cb)return;
   callbacks.delete(parsed.id);
   parsed.error?cb.reject(Error(JSON.stringify(parsed.error))):cb.resolve(parsed.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const key=++id;callbacks.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}));
  });
  const evalJs=async expression=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('BROWSER_JS '+JSON.stringify(r.exceptionDetails));
   return r.result?.value;
  };
  const until=async(expression,stage)=>{
   for(let i=0;i<130;i++){
    if(await evalJs(expression))return;
    await wait(90);
   }
   throw Error('TIMEOUT_'+stage);
  };
  const output='tests/visual-regressions/combat-art-viewer';
  fs.mkdirSync(output,{recursive:true});
  const capture=async name=>{
   const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
   const path=output+'/'+name+'.png';fs.writeFileSync(path,Buffer.from(result.data,'base64'));
   if(fs.statSync(path).size<13000)throw Error('SCREENSHOT_TOO_SMALL_'+name);
   console.log('COMBAT_ART_VIEWER_SCREENSHOT '+path);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1180,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/combat-art-viewer-desktop.html'});
  await until('window.aleaDesktopGalleryFixture?.ready','ready');
  if(!(await evalJs("getComputedStyle(document.getElementById('combatArtViewer')).display!=='none'")))
   throw Error('DESKTOP_GALLERY_MISSING');
  if(!(await evalJs("document.querySelector('.combat-participant-list').nextElementSibling.id==='galleryMount'")))
   throw Error('GALLERY_NOT_BELOW_ORDER');
  await capture('01-desktop-empty');
  await evalJs("document.getElementById('spellEld').click()");
  await until("document.querySelector('.combat-art-viewer-image').naturalWidth>0&&!document.querySelector('.combat-art-viewer-image').hidden",'eld_loaded');
  const details=await evalJs("({title:document.querySelector('.combat-art-viewer-title').textContent,url:document.querySelector('.combat-art-viewer-image').src,width:Math.round(document.querySelector('.combat-art-viewer-image').getBoundingClientRect().width),frameWidth:Math.round(document.querySelector('.combat-art-viewer-picture').getBoundingClientRect().width)})");
  if(details.title!=='ELD (F)'||!details.url.includes('/assets/spells/arcane-ivory/eld.webp')||details.width<150||details.frameWidth<160)
   throw Error('INVALID_LARGE_ICON '+JSON.stringify(details));
  await capture('02-desktop-eld-full');
  await evalJs("document.getElementById('spellVatten').click()");
  await until("document.querySelector('.combat-art-viewer-image').src.includes('finna-vatten.webp')&&!document.querySelector('.combat-art-viewer-image').hidden",'vatten_loaded');
  await capture('03-desktop-finna-vatten');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await wait(250);
  const mobile=await evalJs("({width:innerWidth,hidden:getComputedStyle(document.getElementById('combatArtViewer')).display==='none'})");
  if(!mobile.hidden)throw Error('MOBILE_GALLERY_SHOULD_BE_HIDDEN '+JSON.stringify(mobile));
  await capture('04-mobile-gallery-hidden');
  console.log('COMBAT_ART_VIEWER_BROWSER_PASS '+JSON.stringify({details,mobile,publications:0}));
 }finally{try{socket?.close()}catch{}browser.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1});
