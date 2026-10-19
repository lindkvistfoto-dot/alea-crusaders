const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.ARCANE_VISUAL_OUT||'/tmp/arcane-v8-review');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(root+'/legacy/app.js','utf8'),html=fs.readFileSync(root+'/index.html','utf8');
const identity=source.split("$('identity').innerHTML=")[1].split(";$('basegrid')")[0];
const links=[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m=>m[0].replace(/href="\.\//,'href="/')).join('');
const portraitFn=source.slice(source.indexOf('function characterCombatIconSource(c){'),source.indexOf('/* Manage character images',source.indexOf('function characterCombatIconSource(c){')));
const hexFn=source.slice(source.indexOf("function combatIconHexHtml("),source.indexOf('function combatIconCachedUrl('));
const fixture=before=>`<!doctype html><html lang="sv" class="arcane-system-images-ready"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${before?links.replace(/href="\/features\/character\/arcane-profile-component.css[^\"]*"/,'href="/before.css"'):links}<style>@font-face{font-family:'EB Garamond';font-weight:400 600;src:url('/font.woff2')} </style></head><body class="character-glowup-active"><main><section id="view"><div class="layout"><article class="box sheet"><div class="tabs">${['Grundsida','Färdigheter','Magi','Vapen','Utrustning','Bilder'].map((t,k)=>'<button class="tab '+(k?'':'active')+'" onclick="window.selectedTab='+k+'">'+t+'</button>').join('')}</div><div id="grundPanel"><div class="hero"><div class="portrait" id="portrait"></div><div class="identity" id="identity"></div></div></div></article></div></section></main><script>
const i={namn:'Astrid Eldhjärta',ras:'Människa',yrke:'Krigare',kon:'Kvinna',alder:'—',langd:'190 cm',vikt:'115 kg',stand:'—'};const current={identity:i,portrait:''};let editing=false;
const escAttr=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;');const raceOptions=s=>'<option>'+s+'</option>';const professionOptions=raceOptions,socialStandOptions=raceOptions;
const combatIconCachedUrl=()=>'',getPortraitSrc=c=>c.portrait,combatIconSideClass=()=>'player',combatIconFallbackGlyph=()=>'A';function setIdentity(k,v){i[k]=v} ${hexFn}${portraitFn}
window.draw=edit=>{editing=edit;document.body.classList.toggle('editing',edit);document.getElementById('identity').innerHTML=${identity};};draw(false);
// Test-only portrait pixels from the supplied current screenshot. No app image or source pointer is changed.
const ref=new Image();ref.onload=()=>{const c=document.createElement('canvas');c.width=490;c.height=270;c.getContext('2d').drawImage(ref,50,344,490,270,0,0,490,270);current.portrait=c.toDataURL('image/png');document.getElementById('portrait').innerHTML='<img alt="Porträtt från nulägesskärmbilden" src="'+current.portrait+'">';draw(false);window.ready=true;};ref.src='/reference-current.jpg';
</script><script src="/features/character/arcane-profile-component.js"></script></body></html>`;
const mime={'.css':'text/css','.js':'text/javascript','.avif':'image/avif','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.jpg':'image/jpeg'};
const reference=process.env.ARCANE_REFERENCE_IMAGE,fontFile=process.env.ARCANE_FONT_FILE;
if(!reference||!fontFile)throw Error('Set ARCANE_REFERENCE_IMAGE to the supplied current screenshot and ARCANE_FONT_FILE to EB Garamond latin variable WOFF2.');
const server=http.createServer((req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;
 if(p==='/before'||p==='/after'){res.setHeader('Content-Type','text/html');return res.end(fixture(p==='/before'));}
 if(p==='/before.css'){res.setHeader('Content-Type','text/css');return res.end(execFileSync('git',['show','e3dd4425:features/character/arcane-profile-component.css'],{cwd:root}));}
 const file=p==='/font.woff2'?fontFile:p==='/reference-current.jpg'?reference:root+p;
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 }catch(e){res.statusCode=404;res.end('Missing');}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){await new Promise(r=>server.listen(4189,'127.0.0.1',r));
 const browser=spawn('chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--hide-scrollbars','--remote-allow-origins=*','--remote-debugging-port=9319','--user-data-dir=/tmp/arcane-review-cdp-'+process.pid,'about:blank'],{stdio:'ignore'});let ws;
 try{let page;for(let n=0;n<100;n++){try{page=(await (await fetch('http://127.0.0.1:9319/json/list')).json()).find(x=>x.type==='page');if(page)break;}catch{}await wait(100)}if(!page)throw Error('Browser not available');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));let n=0;const pending=new Map();ws.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result)}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*','http://fonts.*']});
 const results=[];
 for(const version of ['before','after'])for(const width of [320,375,390,430]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:'http://127.0.0.1:4189/'+version});
 for(let i=0;i<100;i++){if(await ev('window.ready && window.aleaArcaneProfile?.isMounted()'))break;if(i===99)throw Error('Mount timeout');await wait(50)}
 await ev('document.fonts.ready.then(()=>true)');await wait(150);
 for(const edit of [false,true]){await ev('draw('+edit+')');await wait(100);
 const metrics=await ev(`(()=>{const rect=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right}};const q=s=>document.querySelector(s),cards=[...document.querySelectorAll('.arcane-profile-card')];return {font:document.fonts.check('16px "EB Garamond"'),portrait:rect(q('#portrait')),tabs:rect(q('.tabs')),plaque:rect(q('.arcane-profile-nameplate')),name:q('.arcane-profile-nameplate .val')?rect(q('.arcane-profile-nameplate .val')):null,subtitle:q('.arcane-nameplate-subtitle')?rect(q('.arcane-nameplate-subtitle')):null,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,cards:cards.map(e=>({...rect(e),icon:rect(e.querySelector('img')),divider:rect(e.querySelector('.arcane-profile-field-divider')),crop:getComputedStyle(e.querySelector('img')).clipPath,fields:[...e.querySelectorAll('.grund-input')].map(rect)})),pseudos:cards.map(e=>{const f=e.querySelector('.field');return ['::before','::after'].map(p=>({content:getComputedStyle(f,p).content,display:getComputedStyle(f,p).display}))}),inputCount:document.querySelectorAll('#identity .grund-input').length,combatSource:q('.combat-icon-hex img')?.src===current.portrait}})()`);
 if(version==='after'){
  const first=metrics.cards[0];
  if(metrics.scrollWidth>width)throw Error('Horizontal overflow at '+width);
  if(!metrics.font||!metrics.combatSource)throw Error('Missing font or portrait fallback');
  if(metrics.cards.some(c=>Math.abs(c.w-first.w)>.1||Math.abs(c.h-first.h)>.1))throw Error('Unequal cards at '+width);
  if(edit&&(metrics.inputCount!==8||metrics.cards.some(c=>c.fields.some(f=>f.y<c.y+.08*c.h-.5||f.bottom>c.bottom-.1*c.h+.5))))throw Error('Clipped editing control at '+width);
 }
 const row={version,width,edit,...metrics};results.push(row);
 const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(out+'/'+version+'-'+width+(edit?'-edit':'')+'.png',Buffer.from(shot.data,'base64'));
 console.log(version,width,edit?'edit':'view','portrait',metrics.portrait.w.toFixed(2),metrics.portrait.h.toFixed(2),'card',metrics.cards[0].w.toFixed(2),metrics.cards[0].h.toFixed(2),'font',metrics.font);
 }
 // Verify same original input node is mounted and its handler still updates the fixture model.
 await ev('draw(true)');await wait(40);const input=await ev(`(()=>{const e=document.querySelector('.arcane-field-name input');e.value='Astrid Test';e.dispatchEvent(new Event('input',{bubbles:true}));return i.namn==='Astrid Test'})()`);if(!input)throw Error('Input handler failed');
 }
 fs.writeFileSync(out+'/metrics.json',JSON.stringify(results,null,2));
 console.log('DONE',out);
 }finally{ws?.close();browser.kill();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
