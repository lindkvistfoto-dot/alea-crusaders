import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const [origin, painting, output] = process.argv.slice(2);
assert.ok(new URL(origin).hostname === '127.0.0.1' || /^[a-z0-9-]+\.alea-crusaders\.pages\.dev$/.test(new URL(origin).hostname));
await fs.mkdir(output, {recursive:true});
const fixtures=JSON.parse(await fs.readFile(new URL('../tests/fixtures/adventure-figure-art.json',import.meta.url)));
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
let currentPage;
try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:400,height:845}:{width:1440,height:980},hasTouch:mobile,isMobile:mobile});
 currentPage=page;
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message)});
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
  const rows=[], requests=[];
  const enemy={id:crypto.randomUUID(),name:'Kryptväktare',active:true},npc={id:crypto.randomUUID(),name:'Vägvisaren',active:true};
  chars=heroes.map(x=>({id:x.name.split(' ')[0].toLowerCase(),_dbId:x.id,name:x.name,isNpc:false,live:{KP:12,KPmax:12,PSY:10,PSYmax:10},identity:{namn:x.name},ownerId:'fixture'}));
  campaignNpcs=[npc];campaignMonsters=[enemy];campaignMaps=[map];centralCampaignId=map.campaign_id;centralCampaignRole='gm';
  const config={version:1,darkness:0,pixelsPerMeter:25,lights:[],geometry:[],freeSight:null};
  const room={id:crypto.randomUUID(),location_id:crypto.randomUUID(),name:'Kryptan',status:'explored',shape_type:'rect',shape_data:{x:0,y:0,width:800,height:680}};
  window.dbJson=async(path,opts={})=>{
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
  window.fixture={rows,requests,map,room};
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
 const touch=async(q,r)=>{const xy=await point(q,r);if(mobile)await page.touchscreen.tap(...xy);else await page.mouse.click(...xy)};
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
  assert.ok(await page.locator('.adventure-figure-ghost').innerHTML().then(h=>h.includes('arcane-hero-class-astrid')&&h.includes('arcane-bronze-ivory-pointed-hex-high-angle')));
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
 await arm('Evalin Hugger','character');await touch(5,5);
 assert.equal(await page.evaluate(()=>fixture.rows.length),2);
 await arm('Evalin Hugger','character');await touch(1,8);await verifyCount(3);
 await arm('Vägvisaren','npc',false);await touch(2,6);await verifyCount(4);
 await arm('Kryptväktare','monster');await touch(3,5);await verifyCount(5);
 await arm('Kryptväktare','monster');await touch(5,7);await verifyCount(6);
 await page.waitForFunction(()=>document.querySelectorAll('[data-concealed]').length===2);
 await page.screenshot({path:path.join(output,(mobile?'mobile':'desktop')+'.png')});
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
 assert.equal(await page.locator('[data-concealed]').count(),0);assert.deepEqual(errors,[]);
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
