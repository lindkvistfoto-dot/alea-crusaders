import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
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
const presentation={id:randomUUID(),campaign_id:campaign,title:'SL visar nu',asset_kind:'image',storage_bucket:'campaign-materials',storage_path:campaign+'/tomb.webp',archived_at:null};
let presenting=false,archived=false,count=0,current=maps[0].id;
const session=randomUUID(),envelopes=new Map(),seenFiles=new Map();
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'}),args:['--enable-unsafe-swiftshader','--no-sandbox']});
await fs.mkdir(output,{recursive:true});
async function client(label,manager=false) {
  seenFiles.set(label,[]);
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
    if(key==='rpc/command_arcane_reveal'){
      assert.ok(manager);
      const cmd=JSON.parse(opts.body),row=photos.find(x=>x.id===cmd.p_picture);
      const mode=cmd.p_action==='share'?'full':cmd.p_action==='revoke'?'refresh':cmd.p_action;
      if(cmd.p_action==='share'||cmd.p_action==='revoke')row.player_visible=cmd.p_action==='share';
      if(mode!=='refresh')assert.equal(row.player_visible,true);
      const ref=mode==='refresh'?null:createHash('sha256').update(cmd.p_command+'legacy'+row.id).digest('hex');
      const event={id:cmd.p_command,mode,ref};
      envelopes.set(event.id,{event,row});
      await Promise.all(clients.filter(c=>!c.manager).map(c=>c.p.evaluate(evt=>window.deliverGalleryPacket(evt),event)));
      return {mode,session};
    }
    if(key==='rpc/read_arcane_reveal'){
      const args=JSON.parse(opts.body),saved=envelopes.get(args.p_command);
      assert.equal(args.p_session,session);
      return saved?.event.ref===args.p_ref&&saved.row.player_visible?{...saved.row,source:'legacy'}:null;
    }
    if(key==='rpc/read_arcane_gallery_image'){
      const row=photos.find(x=>x.id===JSON.parse(opts.body).p_picture);
      return row?.player_visible?{...row,source:'legacy'}:null;
    }
    assert.ok(!opts.method || opts.method==='GET' || key.startsWith('rpc/read_'),'Mutation '+key);
    if(key.startsWith('campaign_material_presentations?'))return presenting?[{campaign_id:campaign,material_id:presentation.id,revision:1}]:[];
    if(key.startsWith('campaign_material_presentation_history?'))return presenting?[{material_id:presentation.id,revision:1}]:[];
    if(key.startsWith('campaign_materials?'))return presenting&&!archived&&key.includes(presentation.id)?[presentation]:[];
    if(key.startsWith('campaign_members?'))return [{role:manager?'gm':'player'}];
    if(key.startsWith('campaign_maps?')){if(!manager)assert.ok(key.includes('player_visible=eq.true')&&!key.includes('image_path'));return maps;}
    if(key.startsWith('campaign_map_settings?'))return [{active_map_id:current}];
    if(key==='rpc/read_adventure_player_areas')return JSON.parse(opts.body).p_map_id===maps[0].id?[room]:[];
    if(key.startsWith('campaign_location_assets?')){if(!manager)assert.ok(key.includes('player_visible=eq.true'));return photos.slice(0,count).filter(r=>manager||r.player_visible);}
    if(key.startsWith('campaign_map_areas?'))return key.includes(maps[0].id)?[room]:[];
    if(key.startsWith('campaign_location_state?'))return [{location_id:room.location_id,status:'explored'}];
    if(key.startsWith('campaign_locations?'))return [{id:room.location_id,location_key:'01',name:'Kyrkan'}];
    if(key.startsWith('campaign_image_links?')){if(!manager)assert.ok(key.includes('player_visible=eq.true'));return [];}
    if(key.startsWith('campaign_location_player_texts?'))return [{player_visible:true,player_description:'Den gamla kyrkan.'}];
    if(key.startsWith('arcane_system_assets?'))return art;
    return [];
  });
  await p.exposeFunction('galleryTestFile',name=>seenFiles.get(label).push(name));
  const login=async()=>{
    await p.goto(origin,{waitUntil:'domcontentloaded'});
    await p.waitForFunction(()=>window.aleaExplorerGallery);
    await p.evaluate(async({campaign,label,manager,session})=>{
      const id=crypto.randomUUID();
      supabaseProfile={id,display_name:label,is_admin:manager};supabaseSession={user:{id}};
      centralCampaignId=campaign;centralCampaignRole=manager?'gm':'player';window.dbJson=window.galleryTestRequest;
      window.loadCampaignPlaceData=window.loadCampaignContentData=async()=>{};
      window.readAdventureRaster=async(map,previous)=>previous?null:{url:URL.createObjectURL(await (await fetch('/gallery-test/exterior.webp')).blob()),tag:map.id};
      window.getMapImageUrl=async()=>URL.createObjectURL(await (await fetch('/gallery-test/exterior.webp')).blob());
      window.locationAssetStorageFetch=async key=>{const name=key.split('/').at(-1);await window.galleryTestFile(name);return fetch('/gallery-test/'+name);};
      window.mapStorageFetch=key=>fetch('/gallery-test/'+key.split('/').at(-1));
      document.querySelectorAll('#loginScreen,#landing').forEach(el=>el.classList.add('hidden'));
      document.querySelectorAll('header,main').forEach(el=>el.classList.remove('hidden'));
      document.querySelectorAll('main > section').forEach(el=>el.classList.add('hidden'));
      await openMap();
      const {createGather}=await import('/features/session/gather.js');
      const agent=createGather({identity:()=>({campaign,user:id,gm:manager}),readSession:async()=>session,
        connect:(_session,_user,events)=>({start(){events.status(true);window.deliverGalleryPacket=events.reveal;},track:async()=>{},close(){window.deliverGalleryPacket=()=>{};},refreshAuth:async()=>{}}),
        changed(){},announce:console.error,reveal:(sid,event,valid)=>window.aleaExplorerGallery.receive(sid,event,valid)});
      window.rejoinGalleryMeeting=async()=>{agent.reset();await agent.refresh();};
      await agent.refresh();
    },{campaign,label,manager,session});
    await p.locator('#explorerGallery').waitFor();
    await p.waitForFunction(()=>activeCampaignMap?.id);
  };
  await login();
  const c={p,login,manager,root:p.locator('#explorerGallery')};clients.push(c);return c;
}
const selected=async(c,title)=>{
  try{
    await c.p.waitForFunction(s=>{const i=document.querySelector('#explorerGallery [data-do=full] img');return !i.hidden&&i.naturalWidth&&i.alt===s},title,{timeout:25000});
  }catch(error){
    console.error('Expected image',title,await c.p.evaluate(()=>({
      shown:document.querySelector('#explorerGallery .eg-stage img')?.alt,empty:document.querySelector('#explorerGallery .eg-empty')?.textContent,
      visibility:document.visibilityState,presented:window.aleaPresentedImages?.()?.rows.map(r=>r.title),frodo:document.querySelector('#frodoNotice')?.textContent
    })),reads.filter(key=>key.startsWith('campaign_material')).slice(-6),errors);
    throw error;
  }
};
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
  await a.root.locator('.eg-thumbs button').first().click();
  await a.p.mouse.move(0,0);
  for(const [device,width,height] of [['desktop',1440,960],['tablet',820,1180],['mobil',390,844]]){
    await a.p.setViewportSize({width,height});await a.root.scrollIntoViewIfNeeded();
    await a.p.screenshot({path:path.join(output,device+'.png')});await a.root.screenshot({path:path.join(output,device+'-panel.png')});
    const bounds=await a.p.evaluate(()=>{const g=document.querySelector('#explorerGallery');return [document.documentElement.scrollWidth,innerWidth,g.clientWidth,g.clientHeight]});
    assert.ok(bounds[0]<=bounds[1]+1 && bounds[2]>160 && bounds[3]>200,device+JSON.stringify(bounds));
  }
  count=4;await selected(a,titles[3]);
  assert.equal(await a.root.locator('.eg-stage img').evaluate(i=>getComputedStyle(i).objectFit),'contain');
  assert.ok(await a.root.locator('.eg-location > .eg-thumbs').evaluate(el=>el.scrollWidth>el.clientWidth));
  presenting=true;
  // Deliver a foreground reconciliation to each browser, just as a player
  // returning to a Chrome tab gets the latest published Frodo revision.
  for(const c of clients){
    await c.p.bringToFront();
    await c.p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
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
  await selected(a,'SL visar nu');
  await click(a,'expand');
  archived=true;
  await a.p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await a.p.waitForFunction(()=>!document.querySelector('.explorer-image-viewer').open && document.querySelector('#explorerGallery output').textContent==='0 / 0');
  await a.p.evaluate(id=>selectAdventureMap(id,{free:true}),concealed);await mapIs(a,current);
  assert.ok(!reads.some(q=>q.includes(concealed)||q.startsWith('campaign_location_gm_notes?')));
  assert.ok(await a.root.locator('.eg-frame').evaluate(c=>c.width>0));
  assert.ok(await a.root.evaluate(g=>g.style.getPropertyValue('--eg-THUMB_ACTIVE').includes('ARCANE_GALLERY_THUMB_ACTIVE')));
  // A fresh scene. Room images start private on transport, including their URLs.
  count=3;current=maps[0].id;presenting=false;
  photos.forEach((r,i)=>{r.player_visible=i===0;});
  for(const c of [a,b]){await c.login();await openRoom(c);await selected(c,titles[0]);}
  for(const files of seenFiles.values())files.length=0;
  const gm=await client('Spelledare',true);await openRoom(gm);
  await gm.root.locator('.eg-thumbs button').nth(2).waitFor();
  assert.equal(await gm.root.locator('.eg-badge[data-shared=false]').count(),2);
  for(const player of [a,b])assert.equal(await player.root.locator('.eg-thumbs button').count(),1);
  await gm.root.locator('.eg-thumbs button').nth(1).click();await selected(gm,titles[1]);
  await click(gm,'expand');await gm.p.locator('.explorer-image-viewer[open]').waitFor();await gm.p.keyboard.press('Escape');
  for(const player of [a,b]){await selected(player,titles[0]);assert.equal(await player.p.locator('dialog[open]').count(),0);}
  assert.ok(!seenFiles.get('Spelare A').includes('interior.webp')&&!seenFiles.get('Spelare B').includes('interior.webp'));
  await gm.root.screenshot({path:path.join(output,'story-sl.png')});
  await click(gm,'share');
  for(const player of [a,b]){
    await player.p.locator('.explorer-image-viewer[open] img').waitFor();await selected(player,titles[1]);
    assert.equal(await player.root.locator('.eg-thumbs button').count(),2);
  }
  await b.p.locator('.explorer-image-viewer').screenshot({path:path.join(output,'story-helbild.png')});
  await a.p.keyboard.press('Escape');
  assert.equal(await a.p.locator('dialog[open]').count(),0);assert.equal(await b.p.locator('dialog[open]').count(),1);
  await a.root.screenshot({path:path.join(output,'story-spelare.png')});
  await gm.p.waitForFunction(()=>document.querySelector('#explorerGallery .eg-status').textContent==='Delad med spelarna');
  const first=[...envelopes.values()][0].event;
  await a.p.evaluate(evt=>window.deliverGalleryPacket(evt),first);await a.p.waitForTimeout(100);
  assert.equal(await a.p.locator('dialog[open]').count(),0);
  await a.root.locator('.eg-thumbs button').first().click();await selected(a,titles[0]);
  await click(gm,'frame');
  for(const c of [a,b]){await selected(c,titles[1]);await c.p.locator('.explorer-image-viewer').waitFor({state:'hidden'});}
  await a.root.locator('select').selectOption(maps[1].id);await mapIs(a,maps[1].id);
  await click(gm,'present');
  for(const c of [a,b])await c.p.locator('.explorer-image-viewer[open]').waitFor();
  await mapIs(a,maps[1].id);
  await click(gm,'revoke');
  for(const c of [a,b])await c.p.locator('.explorer-image-viewer').waitFor({state:'hidden'});
  assert.equal(await b.root.getByRole('button',{name:titles[1],exact:true}).count(),0);
  await b.p.waitForFunction(()=>document.querySelectorAll('#explorerGallery .eg-thumbs button').length===1);
  await gm.p.waitForFunction(()=>document.querySelector('#explorerGallery .eg-status').textContent==='Endast SL');
  await click(gm,'share');await a.p.locator('.explorer-image-viewer[open]').waitFor();
  await a.login();await mapIs(a,current);await openRoom(a);await a.p.evaluate(()=>window.rejoinGalleryMeeting());
  assert.equal(await a.p.locator('dialog[open]').count(),0);
  assert.equal(await a.root.locator('.eg-thumbs button').count(),2);
  console.log('PASS Storyteller: private GM preview, independent status, 2 first-reveal modals, individual dismissal, re-presentation, free map preserved, revoke, no replay on refresh/rejoin.');
  assert.deepEqual(errors,[]);
  console.log('PASS: 2 isolated players, empty/single/three/overflow, carousel, fullscreen, live room reveal, presentation, private selection, three viewports, free map, group change, gather, reload, logout, read-only access.');
} finally { await browser.close(); }
