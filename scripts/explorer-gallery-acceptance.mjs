import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';

// Run the built application with two unprivileged browser contexts. Only campaign
// transport and image bytes are fixtures. The gallery, map and gather handlers are real.
const [origin, artIndex, artDirectory, pictureDirectory, output] = process.argv.slice(2);
const art=JSON.parse(await fs.readFile(artIndex));
const pictures=['exterior','interior','tomb','portrait'];
const titles=['Kyrkans ruin','Kyrkorummet','Riddares grav','Tornet'];
const campaign=randomUUID();
const maps=['Skelettbyn','Katakomberna','Kryptan'].map(name=>({id:randomUUID(),campaign_id:campaign,name,width:950,height:453,player_visible:true}));
const room={id:randomUUID(),location_id:randomUUID(),name:'01. Kyrkan',status:'explored',shape_type:'rect',shape_data:{x:40,y:40,width:400,height:300}};
const concealed=randomUUID(),clients=[],reads=[],errors=[];
const photos=pictures.map((p,i)=>({id:randomUUID(),title:titles[i],asset_type:'image',player_visible:true,storage_path:p+'.webp',sort_order:i}));
let count=0,current=maps[0].id;
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'}),args:['--enable-unsafe-swiftshader','--no-sandbox']});
await fs.mkdir(output,{recursive:true});
async function client(label) {
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  const p=await context.newPage();p.setDefaultTimeout(10000);
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.pathname.includes('/hermes/system-asset/ARCANE_GALLERY_')){
      const name=u.pathname.split('/').at(-2);
      if(artDirectory==='published')return r.continue();
      return r.fulfill({path:path.join(artDirectory,name+'.webp'),contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if(u.pathname.startsWith('/gallery-test/')){
      const file=u.pathname.split('/').at(-1);
      assert.ok(pictures.includes(file.split('.')[0]));
      return r.fulfill({path:path.join(pictureDirectory,file),contentType:'image/webp'});
    }
    if(u.pathname.includes('dice-box.es.min.js'))return r.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'});
    if(u.origin!==origin)return r.abort();
    if(!process.env.GALLERY_DIST)return r.continue();
    const file=path.resolve(process.env.GALLERY_DIST,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    assert.ok(file.startsWith(path.resolve(process.env.GALLERY_DIST)+path.sep));
    try {
      const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
      return await r.fulfill({body:await fs.readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});
    } catch {return r.fulfill({status:404,body:'Missing fixture resource'});}
  });
  await p.exposeFunction('galleryTestRequest',async(key,opts={})=>{
    reads.push(key);
    assert.ok(!opts.method || opts.method==='GET' || key.startsWith('rpc/read_'),'Mutation '+key);
    if(key.startsWith('campaign_members?'))return [{role:'player'}];
    if(key.startsWith('campaign_maps?')){assert.ok(key.includes('player_visible=eq.true')&&!key.includes('image_path'));return maps;}
    if(key.startsWith('campaign_map_settings?'))return [{active_map_id:current}];
    if(key==='rpc/read_adventure_player_areas')return JSON.parse(opts.body).p_map_id===maps[0].id?[room]:[];
    if(key.startsWith('campaign_location_assets?')){assert.ok(key.includes('player_visible=eq.true'));return photos.slice(0,count);}
    if(key.startsWith('campaign_image_links?')){assert.ok(key.includes('player_visible=eq.true'));return [];}
    if(key.startsWith('campaign_location_player_texts?'))return [{player_visible:true,player_description:'Den gamla kyrkan.'}];
    if(key.startsWith('arcane_system_assets?'))return art;
    return [];
  });
  const login=async()=>{
    await p.goto(origin,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.aleaExplorerGallery);
    await p.evaluate(async({campaign,label})=>{
      const id=crypto.randomUUID();
      supabaseProfile={id,display_name:label,is_admin:false};supabaseSession={user:{id}};
      centralCampaignId=campaign;centralCampaignRole='player';window.dbJson=window.galleryTestRequest;
      window.loadCampaignPlaceData=window.loadCampaignContentData=async()=>{};
      window.readAdventureRaster=async(map,previous)=>previous?null:{url:URL.createObjectURL(await (await fetch('/gallery-test/exterior.webp')).blob()),tag:map.id};
      window.locationAssetStorageFetch=key=>fetch('/gallery-test/'+key.split('/').at(-1));
      window.aleaPresentedImages=()=>window.galleryTestFeed||{rows:[],live:'',revision:0};
      document.querySelectorAll('#loginScreen,#landing').forEach(el=>el.classList.add('hidden'));
      document.querySelectorAll('header,main').forEach(el=>el.classList.remove('hidden'));
      document.querySelectorAll('main > section').forEach(el=>el.classList.add('hidden'));
      await openMap();
    },{campaign,label});
    await p.locator('#explorerGallery').waitFor();
    await p.waitForFunction(()=>activeCampaignMap?.id);
  };
  await login();
  const c={p,login,root:p.locator('#explorerGallery')};clients.push(c);return c;
}
const selected=(c,title)=>c.p.waitForFunction(s=>{const i=document.querySelector('#explorerGallery [data-do=full] img');return !i.hidden&&i.naturalWidth&&i.alt===s},title);
const mapIs=(c,id)=>c.p.waitForFunction(id=>activeCampaignMap?.id===id,id);
const openRoom=c=>c.p.evaluate(id=>openMapLocationInfoByArea(id),room.id);
const click=(c,key)=>c.root.locator('[data-do='+key+']').click();
const refresh=c=>c.p.evaluate(async()=>{
  // Deliver the same reconciliation as a Realtime map event; the credential
  // is local to the mocked browser transport.
  supabaseSession.access_token='isolated-gallery-test';
  try {await window.aleaMapRealtime.refresh();} finally {delete supabaseSession.access_token;}
});
try {
  const a=await client('Spelare A'),b=await client('Spelare B');
  for(const c of clients){await openRoom(c);assert.match(await c.root.innerText(),/Inga delade bilder ännu/);}
  count=1;
  for(const c of clients){await selected(c,titles[0]);assert.equal(await c.root.locator('output').textContent(),'1 / 1');}
  count=3;
  for(const c of clients)await selected(c,titles[2]);
  await a.root.locator('.eg-thumbs button').first().click();await selected(a,titles[0]);await selected(b,titles[2]);
  await click(a,'next');await selected(a,titles[1]);await click(a,'prev');await selected(a,titles[0]);
  for(const button of ['expand','full']){
    await click(a,button);await a.p.locator('dialog[open] img').evaluate(i=>i.decode());await a.p.keyboard.press('Escape');
    assert.equal(await a.p.locator('.explorer-image-viewer[open]').count(),0);
  }
  await a.p.waitForFunction(()=>document.querySelector('#explorerGallery canvas').width===document.querySelector('#explorerGallery').clientWidth);
  await a.p.mouse.move(0,0);
  for(const [device,width,height] of [['desktop',1440,960],['tablet',820,1180],['mobil',390,844]]){
    await a.p.setViewportSize({width,height});await a.root.scrollIntoViewIfNeeded();
    await a.p.screenshot({path:path.join(output,device+'.png')});await a.root.screenshot({path:path.join(output,device+'-panel.png')});
    const bounds=await a.p.evaluate(()=>{const g=document.querySelector('#explorerGallery');return [document.documentElement.scrollWidth,innerWidth,g.clientWidth,g.clientHeight]});
    assert.ok(bounds[0]<=bounds[1]+1 && bounds[2]>160 && bounds[3]>200,device+JSON.stringify(bounds));
  }
  count=4;await selected(a,titles[3]);
  assert.equal(await a.root.locator('.eg-stage img').evaluate(i=>getComputedStyle(i).objectFit),'contain');
  assert.ok(await a.root.locator('.eg-thumbs').evaluate(el=>el.scrollWidth>el.clientWidth));
  for(const c of clients){
    await c.p.evaluate(()=>{
      window.galleryTestFeed={revision:3,live:'shown',rows:[{id:'material:shown',title:'SL visar nu',version:'v1',read:async()=>(await fetch('/gallery-test/tomb.webp')).blob()}]};
      window.dispatchEvent(new Event('alea:presented-images'));
    });
    await selected(c,'SL visar nu');
  }
  await a.root.locator('.eg-thumbs button').first().click();await selected(a,titles[0]);await selected(b,'SL visar nu');
  await a.root.locator('select').selectOption(maps[1].id);await mapIs(a,maps[1].id);await mapIs(b,maps[0].id);
  assert.equal(await a.root.locator('[data-do=free]').getAttribute('aria-pressed'),'true');
  current=maps[2].id;
  for(const c of clients)await refresh(c);
  await mapIs(a,maps[1].id);await mapIs(b,current);
  await click(a,'expand');
  const gathered=await a.p.evaluate(async target=>(await import('/features/session/gather-destination.js')).openDestination({view:'map',target},()=>true),current);
  assert.ok(gathered);await mapIs(a,current);
  assert.equal(await a.root.locator('[data-do=follow]').getAttribute('aria-pressed'),'true');
  assert.equal(await a.p.locator('dialog[open]').count(),0);
  await a.root.locator('select').selectOption(maps[1].id);await mapIs(a,maps[1].id);
  assert.ok(!await a.p.evaluate(id=>JSON.stringify([location.href,{...localStorage},{...sessionStorage}]).includes(id),maps[1].id));
  await a.login();await mapIs(a,current);
  await a.root.locator('select').selectOption(maps[1].id);await mapIs(a,maps[1].id);
  await a.p.evaluate(()=>logoutUser());await a.p.locator('#loginScreen').waitFor();
  await a.login();await mapIs(a,current);
  await a.p.evaluate(id=>selectAdventureMap(id,{free:true}),concealed);await mapIs(a,current);
  assert.ok(!reads.some(q=>q.includes(concealed)||q.startsWith('campaign_location_gm_notes?')));
  assert.ok(await a.root.locator('.eg-frame').evaluate(c=>c.width>0));
  assert.ok(await a.root.evaluate(g=>g.style.getPropertyValue('--eg-THUMB_ACTIVE').includes('ARCANE_GALLERY_THUMB_ACTIVE')));
  assert.deepEqual(errors,[]);
  console.log('PASS: 2 isolated players, empty/single/three/overflow, carousel, fullscreen, live room reveal, presentation, private selection, three viewports, free map, group change, gather, reload, logout, read-only access.');
} finally { await browser.close(); }
