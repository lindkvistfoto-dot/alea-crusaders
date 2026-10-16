/* Capture the real CSS motion of the HERMES mechanical gallery through Chrome CDP.
 * Only the public synthetic animation fixture is loaded, never a private image.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=9227;
const output=path.resolve('tests/visual-regressions/arcane-morph-frames');
const chrome=process.env.CHROME_BIN||'google-chrome';

async function main(){
 fs.mkdirSync(output,{recursive:true});
 const processChrome=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--no-first-run','--hide-scrollbars',
  '--remote-allow-origins=*','--remote-debugging-port='+port,
  '--user-data-dir=/tmp/alea-arcane-cdp-'+process.pid,
  '--window-size=480,900','about:blank'
 ],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<70;i++){
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/json/list');
    if(response.ok){
     const tabs=await response.json();
     page=tabs.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
     if(page)break;
    }
   }catch(_){}
   await delay(120);
  }
  if(!page)throw Error('CHROME_CDP_NOT_READY');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('WEBSOCKET_TIMEOUT')),6000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WEBSOCKET_FAILED'))},{once:true});
  });
  let serial=0;
  const pending=new Map();
  ws.addEventListener('message',event=>{
   let message;
   try{message=JSON.parse(String(event.data));}catch{return;}
   if(!pending.has(message.id))return;
   const {resolve,reject}=pending.get(message.id);
   pending.delete(message.id);
   if(message.error)reject(Error(JSON.stringify(message.error)));
   else resolve(message.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++serial;pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async(expression,awaitPromise=false)=>{
   const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});
   if(result.exceptionDetails)throw Error('EVALUATE_FAILED: '+JSON.stringify(result.exceptionDetails).slice(0,500));
   return result.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/arcane-gallery-animation.html'});
  let ready=false;
  for(let i=0;i<80;i++){
   try{
    if(await evaluate("typeof window.arcanePreviewSetFormat === 'function' && document.querySelectorAll('.arcane-kit-wheel').length === 2")){
     ready=true;break;
    }
   }catch(_){}
   await delay(130);
  }
  if(!ready)throw Error('FRAME_FIXTURE_NOT_READY');
  await evaluate('window.arcanePreviewSetFormat(0)',true);
  await delay(560);
  let frame=0;
  async function shot(){
   const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!result.data)throw Error('EMPTY_CDP_SCREENSHOT');
   fs.writeFileSync(path.join(output,String(frame++).padStart(3,'0')+'.png'),Buffer.from(result.data,'base64'));
  }
  for(let i=0;i<4;i++)await shot();
  for(const index of [1,2,3,2,1,0]){
   await evaluate('window.arcanePreviewSetFormat('+index+')',true);
   for(let i=0;i<7;i++){
    await delay(65);
    await shot();
   }
   if(index===3||index===0){
    for(let j=0;j<3;j++)await shot();
   }
  }
  if(frame<30)throw Error('NOT_ENOUGH_FRAMES');
  console.log('ARCANE_ANIMATION_CDP_CAPTURED',frame,output);
 }finally{
  try{ws?.close()}catch(_){}
  processChrome.kill('SIGTERM');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
