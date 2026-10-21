/* Run `python -m http.server 4174 --bind 127.0.0.1` in the repo first.
 * This synthetic, database-free Chromium proof uses raw classic scripts.
 * Screenshots and the machine-readable result stay outside the Git checkout. */
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
 const port=9294,output='/tmp/astrid-paper-doll-proof';
 fs.mkdirSync(output,{recursive:true});
 const browser=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--hide-scrollbars','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--user-data-dir=/tmp/alea-paper-doll-'+process.pid,'about:blank'
 ],{stdio:'ignore'});
 let socket;
 try{
  let page;
  for(let i=0;i<100;i++){
   try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');if(page)break}catch{}
   await wait(100)
  }
  if(!page)throw Error('CHROMIUM_NOT_AVAILABLE');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  let id=0;const pending=new Map(),errors=[];
  socket.addEventListener('message',event=>{
   const data=JSON.parse(String(event.data));
   if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);
   const cb=pending.get(data.id);if(!cb)return;
   pending.delete(data.id);data.error?cb.reject(Error(JSON.stringify(data.error))):cb.resolve(data.result)
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});socket.send(JSON.stringify({id:key,method,params}))});
  const js=async expression=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
   return r.result?.value
  };
  const until=async expression=>{for(let i=0;i<100;i++){if(await js(expression))return;await wait(100)}throw Error('TIMEOUT '+expression+' '+JSON.stringify(errors))};
  const assert=(pass,message)=>{if(!pass)throw Error(message)};
  const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'webp',quality:90});fs.writeFileSync(output+'/'+name+'.webp',Buffer.from(r.data,'base64'))};
  const click=async(x,y,count=1)=>{
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:count});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:count})
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
  const url='http://127.0.0.1:4174/tests/fixtures/astrid-paper-doll.html';
  await send('Page.navigate',{url});await until('window.fixtureReady');
  assert(await js('!window.aleaAstridPaperDoll&&!document.querySelector(".combat-paper-doll-controls")'),'DEFAULT_NOT_CLASSIC');
  assert(await js('!performance.getEntriesByType("resource").some(r=>r.name.includes("astrid-paper-doll.webp"))'),'DEFAULT_LOADS_PILOT_IMAGE');
  const baseline=await js('document.querySelector(".combat-map-svg").outerHTML');
  await capture('desktop-classic');
  await send('Page.navigate',{url:url+'?arcanePaperDoll=1'});await until('window.fixtureReady');
  assert(await js('document.querySelector(".combat-map-svg").outerHTML')===baseline,'OPT_IN_CHANGED_DEFAULT_MAP');
  const before=await js(`({hit:document.querySelector('[data-token-id="astrid-battle"] .combat-mini-hit').outerHTML,lyra:document.querySelector('[data-token-id="lyra-battle"]').outerHTML,enemy:document.querySelector('[data-token-id="enemy-battle"]').outerHTML,data:JSON.stringify(combatants)})`);
  await js('document.querySelectorAll(".combat-paper-doll-controls button")[1].click()');
  await until('document.querySelectorAll(".combat-paper-doll-image").length===1');
  assert(await js(`document.querySelector('[data-token-id="astrid-battle"] .combat-mini-hit').outerHTML`)===before.hit,'HIT_GEOMETRY_CHANGED');
  assert(await js(`document.querySelector('[data-token-id="lyra-battle"]').outerHTML`)===before.lyra,'LYRA_CHANGED');
  assert(await js(`document.querySelector('[data-token-id="enemy-battle"]').outerHTML`)===before.enemy,'ENEMY_CHANGED');
  assert(await js('JSON.stringify(combatants)')===before.data,'COMBAT_DATA_CHANGED');
  await capture('desktop-paper-doll');
  const anchor=await js(`(()=>{const p=new DOMPoint(0,0).matrixTransform(document.querySelector('.combat-paper-doll').getScreenCTM());return{x:p.x,y:p.y}})()`);
  await click(anchor.x,anchor.y);
  assert(await js(`combatSelectedTargetId==='astrid-battle'&&!!document.querySelector('.combat-paper-doll.selected')`),'TOKEN_CLICK_FAILED');
  const overhang=await js(`(()=>{const p=new DOMPoint(0,-g.size*2).matrixTransform(document.querySelector('.combat-paper-doll').getScreenCTM());const e=document.elementFromPoint(p.x,p.y);return{tag:e?.tagName,token:!!e?.closest('.combat-token-group')}})()`);
  assert(!overhang.token,'TALL_ART_STEALS_NEIGHBOUR_CLICK');
  await js('attack=true;renderCombat()');
  assert(await js(`!!document.querySelector('.combat-paper-doll.attack-target')&&document.querySelectorAll('.combat-active-turn-badge').length===1`),'TARGET_OR_TURN_MISSING');
  await js(`planning=true;combatMovementPlan={combatantId:activeId,q:3,r:2};renderCombat()`);
  assert(await js(`!!document.querySelector('.combat-paper-doll.movement-planning')`),'MOVEMENT_STATE_MISSING');
  const destination=await js(`(()=>{const e=document.querySelector('.combat-movement-hit[data-q="3"][data-r="2"]'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await click(destination.x,destination.y);await click(destination.x,destination.y,2);
  assert(await js(`!planning&&combatants[0].q===3&&combatants[0].r===2`),'MOVEMENT_OVERLAY_DOUBLE_CLICK_FAILED');
  await capture('desktop-moved');
  await js('activeId="lyra-battle";renderCombat()');
  assert(await js(`!document.querySelector('[data-token-id="astrid-battle"] .combat-active-turn-badge')&&!!document.querySelector('[data-token-id="lyra-battle"] .combat-active-turn-badge')`),'TURN_CHANGE_FAILED');
  await js(`combatants[0].status='dead';renderCombat()`);
  assert(await js(`!document.querySelector('.combat-paper-doll-image')&&!!document.querySelector('[data-token-id="astrid-battle"] .combat-token-skull')`),'DEFEATED_FALLBACK_FAILED');
  await js(`combatants[0].status='active';combatants[0].q=2;attack=false;combatSelectedTargetId=null;activeId='astrid-battle';renderCombat()`);
  for(const width of [390,768]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});
   await capture('paper-doll-'+width);
   assert(await js('document.documentElement.scrollWidth<=innerWidth'),'HORIZONTAL_OVERFLOW_'+width)
  }
  await js('document.querySelectorAll(".combat-paper-doll-controls button")[0].click()');
  assert(await js('document.querySelector(".combat-map-svg").outerHTML')===baseline,'CLASSIC_NOT_RESTORED');
  assert(errors.length===0,'BROWSER_ERRORS '+JSON.stringify(errors));
  const result={passed:true,viewports:[1200,768,390],classicMapIdentical:true,otherActorsIdentical:true,hitGeometryIdentical:true,overhang,syntheticMovementOverlay:true,selection:true,turnChange:true,defeatedFallback:true,databaseCalls:0};
  fs.writeFileSync(output+'/result.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));console.log('Evidence: '+output)
 }finally{socket?.close();browser.kill('SIGTERM')}
}
main().catch(error=>{console.error(error);process.exitCode=1});
