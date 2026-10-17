/* GOOSE 05: validate actual Frodo + one shared gallery, visible GM admin.
 * Entire session and image content are synthetic, zero production API.
 */
const fs=require('node:fs');const {spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const chrome=process.env.CHROME_BIN||'google-chrome',port=9247;
async function main(){
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--disable-gpu','--disable-background-networking','--no-first-run',
 '--hide-scrollbars','--remote-allow-origins=*','--remote-debugging-port='+port,
 '--user-data-dir=/tmp/alea-goose05-'+process.pid,'--window-size=1000,1130','about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<110;i++){try{
   const r=await fetch('http://127.0.0.1:'+port+'/json/list');
   if(r.ok){page=(await r.json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl);if(page)break;}
  }catch(_){}await delay(110);}
  if(!page)throw Error('CHROME_UNAVAILABLE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  let n=0;const pending=new Map();
  ws.addEventListener('message',ev=>{let data;try{data=JSON.parse(String(ev.data));}catch{return}
   const p=pending.get(data.id);if(!p)return;pending.delete(data.id);
   data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('EVALUATION_FAILED '+JSON.stringify(r.exceptionDetails));
   return r.result?.value;}
  async function until(expression,name){
   for(let i=0;i<110;i++){if(await evaluate(expression))return;await delay(90)}
   throw Error('TIMEOUT_'+name+' '+JSON.stringify(await evaluate('window.goose05?.status')))
  }
  fs.mkdirSync('tests/visual-regressions/goose05',{recursive:true});
  async function shot(name){
   const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   fs.writeFileSync('tests/visual-regressions/goose05/'+name+'.png',Buffer.from(r.data,'base64'));
   console.log('GOOSE05_SHOT',name,JSON.stringify(await evaluate('window.goose05.status')));
  }
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/goose05-unified.html'});
  await until('window.goose05?.status.loaded && window.goose05.status.gateOpen','gm-ready');
  const status=await evaluate('window.goose05.status');
  if(status.galleryCount!==1||status.obsoleteCount!==0||!status.adminVisible||!status.galleryVisible||status.queueTiles!==2)
   throw Error('GOOSE05_MISSING_SHARED_VIEW '+JSON.stringify(status));
  if(status.publishedCalls)throw Error('PUBLISHED_DURING_MOUNT');
  await delay(250);await shot('gm-desktop');
  await evaluate("document.querySelectorAll('[data-frodo-id]')[1].click()");
  if(await evaluate("window.goose05.status.publishedCalls"))throw Error('QUEUE_SELECTION_PUBLISHED');
  if((await evaluate("window.goose05.status.selected"))!==status.selected)throw Error('STAGING_CHANGED_LIVE');
  await send('Emulation.setDeviceMetricsOverride',{width:420,height:920,deviceScaleFactor:1,mobile:true});
  await delay(700);await shot('gm-mobile');
  console.log('GOOSE05_UNIFIED_VISUAL_PASS');
 }finally{try{ws?.close()}catch(_){}browser.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1});
