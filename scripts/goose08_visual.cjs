/* GOOSE 08 real-Chromium acceptance, synthetic GM, no private data or RPC. */
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const port=9288,chrome=process.env.CHROME_BIN||'chromium';
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-gpu','--no-first-run','--hide-scrollbars','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--user-data-dir=/tmp/goose08-'+process.pid,
  '--window-size=1100,1200','about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<180;i++){try{
   const res=await fetch('http://127.0.0.1:'+port+'/json/list');
   if(res.ok){page=(await res.json()).find(x=>x.type==='page'&&x.webSocketDebuggerUrl);if(page)break}
  }catch{}await wait(100)}
  if(!page)throw Error('CHROMIUM_UNAVAILABLE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});
   ws.addEventListener('error',reject,{once:true})});
  let n=0;const pending=new Map();
  ws.addEventListener('message',event=>{let data;try{data=JSON.parse(String(event.data))}catch{return}
   const p=pending.get(data.id);if(!p)return;pending.delete(data.id);
   data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('BROWSER_JS '+JSON.stringify(r.exceptionDetails).slice(0,500));
   return r.result?.value;
  };
  const until=async(expression,stage)=>{
   for(let i=0;i<360;i++){if(await evaluate(expression))return;await wait(50)}
   throw Error('TIMEOUT_'+stage+' '+JSON.stringify(await evaluate('window.goose05?.status')));
  };
  const output='tests/visual-regressions/goose08';
  fs.mkdirSync(output,{recursive:true});
  const capture=async name=>{
   const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   const path=output+'/'+name+'.png';fs.writeFileSync(path,Buffer.from(r.data,'base64'));
   if(fs.statSync(path).size<14000)throw Error('TINY_SCREENSHOT_'+name);
   console.log('GOOSE08_SCREENSHOT '+path);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/goose05-unified.html'});
  await until('window.goose05?.status.loaded && window.goose05.status.gateOpen','initial_open');
  await until("[...document.querySelectorAll('.goose-player-door > img,.goose-player-seal > img')].length===3 && [...document.querySelectorAll('.goose-player-door > img,.goose-player-seal > img')].every(i=>i.complete&&i.naturalWidth>0)",'original_art');
  const summary=await evaluate("({channels:document.querySelectorAll('.goose-player-energy-flow').length,rods:document.querySelectorAll('.goose-player-piston').length,gearPanels:document.querySelectorAll('.goose-player-gear-train').length,published:window.goose05.status.publishedCalls})");
  if(summary.channels!==4||summary.rods!==4||summary.gearPanels!==3||summary.published)
   throw Error('WRONG_LAYER_SET '+JSON.stringify(summary));
  await evaluate("document.getElementById('frodoGooseTestClose').click()");
  await until("document.getElementById('frodoGooseTestStatus').textContent==='Luckorna stängda.'",'closed');
  await capture('01-closed');
  await evaluate("document.getElementById('frodoGooseTestOpen').click()");
  await until("document.querySelector('.goose-player-shutter--energizing')!==null",'energy');
  const energy=await evaluate("({locks:document.querySelector('.goose-player-shutter').dataset.unlockedLocks,released:!!document.querySelector('.goose-player-shutter--unlatched'),published:window.goose05.status.publishedCalls})");
  if(energy.locks!=='4'||energy.released||energy.published)
   throw Error('ENERGY_ORDER '+JSON.stringify(energy));
  await capture('02-energy-charging');
  await until("document.querySelector('.goose-player-shutter--unlatched')!==null",'bolts');
  await wait(190);
  await capture('03-rods-retracted');
  await until("document.querySelector('.goose-player-shutter--split')!==null",'physical_split');
  await capture('04-gate-travel');
  await until("window.goose05.status.gateOpen",'opened');
  await capture('05-open');
  if(await evaluate('window.goose05.status.publishedCalls'))throw Error('UNAUTHORIZED_PUBLISH');
  console.log('GOOSE08_BROWSER_PASS '+JSON.stringify(summary));
 }finally{try{ws?.close()}catch{}browser.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1});
