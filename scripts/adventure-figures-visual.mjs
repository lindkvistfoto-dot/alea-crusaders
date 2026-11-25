import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const [origin, painting, output] = process.argv.slice(2);
assert.ok(new URL(origin).hostname === '127.0.0.1' || /^[a-z0-9-]+\.alea-crusaders\.pages\.dev$/.test(new URL(origin).hostname));
await fs.mkdir(output, {recursive:true});
const fixtures=JSON.parse(await fs.readFile(new URL('../tests/fixtures/adventure-figure-art.json',import.meta.url)));
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
// Optional short map-only clips alongside the mandatory stills in the PR artifact.
async function recordMap(page,mobile,name,action){
 if(mobile||spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0)return action();
 const dir=await fs.mkdtemp(path.join(tmpdir(),'living-hex-')),frames=[];
 try{
  await action();
  const surface=page.locator('#mapViewport'),start=Date.now();
  do{
   const file=path.join(dir,frames.length+'.jpg'),time=Date.now();
   await surface.screenshot({path:file,type:'jpeg',quality:85,animations:'allow'});
   frames.push({file,time});await page.waitForTimeout(45);
  }while(Date.now()-start<1900);
  const timing=frames.map((f,i)=>"file '"+f.file+"'\nduration "+((frames[i+1]?.time||Date.now())-f.time)/1000).join('\n');
  await fs.writeFile(path.join(dir,'frames'),timing+"\nfile '"+frames.at(-1).file+"'\n");
  const encode=spawnSync('ffmpeg',['-loglevel','error','-f','concat','-safe','0','-i',path.join(dir,'frames'),'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-pix_fmt','yuv420p','-y',path.join(output,name+'.mp4')]);
  if(encode.status!==0)throw Error(String(encode.stderr));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
let currentPage;
try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:400,height:845}:{width:1440,height:980},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?2:1});
 currentPage=page;
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.stack)});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/fixture-map.webp')return route.fulfill({path:painting,contentType:'image/webp'});
  if(u.hostname==='wkiuyklzzroavclnsxna.supabase.co' && u.pathname.includes('/storage/v1/object/public/alea-hermes-public/hermes/')){
    return route.continue();
  }
  if(u.origin===origin)return route.continue();
  if(u.hostname==='unpkg.com'&&u.pathname.includes('dice-box'))return route.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'});
  return route.abort();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>window.ALEA_SUPABASE_CONFIG?.name),'development');
 await page.waitForFunction(()=>window.aleaAdventureFigures && window.aleaCombatPaperDollMap);
 await page.evaluate(async ({assets,heroes,poses})=>{
  const map={id:crypto.randomUUID(),campaign_id:crypto.randomUUID(),width:800,height:680,name:'Kryptkammaren',image_url:location.origin+'/fixture-map.webp',player_visible:true};
  const session={id:crypto.randomUUID(),campaign_id:map.campaign_id,status:'active'};
  const rows=[], requests=[], state={round:0,epoch:0,prefs:{},budgets:{}};
  const enemy={id:crypto.randomUUID(),name:'Kryptväktare',active:true},npc={id:crypto.randomUUID(),name:'Vägvisaren',active:true};
  chars=heroes.map(x=>({id:x.name.split(' ')[0].toLowerCase(),_dbId:x.id,name:x.name,isNpc:false,live:{KP:12,KPmax:12,PSY:10,PSYmax:10},identity:{namn:x.name},ownerId:'fixture'}));
  campaignNpcs=[npc];campaignMonsters=[enemy];campaignMaps=[map];centralCampaignId=map.campaign_id;centralCampaignRole='gm';
  const config={version:1,darkness:0,pixelsPerMeter:25,lights:[],geometry:[],freeSight:null};
  const room={id:crypto.randomUUID(),location_id:crypto.randomUUID(),name:'Kryptan',status:'explored',shape_type:'rect',shape_data:{x:0,y:0,width:800,height:680}};
  window.dbJson=async(path,opts={})=>{
   if(path==='rpc/read_adventure_hex')return structuredClone(state);
   if(path==='rpc/command_adventure_hex'){
    if(centralCampaignRole!=='gm')throw Error('Endast SL');
    const {p_action:a,p_values:v,p_epoch:e}=JSON.parse(opts.body);
    if(e!==state.epoch)throw Error('Kartläget har ändrats.');
    if(a==='move'){
      const row=rows.find(r=>r.id===v.id);
      if(state.round){if(state.budgets[v.id].spent+v.path.length>state.budgets[v.id].max)throw Error('Budget');state.budgets[v.id].spent+=v.path.length;}
      [row.q,row.r]=v.path.at(-1);requests.push({path,method:'POST',body:v});return [{id:row.id}];
    }
    if(a==='setting')state.prefs[v.key]=v.value;
    else if(a==='pause'){state.paused=state.round;state.round=0;}
    else if(a==='begin'&&state.paused){state.round=state.paused;state.paused=0;}
    else{state.round=a==='end'?0:state.round+1;state.budgets=Object.fromEntries(rows.map(r=>[r.id,{max:4,spent:0}]));}
    state.epoch++;return structuredClone(state);
   }
   if(path.startsWith('adventure_map_figures?')){
    const u=new URL('https://fixture.test/'+path),args=u.searchParams,method=opts.method||'GET',body=JSON.parse(opts.body||'{}');
    if(method==='GET'){if(args.get('session_id')!=='eq.'+session.id||args.get('map_id')!=='eq.'+map.id||args.get('campaign_id')!=='eq.'+map.campaign_id)throw Error('Unscoped query');}
    requests.push({path,method,body});
    if(method==='GET')return structuredClone(rows.filter(r=>centralCampaignRole==='gm'||r.player_visible));
    if(centralCampaignRole!=='gm')throw Error('RLS');
    const id=args.get('id')?.slice(3),old=rows.find(r=>r.id===id||(method==='POST'&&body.character_id&&r.character_id===body.character_id));
    if(method==='DELETE'){rows.splice(rows.indexOf(old),1);return [old];}
    if(old){Object.assign(old,body);return [old];}
    const row={id:crypto.randomUUID(),player_visible:true,...body};rows.push(row);return [row];
   }
   if(path.includes('read_adventure_player_figures'))return structuredClone(rows.filter(r=>r.player_visible));
   if(path.startsWith('arcane_system_assets?'))return assets;
   if(path.startsWith('combatant_battle_poses?'))return poses;
   if(path.startsWith('characters?'))return heroes.map(h=>({id:h.id,is_npc:false}));
   if(path.startsWith('game_sessions?'))return [session];
   if(path.startsWith('campaign_map_academy?'))return [{configuration:config,revision:1}];
   if(path.includes('read_campaign_map_academy_player'))return config;
   return [];
  };
  window.fixture={rows,requests,map,room,state,config};
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('landing').classList.add('hidden');
  document.querySelectorAll('header,main').forEach(n=>n.classList.remove('hidden'));
  document.querySelectorAll('main > section').forEach(n=>n.classList.toggle('hidden',n.id!=='mapPage'));
  setCampaignMapData(map,[room]);window.aleaCharacterDrawerRefresh();
 },fixtures);
 const layer=page.locator('.adventure-figure-layer');
 await layer.waitFor();await page.waitForFunction(()=>document.querySelector('.adventure-figure-layer[data-gm]')&&window.aleaCombatPaperDollMap.renderMapToken(chars[0]._dbId,100));
 await page.locator('#mapViewport').scrollIntoViewIfNeeded();
 const point=async(q,r)=>layer.evaluate((el,[q,r])=>{const p=new DOMPoint(25*Math.sqrt(3)*(q+r/2),37.5*r).matrixTransform(el.getScreenCTM());return [p.x,p.y]},[q,r]);
 const touch=async(q,r)=>{
  // Wait for the map to settle after closing the board and scrolling it into view.
  await layer.evaluate(async el=>{
   let prior='',stable=0;
   for(let i=0;i<90&&stable<4;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const t=el.getScreenCTM(),signature=[t.a,t.d,t.e,t.f].join(',');
    stable=signature===prior?stable+1:0;prior=signature;
   }
  });
  const xy=await point(q,r);if(mobile)await page.touchscreen.tap(...xy);else await page.mouse.click(...xy)};
 const verifyCount=async n=>page.waitForFunction(n=>window.fixture.rows.length===n,n,{timeout:5500});
 const waitToken=async()=>page.waitForFunction(()=>document.querySelector('[data-figure-id] .combat-paper-doll-universal'));
 const arm=async(label,category,hidden=true)=>{
  await page.locator('#adventureSlBoard .slcb-toggle').click();
  if(category)await page.locator('[data-field=category]').selectOption(category);
  await page.locator('[data-field=choice]').selectOption({label});
  const check=page.locator('[data-field=hidden]');if(await check.count())await check.setChecked(hidden);
  await page.locator('[data-action=place]').click();
  await page.locator('[data-cancel]').waitFor();
 };
 if(!mobile){
  const rail=page.getByRole('button',{name:'Visa Astrid Eldhjärta',exact:true});
  const start=async()=>{await rail.waitFor({state:'visible'});const [x,y]=await rail.evaluate(b=>{const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]});await page.mouse.move(x,y);await page.mouse.down();await page.locator('.adventure-figure-ghost').waitFor({state:'attached'});};
  await rail.click();await page.locator('.arcane-character-drawer.is-open').waitFor();
  await page.keyboard.press('Escape');await page.locator('.arcane-character-drawer.is-open').waitFor({state:'detached'});
  await start();
  await page.mouse.move(...await point(4,6));await page.locator('[data-cell="4,6"]:not([data-fading])').waitFor();
  assert.ok(await page.locator('.adventure-figure-ghost').innerHTML().then(h=>h.includes('arcane-hero-class-astrid')&&!h.includes('arcane-bronze-ivory-pointed-hex-high-angle')));
  await page.mouse.move(...await point(5,6));await page.locator('[data-cell="5,6"]:not([data-fading])').waitFor();
  await page.screenshot({path:path.join(output,'lift.png')});
  await page.mouse.up();await verifyCount(1); await waitToken();
  assert.equal(await page.evaluate(()=>fixture.rows[0].q),5);
  const id=await page.evaluate(()=>fixture.rows[0].id);
  await page.mouse.move(...await point(4,6));await page.mouse.wheel(0,-140);await page.waitForTimeout(100);
  const empty=await point(2,5);await page.mouse.move(...empty);await page.mouse.down();await page.mouse.move(empty[0]+22,empty[1]+16,{steps:4});await page.mouse.up();
  await start();await page.mouse.move(...await point(3,7));await page.locator('[data-cell="3,7"]:not([data-fading])').waitFor();await page.mouse.up();
  await page.waitForFunction(id=>fixture.rows.length===1&&fixture.rows[0].q===3&&fixture.rows[0].id===id,id);
  await start();await page.mouse.move(...await point(4,6));await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await page.evaluate(()=>fixture.rows[0].q),3);
  await start();await page.mouse.move(4,4);await page.mouse.up();assert.equal(await page.evaluate(()=>fixture.rows.length),1);
  await page.mouse.move(...await point(3,7));await page.mouse.down();await page.mouse.move(...await point(4,7),{steps:6});await page.mouse.up();
  await page.waitForFunction(id=>fixture.rows[0].id===id && fixture.rows[0].q===4,id);
 }else{
  await arm('Astrid Eldhjärta','character');await touch(3,7);await verifyCount(1);
  await touch(3,7);await page.locator('[data-figure-id][data-selected]').waitFor();
  assert.equal(await page.locator('#mapStatusMenu').isVisible(),false);
  assert.equal(await page.evaluate(()=>mapSelectedAreaId),null);
 }
 await arm('Lyra Gråväv','character');await touch(5,5);await verifyCount(2);
 assert.deepEqual(await page.evaluate(()=>{const {q,r}=fixture.rows.find(row=>row.name==='Lyra Gråväv');return [q,r]}),[5,5]);
 await arm('Evalin Hugger','character');await touch(5,5);
 assert.equal(await page.evaluate(()=>fixture.rows.length),2);
 await arm('Evalin Hugger','character');await touch(1,8);await verifyCount(3);
 await arm('Vägvisaren','npc',false);await touch(2,6);await verifyCount(4);
 await arm('Kryptväktare','monster');await touch(3,5);await verifyCount(5);
 await arm('Kryptväktare','monster');await touch(5,7);await verifyCount(6);
 await page.waitForFunction(()=>document.querySelectorAll('[data-concealed]').length===2);
 await page.screenshot({path:path.join(output,(mobile?'mobile':'desktop')+'.png')});
 await page.waitForFunction(()=>document.querySelectorAll('[data-tone=emerald]').length===3);
 assert.equal(await layer.locator('[data-tactical-grid].awakened, .combat-base-aura, image[href*="pointed-hex-high-angle"], image[href*="portrait-stand"]').count(),0);
 const boardToggle=page.locator('#adventureSlBoard .slcb-toggle');
 const openBoard=async()=>{if(!await page.locator('[data-objects-toggle]').count())await boardToggle.click();};
 const moveLyra=async()=>{await openBoard();await page.locator('[data-instance]').filter({hasText:'Lyra Gråväv'}).getByText('Flytta',{exact:true}).click();};
 // Force a short detour around an open polyline between two otherwise free centers.
 await page.evaluate(()=>{fixture.config.geometry=[{closed:false,movement:true,points:[[350,179],[350,196]]}];
   window.aleaAdventureFigures.setGeometry(fixture.map,{...fixture.config});});
 await moveLyra();
 if(!mobile){await page.mouse.move(...await point(8,5));await layer.locator('[data-destination]').waitFor();
  await page.locator('#mapViewport').screenshot({path:path.join(output,'planned-route.png')});}
 await recordMap(page,mobile,'living-path',()=>touch(8,5));await page.waitForFunction(()=>fixture.rows.find(r=>r.name==='Lyra Gråväv').q===8);
 const route=await page.evaluate(()=>fixture.requests.at(-1)?.body?.path||fixture.requests.findLast(r=>r.path==='rpc/command_adventure_hex').body.path);
 assert.ok(route.length>3,'The wall between centers must force a detour');
 await openBoard();const before=await page.evaluate(()=>fixture.rows.map(r=>[r.q,r.r]));
 await recordMap(page,mobile,'battle-awakening',async()=>{await page.locator('#adventureModeSwitch [data-mode=battle]').click();await layer.locator('[data-tactical-grid].awakened').waitFor({state:'attached'});});await layer.locator('[data-tactical-grid].awakened').waitFor({state:'attached'});
 assert.deepEqual(await page.evaluate(()=>fixture.rows.map(r=>[r.q,r.r])),before);
 await page.locator('#mapViewport').scrollIntoViewIfNeeded();
 await page.waitForTimeout(230);
 await page.locator('#mapViewport').screenshot({path:path.join(output,mobile?'mobile-awakening.png':'awakening.png')});
 await moveLyra();await touch(7,5);await page.waitForFunction(()=>Object.values(fixture.state.budgets).some(a=>a.spent===1));
 await moveLyra();await touch(1,6);assert.equal(await page.evaluate(()=>fixture.rows.find(r=>r.name==='Lyra Gråväv').q),7);
 await page.locator('#adventureModeSwitch [data-mode=exploration]').click();
 await layer.locator('[data-tactical-grid].awakened').waitFor({state:'detached'});
 await page.locator('#adventureModeSwitch [data-mode=battle]').click();
 await layer.locator('[data-tactical-grid].awakened').waitFor({state:'attached'});
 assert.equal(await page.evaluate(()=>Object.values(fixture.state.budgets).some(b=>b.spent===1)),true);
 await openBoard();await page.locator('[data-hex-command="end"]').click();
 await layer.locator('[data-tactical-grid].awakened').waitFor({state:'detached'});
 const hero=page.locator('[data-figure-id]').filter({has:page.locator('[data-hero-class="lyra"]')});
 await hero.click({force:true});
 await page.evaluate(()=>openMapLocationInfoByArea(fixture.room.id));
 await page.locator('#adventureSlBoard .slcb-toggle').click();
 for(const preset of ['all','room','battle','group','person']){
  await page.locator('#adventureZoomPreset').selectOption(preset);
  assert.ok(await page.evaluate(()=>Number.isFinite(mapView.scale)&&mapView.scale>0));
 }
 const camera=await page.evaluate(()=>({...mapView}));
 await page.locator('#adventureSlBoard .slcb-toggle').click();
 assert.deepEqual(await page.evaluate(()=>({...mapView})),camera);
 await page.locator('#adventureSlBoard .slcb-toggle').click();
 await page.locator('.slcb-visibility-row').filter({hasText:'Kryptväktare'}).first().getByRole('button',{name:'Visa',exact:true}).click();
 await page.waitForFunction(()=>fixture.rows.filter(r=>!r.player_visible).length===1);
 await page.locator('.slcb-visibility-row').filter({hasText:'Vägvisaren'}).getByRole('button',{name:'Ta bort från kartan'}).click();await verifyCount(5);
 await page.evaluate(()=>{closeMap();document.getElementById('mapPage').classList.remove('hidden');setCampaignMapData(fixture.map,[fixture.room]);});
 await page.waitForFunction(()=>document.querySelectorAll('[data-figure-id]').length===5);
 await page.evaluate(()=>{centralCampaignRole='player';renderMapPanel()});
 await page.waitForFunction(()=>document.querySelectorAll('[data-figure-id]').length===4&&!document.querySelector('#adventureSlBoard .slcb-toggle'));
 await page.locator('#mapViewport').screenshot({path:path.join(output,mobile?'mobile-player.png':'player.png')});
 assert.equal(await page.locator('[data-concealed]').count(),0);assert.deepEqual(errors,[]);
 await verifyZoomDetail(page, mobile);
 console.log(mobile?'Touch PASS':'Desktop PASS');
 await page.close();
}
 } catch(error) {
  console.error(error);
  if(currentPage && !currentPage.isClosed()){
    console.log('Map status',await currentPage.locator('#adventureFigureStatus').textContent().catch(()=>'unavailable'));
    await currentPage.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  }
  throw error;
} finally { await browser.close(); }

