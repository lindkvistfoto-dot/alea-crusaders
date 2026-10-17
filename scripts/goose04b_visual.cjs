/* Capture real published GOOSE artwork in an actual Chromium rendering.
 * The fixture uses synthetic artwork and fake session only.
 */
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const port=9239,chrome=process.env.CHROME_BIN||'google-chrome';
const base='tests/visual-regressions/goose04b';
async function main(){
 fs.mkdirSync(base,{recursive:true});
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
 '--disable-gpu','--disable-background-networking','--no-first-run',
 '--hide-scrollbars','--remote-allow-origins=*','--remote-debugging-port='+port,
 '--user-data-dir=/tmp/alea-goose-visual-'+process.pid,'--window-size=1000,1120','about:blank'],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<100;i++){try{
   const r=await fetch('http://127.0.0.1:'+port+'/json/list');
   if(r.ok){page=(await r.json()).find(p=>p.type==='page'&&p.webSocketDebuggerUrl);if(page)break;}
  }catch(_){}await delay(100);}
  if(!page)throw Error('CHROME_UNAVAILABLE');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   ws.addEventListener('open',resolve,{once:true});
   ws.addEventListener('error',reject,{once:true});
  });
  let n=0;const pending=new Map();
  ws.addEventListener('message',ev=>{let data;try{data=JSON.parse(String(ev.data));}catch{return}
   const p=pending.get(data.id);if(!p)return;
   pending.delete(data.id);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  async function evalJs(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('BROWSER_EVAL_FAILED '+JSON.stringify(r.exceptionDetails).slice(0,400));
   return r.result?.value;}
  async function until(expression,name){
   for(let i=0;i<100;i++){if(await evalJs(expression))return;await delay(80);}
   throw Error('TIMED_OUT_'+name+' '+JSON.stringify(await evalJs('window.gooseDemo?.snapshot')));
  }
  async function shot(name){
   const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});
   const file=base+'/'+name+'.png';fs.writeFileSync(file,Buffer.from(r.data,'base64'));
   if(fs.statSync(file).size<15000)throw Error('TINY_SCREENSHOT_'+name);
   console.log('GOOSE_CAPTURE',name,await evalJs('window.gooseDemo.snapshot'));
  }
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/goose04b-visual.html'});
  await until('!!window.gooseDemo?.snapshot.gate','loaded');
  await delay(250);await shot('desktop-01-closed');
  await evalJs('window.gooseDemo.releaseFirst()');
  await delay(260);await shot('desktop-02-sigil-retreat');
  await delay(450);await shot('desktop-03-opening');
  await until("document.querySelector('.goose-player-shutter--open')!==null",'open');
  await delay(700);await shot('desktop-04-open');
  await evalJs('window.gooseDemo.next()');
  await until("window.gooseDemo.snapshot.selected.endsWith('2') && window.gooseDemo.snapshot.frame>700",'portrait');
  await delay(650);await shot('desktop-05-portrait');
  await send('Emulation.setDeviceMetricsOverride',{width:420,height:920,deviceScaleFactor:1,mobile:true});
  await delay(500);await shot('mobile-06-portrait');
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('GOOSE_VISUAL_DONE');
 }finally{try{ws?.close()}catch(_){}browser.kill('SIGTERM');}
}
main().catch(e=>{console.error(e);process.exitCode=1});
