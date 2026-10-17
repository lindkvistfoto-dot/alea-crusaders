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
  if(summary.channels!==4||summary.rods!==4||summary.gearPanels!==0||summary.published)
   throw Error('WRONG_LAYER_SET '+JSON.stringify(summary));
  await evaluate("document.getElementById('frodoGooseTestClose').click()");
  await until("document.getElementById('frodoGooseTestStatus').textContent==='Luckorna stängda.'",'closed');
  await capture('01-closed');
  await evaluate("document.getElementById('frodoGooseTestOpen').click()");
  await until("document.querySelector('.goose-player-shutter--energizing-left')!==null",'left_pulse_first_click');
  const first=await evaluate("({locks:document.querySelector('.goose-player-shutter').dataset.unlockedLocks,left:!!document.querySelector('.goose-player-shutter--energizing-left'),right:!!document.querySelector('.goose-player-shutter--energizing-right'),rods:!!document.querySelector('.goose-player-shutter--unlatched-left'),published:window.goose05.status.publishedCalls})");
  if(first.locks!=='1'||!first.left||first.right||first.rods||first.published)
   throw Error('LEFT_PHASE_ORDER '+JSON.stringify(first));
  await capture('02-left-pulse-first-click');
  await until("document.querySelector('.goose-player-shutter--unlatched-left')!==null",'left_piston_after_pulse');
  await capture('03-left-pistons-after-arrival');
  await until("document.querySelector('.goose-player-shutter--energizing-right')!==null",'right_pulse_third_click');
  const third=await evaluate("({locks:document.querySelector('.goose-player-shutter').dataset.unlockedLocks,left:!!document.querySelector('.goose-player-shutter--unlatched-left'),right:!!document.querySelector('.goose-player-shutter--energizing-right'),rightRods:!!document.querySelector('.goose-player-shutter--unlatched-right')})");
  if(third.locks!=='3'||!third.left||!third.right||third.rightRods)
   throw Error('RIGHT_PHASE_ORDER '+JSON.stringify(third));
  await capture('04-right-pulse-third-click');
  await until("document.querySelector('.goose-player-shutter--unlatched-right')!==null",'right_piston_after_pulse');
  await capture('05-right-pistons-after-arrival');
  await until("document.querySelector('.goose-player-shutter--split')!==null",'physical_split');
  await capture('06-gate-travel');
  await until("window.goose05.status.gateOpen",'opened');
  await capture('07-open');
  if(await evaluate('window.goose05.status.publishedCalls'))throw Error('UNAUTHORIZED_PUBLISH');
  // Also open the public standalone simulation exactly as an external visitor.
  await send('Page.navigate',{url:'http://127.0.0.1:4173/goose08.html'});
  await until("window.goose08Demo?.ready===true && window.goose08Demo.phase==='closed'",'standalone_ready');
  await capture('08-public-preview-closed');
  await evaluate("document.getElementById('openBtn').click()");
  await until("window.goose08Demo?.phase==='open'",'standalone_opens');
  await capture('09-public-preview-open');
  await evaluate("document.getElementById('closeBtn').click()");
  await until("window.goose08Demo?.phase==='closed'",'standalone_closes');
  const status=await evaluate("({text:document.getElementById('status').textContent,ready:window.goose08Demo.ready,controls:document.querySelectorAll('.control-panel button').length})");
  if(!status.ready||status.controls!==2)throw Error('STANDALONE_CONTROLS '+JSON.stringify(status));
  console.log('GOOSE09_STANDALONE_PASS '+JSON.stringify(status));
  // Confirm that the shareable CDN URL resolves to the committed public page.
  // This is a public static page: no cookies or private content are requested.
  const base='https://raw.githack.com/lindkvistfoto-dot/alea-crusaders/goose08-simulator/';
  const checks=[
    ['goose08.html','The Awakening Mechanism','text/html'],
    ['features/material/goose-player-shutter.js','createGoosePlayerShutter','javascript'],
    ['features/material/goose04/seal.webp',null,'image/webp']
  ];
  for(const [path,marker,mime] of checks){
   const response=await fetch(base+path,{signal:AbortSignal.timeout(18000)});
   const type=response.headers.get('content-type')||'';
   if(!response.ok||!type.includes(mime))throw Error('PUBLIC_SIMULATOR_CDN '+path+' '+response.status+' '+type);
   if(marker&&!(await response.text()).includes(marker))
    throw Error('PUBLIC_SIMULATOR_CONTENT '+path);
   console.log('GOOSE09_PUBLIC_CDN_PASS '+path+' '+response.status+' '+type);
  }
  console.log('GOOSE09_BROWSER_PASS '+JSON.stringify(summary));
 }finally{try{ws?.close()}catch{}browser.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1});