// A one-pixel stripe disappears if the painting is first reduced to a 2048px light texture.
async function verifyZoomDetail(page, mobile) {
 const surface = page.locator('#mapViewport');
 await page.evaluate(() => {
  const { map, room } = fixture;
  const width = 4096, height = 2048;
  const artwork = document.createElement('canvas');
  artwork.width = width; artwork.height = height;
  const brush = artwork.getContext('2d');
  brush.fillStyle = '#424242'; brush.fillRect(0, 0, width, height);
  brush.fillStyle = 'black'; brush.fillRect(2700, 100, 200, 200);
  brush.fillStyle = 'white';
  for (let x = 2700; x < 2900; x += 2) brush.fillRect(x, 100, 1, 200);
  const detailMap = {...map, id:crypto.randomUUID(), width, height, image_url:artwork.toDataURL()};
  const lamp = {type:'lykta', color:'#ffffff', position:[2800,200], intensity:1, range:4,
   on:true, motion:0, direction:0, aperture:360};
  const config = {version:1, darkness:.5, pixelsPerMeter:25, lights:[lamp], geometry:[],
   freeSight:{width, height, runs:[[0,width*height]]}};
  const read = window.dbJson;
  window.dbJson = (path, opts) => path.includes('read_campaign_map_academy_player')
   ? Promise.resolve(config) : read(path, opts);
  setCampaignMapData(detailMap, [{...room, shape_data:{x:0,y:0,width:3000,height}},
   {...room, id:crypto.randomUUID(), status:'unknown', shape_data:{x:3000,y:0,width:1096,height}}]);
 });
 await surface.locator('.kartakademin-canvas').waitFor();
 const hero = page.locator('[data-hero-class="astrid"] > image');
 await hero.waitFor({state:'attached'});
 await surface.scrollIntoViewIfNeeded();
 const focus = async point => {
  await page.evaluate(([x, y]) => {
   Object.assign(mapView, {scale:6, x:-x*6, y:-y*6, fitted:false});
   applyMapTransform();
  }, point);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 };
 const sample = async () => {
  const png = await surface.screenshot({scale:'css'});
  return page.evaluate(async data => {
   const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
   const crop = document.createElement('canvas'); crop.width = crop.height = 48;
   const ctx = crop.getContext('2d');
   ctx.drawImage(img, Math.floor((img.width-48)/2), Math.floor((img.height-48)/2), 48,48, 0,0,48,48);
   return Array.from(ctx.getImageData(0,0,48,48).data.filter((_,i) => i%4===0));
  }, png.toString('base64'));
 };
 await focus([2800,200]);
 const stripe = await sample();
 assert.ok(Math.max(...stripe)-Math.min(...stripe)>150, 'The lit map must retain one-source-pixel stripes at 600%');
 await focus([3250,200]);
 assert.ok(Math.max(...await sample())<12, 'Panning to an unknown area must keep the map dark');
 const center = await hero.evaluate(img => {
  const box=img.getBoundingClientRect(), layer=img.closest('.adventure-figure-layer');
  const p=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(layer.getScreenCTM().inverse());
  return [p.x,p.y];
 });
 await focus(center);
 const actual = await sample();
 // Paint the same master at its final screen size as an independent reference.
 await hero.evaluate(img => {
  const viewport=document.getElementById('mapViewport'), b=img.getBoundingClientRect();
  const ref=document.createElementNS(img.namespaceURI,'svg');
  Object.assign(ref.style,{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:3,pointerEvents:'none'});
  viewport.append(ref);
  const origin=new DOMPoint(b.x,b.y).matrixTransform(ref.getScreenCTM().inverse());
  const master=img.cloneNode(false);
  for (const [key,value] of Object.entries({x:origin.x,y:origin.y,width:b.width,height:b.height})) {
   master.setAttribute(key,value);
  }
  ref.append(master); img.style.visibility='hidden';
 });
 const reference = await sample();
 const difference = actual.reduce((sum,red,i)=>sum+Math.abs(red-reference[i]),0)/actual.length;
 assert.ok(Math.max(...reference)-Math.min(...reference)>60, 'Reference crop must contain the figure');
 assert.ok(difference<4, 'Astrid must retain the detail of the source at 600% (mean error '+difference+')');
 console.log(mobile?'Touch zoom detail':'Desktop zoom detail', {mapContrast:Math.max(...stripe)-Math.min(...stripe), figureMeanError:difference});
}
