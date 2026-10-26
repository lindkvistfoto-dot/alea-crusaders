const {chromium}=await import(process.env.HERMES_ALEA_PLAYWRIGHT_MODULE||'playwright');
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=process.cwd();const server=createServer(async(req,res)=>{try{const file=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.HERMES_ALEA_CHROMIUM?{executablePath:process.env.HERMES_ALEA_CHROMIUM}:{}),args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu','--disable-software-rasterizer']});
try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/smoke',r=>r.fulfill({contentType:'text/html',body:`<link rel="stylesheet" href="/features/honors/honors-admin.css"><main id="mount"></main><script type="module">
import {renderHonorsAdmin} from '/features/honors/honors-admin.js';
import {createHermesAleaClient} from '/features/hermes-alea/client.js';
const definitions=['medal','award','badge'].map((category,i)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa'+i,name:'Pilot '+category,category,type:category==='medal'?'adventure':'honor',status:'draft',image_revision:0}));
window.calls=[];window.operations=[];window.fail=false;window.uploadCount=0;
const client=createHermesAleaClient({storage:null,rpc:async(name,args)=>{calls.push(name);if(name==='hermes_alea_begin'){window.operations.push(args.request.operation);return {id:args.request.target_id,state:'uploading',source_path:'user/job/original',output_path:'trophy/job.webp'};}if(name==='hermes_alea_remove')return {state:'removed',result_revision:2};return {id:definitions[0].id,state:'activated',result_revision:++window.uploadCount};},request:async(path)=>{calls.push(path);return Response.json({verified:true},{status:window.fail&&path.includes('originals')?500:200});}});
renderHonorsAdmin(document.getElementById('mount'),{definitions,variants:[],imageAssets:[],imagePilotEnabled:true,onUploadImage:async(kind,row,file)=>{const j=await client.upload({targetKind:kind,target:row,file});return {...row,image_asset_id:'hermes-alea:'+j.id,image_revision:j.result_revision};},onRemoveImage:async(kind,row)=>{const j=await client.remove({targetKind:kind,target:row});return {...row,image_asset_id:null,image_revision:j.result_revision};}});
window.ready=true;</script>`}));
  await page.goto(base+'/smoke');await page.waitForFunction(()=>window.ready);
  const png=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='rgba(255,0,0,.5)';ctx.fillRect(8,8,16,16);return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())];});
  await page.getByRole('button',{name:'Redigera',exact:true}).click();
  await page.locator('[data-image-upload]').setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(png)});
  await page.waitForFunction(()=>document.querySelector('[name=image_asset_id]')?.value.startsWith('hermes-alea:'));
  if(!(await page.evaluate(()=>calls.at(-1)==='hermes_alea_finalize')))throw Error('FINALIZE_MISSING');
  await page.locator('[data-image-upload]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from(png)});
  await page.waitForFunction(()=>window.uploadCount===2);
  if(!(await page.evaluate(()=>operations.at(-1)==='REPLACE')))throw Error('REPLACE_MISSING');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Ta bort bild',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[name=image_asset_id]')?.value==='');
  await page.getByRole('button',{name:'Stäng redigering'}).click();
  for(const category of ['award','badge']){
   await page.locator('[data-category="'+category+'"]').click();await page.getByRole('button',{name:'Redigera',exact:true}).click();
   if(await page.locator('[data-image-upload]').count()!==1)throw Error('MISSING_CATEGORY_CONTROL');
   await page.getByRole('button',{name:'Stäng redigering'}).click();
  }
  await page.locator('[data-category="medal"]').click();await page.getByRole('button',{name:'Redigera',exact:true}).click();await page.evaluate(()=>window.fail=true);
  await page.locator('[data-image-upload]').setInputFiles({name:'alpha.png',mimeType:'image/png',buffer:Buffer.from(png)});
  await page.locator('[data-image-retry]').waitFor({state:'visible'});await page.evaluate(()=>window.fail=false);
  await page.getByRole('button',{name:'Försök igen',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[name=image_asset_id]')?.value.startsWith('hermes-alea:'));
  if(errors.length)throw Error(errors.join('\n'));
  if(process.env.HERMES_ALEA_SCREENSHOTS)await page.screenshot({path:process.env.HERMES_ALEA_SCREENSHOTS+'/hermes-'+width+'.png'});
  console.log('BROWSER_PASS',width,'CREATE REPLACE REMOVE retry categories native canvas alpha WebP')
 }
}finally{await browser.close();server.close();}
