/* GOOSE 07: real Chromium acceptance; synthetic GM, no private media or RPC. */
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const port=9271,chrome=process.env.CHROME_BIN||'google-chrome';
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-gpu','--no-first-run','--hide-scrollbars','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--user-data-dir=/tmp/goose07-'+process.pid,
  '--window-size=1100,1200','about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<120;i++){try{
   const res=await fetch('http://127.0.0.1:'+port+'/json/list');
   if(res.ok){page=(await res.json()).find(p=>p.type==='page'&&p.webSocketDebuggerUrl);if(page)break;}
  }catch{}await wait(100);}
  if(!page)throw Error('CHROMIUM_UNAVAILABLE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  let n=0;const pending=new Map();
  ws.addEventListener('message',ev=>{let data;try{data=JSON.parse(String(ev.data));}catch{return;}
   const p=pending.get(data.id);if(!p)return;pending.delete(data.id);
   data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async(expression)=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('BROWSER_JS_'+JSON.stringify(r.exceptionDetails).slice(0,500));
   return r.result?.value;
  };
  const until=async(expression,name)=>{
   for(let i=0;i<220;i++){if(await evaluate(expression))return;await wait(75);}
   throw Error('TIMEOUT_'+name+' '+JSON.stringify(await evaluate('window.goose05?.status')));
  };
  const output='tests/visual-regressions/goose07';
  fs.mkdirSync(output,{recursive:true});
  const capture=async name=>{
   const r=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   const path=output+'/'+name+'.png';fs.writeFileSync(path,Buffer.from(r.data,'base64'));
   if(fs.statSync(path).size<14000)throw Error('TINY_SCREENSHOT_'+name);
   console.log('GOOSE07_SCREENSHOT',path);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/goose05-unified.html'});
  await until('window.goose05?.status.loaded && window.goose05.status.gateOpen','initial_open');
  await until("[...document.querySelectorAll('.goose-player-door > img,.goose-player-seal > img')].length===3 && [...document.querySelectorAll('.goose-player-door > img,.goose-player-seal > img')].every(i=>i.complete&&i.naturalWidth>0)",'asset_load');
  const init=await evaluate("({gems:document.querySelectorAll('.goose-player-sapphire').length,old:document.querySelectorAll('.goose-player-lamp').length,published:window.goose05.status.publishedCalls})");
  if(init.gems!==6||init.old!==0||init.published)throw Error('WRONG_SAPPHIRE_MARKUP '+JSON.stringify(init));
  await evaluate("document.getElementById('frodoGooseTestClose').click()");
  await until("document.getElementById('frodoGooseTestStatus').textContent==='Luckorna stängda.'",'closed');
  const geometry=await evaluate("(()=>{const r=document.querySelector('.goose-player-shutter').getBoundingClientRect();const result={};for(const name of ['north','east','south','west']){result[name]=[...document.querySelectorAll('.goose-player-sapphire--'+name)].map(e=>{const b=e.getBoundingClientRect();return [(b.left+b.width/2-r.left)/r.width,(b.top+b.height/2-r.top)/r.height]})};return {result,stage:document.querySelector('.goose-player-shutter').dataset.unlockedLocks,lit:document.querySelectorAll('.goose-player-sapphire.is-lit').length}})()");
  const targets={north:[.5,.09],east:[.829,.495],south:[.5,.902],west:[.178,.495]};
  for(const [name,xy] of Object.entries(targets)){
   const points=geometry.result[name],length=name==='north'||name==='south'?2:1;
   if(points.length!==length||points.some(p=>Math.abs(p[0]-xy[0])>.015||Math.abs(p[1]-xy[1])>.015))throw Error('SAPPHIRE_ALIGNMENT_'+name+' '+JSON.stringify(points));
  }
  if(geometry.stage!=='0'||geometry.lit!==0)throw Error('CLOSED_GLOW '+JSON.stringify(geometry));
  await capture('01-closed');
  await evaluate("document.getElementById('frodoGooseTestOpen').click()");
  const observed=new Set();
  for(let i=0;i<230;i++){
   const state=await evaluate("(()=>{const n=Number(document.querySelector('.goose-player-shutter').dataset.unlockedLocks);return {n,lit:['north','east','south','west'].map(k=>[...document.querySelectorAll('.goose-player-sapphire--'+k)].every(s=>s.classList.contains('is-lit'))),published:window.goose05.status.publishedCalls}})()");
   if(state.published)throw Error('PUBLISHED');
   if(state.n>=1&&state.n<=4&&!observed.has(state.n)){
    if(state.lit.some((v,j)=>v!==(j<state.n)))throw Error('OUT_OF_ORDER '+JSON.stringify(state));
    console.log('GOOSE07_LOCK',state.n);
    observed.add(state.n);
    if(state.n===4)await capture('02-four-sapphires-lit');
   }
   if(observed.size===4)break;
   await wait(60);
  }
  if(observed.size!==4)throw Error('MISSING_LOCK_STEPS '+JSON.stringify([...observed]));
  await until('window.goose05.status.gateOpen','reopened');
  await capture('03-open');
  if(await evaluate('window.goose05.status.publishedCalls'))throw Error('OPEN_PUBLISHED');
  console.log('GOOSE07_BROWSER_PASS',JSON.stringify({geometry:geometry.result,steps:[...observed]}));
 }finally{try{ws?.close();}catch{}browser.kill('SIGTERM');}
}
main().catch(err=>{console.error(err);process.exitCode=1});
