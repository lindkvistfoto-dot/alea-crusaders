/* Browser smoke for the real GM/player gallery components and CSS.
 * Uses synthetic images and mocked auth roles only; NO production Supabase access.
 */
const {spawn}=require('node:child_process');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=9231;
const chrome=process.env.CHROME_BIN||'google-chrome';
async function main(){
 const browser=spawn(chrome,[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--no-first-run','--hide-scrollbars',
  '--remote-allow-origins=*','--remote-debugging-port='+port,
  '--user-data-dir=/tmp/alea-arcane-role-'+process.pid,
  '--window-size=850,950','about:blank'
 ],{stdio:'ignore'});
 let ws;
 try{
  let page;
  for(let i=0;i<90;i++){
   try{
    const response=await fetch('http://127.0.0.1:'+port+'/json/list');
    if(response.ok){
     const tabs=await response.json();
     page=tabs.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
     if(page)break;
    }
   }catch(_){}
   await delay(100);
  }
  if(!page)throw Error('CHROME_NOT_READY');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('CHROME_WS_TIMEOUT')),6000);
   ws.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('CHROME_WS_FAILED'));},{once:true});
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
  const evaluate=async(expression)=>{
   const r=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(r.exceptionDetails)throw Error('EVALUATION_FAILED '+JSON.stringify(r.exceptionDetails));
   return r.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4173/tests/fixtures/arcane-gallery-role-smoke.html'});
  for(let i=0;i<150;i++){
   const status=await evaluate("document.documentElement?.dataset?.smoke || ''");
   if(status==='passed'){
    const result=await evaluate('window.__arcaneSmokeStatus');
    console.log('ARCANE_ROLE_SMOKE_PASSED',JSON.stringify(result));
    return;
   }
   if(status==='failed'){
    const result=await evaluate('window.__arcaneSmokeStatus');
    throw Error('ARCANE_ROLE_SMOKE_FAILED '+JSON.stringify(result));
   }
   await delay(120);
  }
  throw Error('ROLE_SMOKE_TIMEOUT '+await evaluate("document.querySelector('#result')?.textContent || document.body.innerText.slice(0,500)"));
 }finally{
  try{ws?.close();}catch(_){}
  browser.kill('SIGTERM');
 }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
