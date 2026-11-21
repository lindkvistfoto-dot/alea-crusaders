// Chromium acceptance against the real Admin → Platser → Kartverkstad entry point.
// Usage: node scripts/polygon-studio-visual.mjs http://127.0.0.1:5173 /tmp/results [dev-fixture.json] [katakomber-image.png] [visibility.json]
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, output, fixturePath, imagePath, visibilityPath] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
await mkdir(output, {recursive:true});
const db = fixturePath ? JSON.parse(await readFile(fixturePath,'utf8')) : {maps:[],sites:[],locations:[],areas:[]};
const painting = imagePath ? 'data:image/'+(imagePath.endsWith('.png')?'png':'webp')+';base64,'+(await readFile(imagePath)).toString('base64') : '';
const campaign = db.maps[0]?.campaign_id || randomUUID();
const site = {id:randomUUID(),name:'Prövostenen',campaign_id:campaign};
const map = {id:randomUUID(),site_id:site.id,campaign_id:campaign,name:'Geometriprov',width:400,height:400,player_visible:true};
const location = {id:randomUUID(),site_id:site.id,campaign_id:campaign,name:'Provrum',location_key:'1'};
db.maps.push(map); db.sites.push(site); db.locations.push(location);
const room = (points) => {
  const row = {id:randomUUID(),campaign_id:campaign,map_id:map.id,location_id:null,
    shape_type:'polygon',shape_data:{points},sort_order:db.areas.filter(a=>a.map_id===map.id).length};
  db.areas.push(row); return row.id;
};
const rectangle = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
for (const points of [rectangle(30,30,160,50),rectangle(30,140,160,50),rectangle(30,80,50,60),rectangle(140,80,50,60)]) room(points);
const neighbor = room([[240,50],[300,50],[240,120]]);
const movable = room([[314,60],[371,60],[340,120]]);
let revision=0;
const timestamp=()=>new Date(1700000000000+revision++).toISOString();
for (const area of db.areas) area.updated_at ||= timestamp();
const overlapMap = {...map,id:randomUUID(),name:'Överlappande äldre rum'};
db.maps.push(overlapMap);
for (const [i,points] of [rectangle(100,100,140,150),rectangle(150,150,140,150)].entries()) {
  db.areas.push({id:randomUUID(),map_id:overlapMap.id,campaign_id:campaign,shape_type:'polygon',shape_data:{points},
    sort_order:i,location_id:null,updated_at:timestamp()});
}
const writes = [];
const states = new Map();
if (visibilityPath) {
  for (const row of JSON.parse(await readFile(visibilityPath,'utf8'))) if (row.location_id) states.set(row.location_id,row.status);
}
const readRows = id => db.areas.filter(a=>a.map_id===id);
const getRow = id => db.areas.find(a=>a.id===id);
function database(path, request) {
  const [relation, query] = path.split('?');
  const params = new URLSearchParams(query);
  switch (relation) {
    case 'rpc/apply_map_polygon_operation': {
      const {p_map_id, p_changes, p_versions} = JSON.parse(request.body);
      const versions=()=>Object.fromEntries(readRows(p_map_id).map(a=>[a.id,a.updated_at]));
      assert.deepEqual(p_versions,versions());
      writes.push(structuredClone(p_changes));
      for (const {id, after} of p_changes) {
        const idx = db.areas.findIndex(a=>a.id===id);
        if (!after) {
          assert.ok(idx>=0 && db.areas[idx].map_id===p_map_id,'Unknown polygon in test delete');
          db.areas.splice(idx,1);
        }
        else if (idx<0) db.areas.push({...after,id,map_id:p_map_id,campaign_id:campaign,updated_at:timestamp()});
        else Object.assign(db.areas[idx],after,{updated_at:timestamp()});
      }
      return versions();
    }
    case 'campaign_map_areas': return readRows(params.get('map_id')?.replace(/^eq\./,''));
    case 'campaign_sites': return db.sites;
    case 'campaign_maps': return db.maps;
    case 'campaign_locations': return db.locations;
    case 'campaign_location_state': return [...states].map(([location_id,status])=>({location_id,status}));
    case 'campaign_map_academy': return [{revision:1,configuration:{version:1,pixelsPerMeter:30,lights:[],geometry:[]}}];
    default: return [];
  }
}
const browser = await chromium.launch({
  ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'}),
  args:['--enable-unsafe-swiftshader'],
});
async function session(touch=false) {
  const page = await browser.newPage({viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch});
  page.setDefaultTimeout(6500);
  page.on('dialog', async dialog=>{console.error(dialog.message());await dialog.dismiss();});
  page.on('pageerror', error=>console.error('Browser:',error.stack || error.message));
  await page.exposeFunction('fixtureDatabase',database);
  await page.route(/^https?:/,route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort());
  await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js',
    route=>route.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'}));
  async function open(item, reload=false) {
    if (reload || page.url()==='about:blank') {
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.aleaKartakademin && typeof openMapAreaEditor==='function');
      await page.evaluate(async({maps,sites,locations,painting})=>{
        window.dbJson=window.fixtureDatabase;
        window.getMapImageUrl=async m=> {
          if (painting && m.name==='katakomber') return painting;
          const canvas=document.createElement('canvas'); canvas.width=m.width; canvas.height=m.height;
          const c=canvas.getContext('2d'); c.fillStyle='#353936';c.fillRect(0,0,m.width,m.height);
          return canvas.toDataURL();
        };
        document.querySelector('#loginScreen').classList.add('hidden');
        document.querySelectorAll('header,main,#admin,#adminNavBtn').forEach(el=>el.classList.remove('hidden'));
        document.querySelectorAll('main > section:not(#admin)').forEach(el=>el.classList.add('hidden'));
        campaignMaps=maps; campaignSites=sites; campaignLocations=locations;
        centralCampaignId=maps[0].campaign_id; centralCampaignRole='gm';
        await openAdminSection('places');
      },{maps:db.maps,sites:db.sites,locations:db.locations,painting});
    } else {
      await page.waitForFunction(()=>!window.aleaKartakademin.isSaving());
      await page.evaluate(()=>closeMapAreaEditor());
    }
    await page.evaluate(({site_id})=>openAdminSite(site_id),item);
    await page.locator('#adminMapTable button[aria-label="Öppna Kartverkstad"][onclick*="'+item.id+'"]').click();
    await page.waitForFunction(name=>document.querySelector('#mapAreaEditorTitle').textContent.endsWith(name),item.name);
    await page.locator('#mapAreaList [data-room-id]').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-map-scale]')?.textContent.includes('px/m'),null,{timeout:20000});
    await page.locator('[data-fit-view]').click();
  }
  const ui=selector=>page.locator('#mapAreaEditor '+selector);
  async function screen(point) {
    await ui('.map-area-map-stage').scrollIntoViewIfNeeded();
    return ui('#mapAreaSvg').evaluate((svg,[x,y])=>{
      const p=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());
      const el=document.elementFromPoint(p.x,p.y);
      if(!svg.contains(el) && el!==svg && !el?.closest('#mapAreaCanvas'))throw new Error('Kartpunkten ligger utanför kartytan '+[p.x,p.y,el?.className]);
      return [p.x,p.y];
    },point);
  }
  const click=async point=>touch?page.touchscreen.tap(...await screen(point)):page.mouse.click(...await screen(point));
  const mode=key=>ui('[data-room-mode='+key+']').click();
  const select=id=>ui('[data-room-id="'+id+'"]').click();
  const active=id=>ui('[data-room-id="'+id+'"][aria-pressed=true]').waitFor();
  const count=()=>ui('[data-room-id]').count();
  return {page,ui,open,screen,click,mode,select,active,count};
}
async function waitFor(check,message) {
  const until=Date.now()+6000;
  while (!check() && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,40));
  assert.ok(check(),message);
}

try {
  const {page,ui,open,screen,click,mode,select,active,count}=await session();
  const catacombs=db.maps.find(m=>m.name==='katakomber');
  if (catacombs) {
    const original=structuredClone(readRows(catacombs.id));
    assert.equal(original.length,11);assert.equal(original.filter(a=>a.location_id).length,1);
    await open(catacombs);assert.equal(await count(),11);
    await click([550,180]); // Inside the north-western polygon of the November DEV map.
    await ui('[data-room-id][aria-pressed=true]').waitFor();
    const selected=await ui('[data-room-id][aria-pressed=true]').getAttribute('data-room-id');
    assert.equal(getRow(selected).location_id,null);
    const roomSeven=db.locations.find(l=>l.site_id===catacombs.site_id && l.name.includes('Balsameringskammaren'));
    const options=await ui('#mapAreaLocation option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean).sort());
    assert.deepEqual(options,db.locations.filter(l=>l.site_id===catacombs.site_id).map(l=>l.id).sort());
    await ui('#mapAreaLocation').selectOption(roomSeven.id);
    await waitFor(()=>getRow(selected).location_id===roomSeven.id,'Platskoppling');
    await ui('#mapAreaUndoBtn').click();await waitFor(()=>!getRow(selected).location_id,'Ångra platskoppling');
    await ui('#mapAreaRedoBtn').click();await waitFor(()=>getRow(selected).location_id===roomSeven.id,'Gör om platskoppling');
    await open(catacombs,true);await select(selected);assert.equal(await ui('#mapAreaLocation').inputValue(),roomSeven.id);
    await mode('edit');await ui('[data-vertex-index]').first().waitFor();
    await page.screenshot({path:output+'/katakomber-desktop.png'});
    const katStart=await screen([729,132.6]),katTarget=await screen([775,91.1]);
    await page.mouse.move(...katStart);await page.mouse.down();
    await page.mouse.move(katTarget[0]+1,katTarget[1],{steps:5});
    await ui('[data-snap-kind=vertex]').first().waitFor();await page.mouse.up();
    await waitFor(()=>getRow(selected).shape_data.points.some(([x,y])=>x===775 && y===91.1),'Katakombernas angränsande hörn');
    await ui('#mapAreaUndoBtn').click();
    await waitFor(()=>getRow(selected).shape_data.points[1][0]===729,'Återställ hörn i katakomber');
    await mode('fill');await ui('[data-gap-candidate]').first().waitFor();
    await click([807.3,464.33]);
    await ui('[data-gap-preview]').first().waitFor();
    const preview=await ui('[data-gap-preview]').first().getAttribute('points');
    await ui('#mapAreaSaveBtn').click();await waitFor(()=>readRows(catacombs.id).length===12,'Katakombernas riktiga tomrum');
    assert.equal(readRows(catacombs.id).at(-1).shape_data.points.map(p=>p.join(',')).join(' '),preview);
    await ui('#mapAreaUndoBtn').click();await waitFor(()=>readRows(catacombs.id).length===11,'Återställ tomrum');
    assert.deepEqual(readRows(catacombs.id).map(a=>a.shape_data),original.map(a=>a.shape_data));
    for (const [name,expected] of [['Skelettbyn',21],['Grottsystem',5]]) {
      const level=db.maps.find(m=>m.name===name);
      await open(level);assert.equal(await count(),expected);
      await select(readRows(level.id)[0].id);await active(readRows(level.id)[0].id);
    }
  }
  await open(map);
  await click([340,80]);await active(movable);
  const beforeSelect=writes.length;
  await page.mouse.move(...await screen([314,60]));await page.mouse.down();
  await page.mouse.move(...await screen([320,80]),{steps:5});await page.mouse.up();
  assert.equal(writes.length,beforeSelect,'Välj får aldrig flytta ett hörn');
  await mode('edit');
  for (let i=0;i<4;i++) await ui('[data-zoom-in]').click();
  await ui('[data-room-center]').click();
  const displayedZoom=await ui('[data-zoom-percent]').textContent();
  assert.ok(parseFloat(displayedZoom)>200,'Punktredigering vid hög zoom');
  const begin=await screen([314,60]),end=await screen([300,50]);
  await page.mouse.move(...begin);await page.mouse.down();
  await page.mouse.move(end[0]+2,end[1]+1,{steps:8});await ui('[data-snap-kind]').first().waitFor();
  assert.equal(writes.length,beforeSelect,'Dragförhandsvisning skrev till databasen');
  await page.mouse.up();
  await waitFor(()=>getRow(movable).shape_data.points.some(p=>p[0]===300&&p[1]===50),'Exakt magnetpunkt');
  assert.equal(writes.length,beforeSelect+1,'En dragning = en operation');
  assert.ok(getRow(neighbor).shape_data.points.some(p=>p[0]===300&&p[1]===50));
  await page.waitForFunction(()=>!window.aleaKartakademin.isSaving());
  await page.keyboard.press('Control+z');await waitFor(()=>getRow(movable).shape_data.points[0][0]===314,'Ångra dragning');
  await page.waitForFunction(()=>!window.aleaKartakademin.isSaving());
  await page.keyboard.press('Control+Shift+z');await waitFor(()=>getRow(movable).shape_data.points[0][0]===300,'Gör om dragning');
  await page.waitForFunction(()=>!window.aleaKartakademin.isSaving());
  await click([335.5,55]);await waitFor(()=>getRow(movable).shape_data.points.length===4,'Infoga punkt');
  const inserted=getRow(movable).shape_data.points[1];
  await page.waitForFunction(()=>!window.aleaKartakademin.isSaving());
  const oldWrites=writes.length;
  await page.mouse.move(...await screen(inserted));await page.mouse.down();await page.mouse.move(...await screen([335,42]),{steps:6});await page.mouse.up();
  await waitFor(()=>writes.length===oldWrites+1,'Flytta punkt');
  await ui('#mapAreaRemoveVertexBtn').click();await waitFor(()=>getRow(movable).shape_data.points.length===3,'Ta bort punkt');
  await ui('[data-fit-view]').click();
  await mode('fill');await click([110,110]);await ui('[data-gap-preview]').first().waitFor();
  assert.equal(await count(),6);
  await page.screenshot({path:output+'/fill-preview.png'});
  await ui('#mapAreaCancelBtn').click();assert.equal(await count(),6);
  await mode('fill');await click([110,110]);await ui('#mapAreaSaveBtn').click();
  await waitFor(()=>readRows(map.id).length===7,'Tomrum sparat');
  const filled=readRows(map.id).at(-1);
  assert.deepEqual(filled.shape_data.points.map(p=>p.join(',')).sort(),rectangle(80,80,60,60).map(p=>p.join(',')).sort());
  await ui('#mapAreaUndoBtn').click();await waitFor(()=>!getRow(filled.id),'Ångra fyllning');
  await ui('#mapAreaRedoBtn').click();await waitFor(()=>!!getRow(filled.id),'Gör om fyllning');
  await open(map,true);assert.equal(await count(),7);await select(filled.id);await active(filled.id);
  await mode('draw');
  for (const p of [[240,255],[312,255],[312,340]])await click(p);
  await click([240,255]);
  await waitFor(()=>readRows(map.id).length===8,'Slutför med första punkten');
  const drawn=readRows(map.id).at(-1);
  await active(drawn.id);
  await mode('draw');await click([70,300]);await page.keyboard.press('Escape');assert.equal(readRows(map.id).length,8);
  await select(drawn.id);await ui('[data-room-delete]').click();
  await page.locator('#appConfirm').getByRole('button',{name:'Avbryt'}).click();
  assert.ok(getRow(drawn.id),'Avbryt borttagning');
  await ui('[data-room-delete]').click();await page.locator('#appConfirmOk').click();
  await waitFor(()=>!getRow(drawn.id),'Ta bort polygon');
  await ui('#mapAreaUndoBtn').click();await waitFor(()=>!!getRow(drawn.id),'Återställ borttagen polygon');

  const beforeOverlap=writes.length;
  await open(overlapMap);
  await click([199,199]);
  const hitMenu=ui('[data-room-hits] select');
  const ids=await hitMenu.locator('option').evaluateAll(options=>options.map(o=>o.value));
  assert.deepEqual([...ids].sort(),readRows(overlapMap.id).map(r=>r.id).sort());
  const first=await hitMenu.inputValue();
  await click([199,199]);assert.notEqual(await hitMenu.inputValue(),first);
  await hitMenu.selectOption(first);await active(first);
  assert.equal(writes.length,beforeOverlap,'Val mellan överlappande rum ändrar inte geometri');

  await open(map);
  // Player rendering, using the same saved room after linking and reloading.
  await select(drawn.id);await ui('#mapAreaLocation').selectOption(location.id);
  await waitFor(()=>getRow(drawn.id).location_id===location.id,'Plats för nytt rum');
  for (const status of ['unknown','unexplored','explored']) {
    states.set(location.id,status);
    const visible=await page.evaluate(async id=>{
      closeMapAreaEditor();centralCampaignRole='player';
      await viewCampaignMap(id);
      const overlay=document.querySelector('#mapOverlay');
      return {hits:overlay.querySelectorAll('.player-hit').length,fills:[...overlay.querySelectorAll('mask polygon')].map(p=>p.getAttribute('fill')),
        editorHandles:overlay.querySelectorAll('[data-vertex-index]').length};
    },map.id);
    assert.deepEqual(visible,{hits:status==='unknown'?0:1,fills:status==='unknown'?[]:[status==='explored'?'black':'#666'],editorHandles:0});
  }
  if (visibilityPath) {
    for (const name of ['Grottsystem','Skelettbyn']) {
      const level=db.maps.find(m=>m.name===name), rooms=readRows(level.id);
      const actual=await page.evaluate(async mapId=>{
        await viewCampaignMap(mapId);
        const svg=document.querySelector('#mapOverlay');
        return {hits:svg.querySelectorAll('.player-hit').length,explored:svg.querySelectorAll('mask [fill=black]').length,
          unexplored:svg.querySelectorAll('mask [fill="#666"]').length};
      },level.id);
      const known=rooms.filter(a=>states.get(a.location_id)==='explored').length;
      const partial=rooms.filter(a=>states.get(a.location_id)==='unexplored').length;
      assert.deepEqual(actual,{hits:known+partial,explored:known,unexplored:partial});
    }
  }
  await page.close();
  const mobile=await session(true);
  await mobile.open(catacombs||map);
  const touchStart=writes.length;
  if (catacombs) {
    await mobile.click([550,180]);await mobile.ui('[data-room-id][aria-pressed=true]').waitFor();
    await mobile.ui('[data-room-center]').click();
    await mobile.ui('.room-tool-group').evaluate(el=>{
      el.style.scrollMarginTop=Math.ceil(document.querySelector('.alea-app-header').getBoundingClientRect().height+12)+'px';
      el.scrollIntoView({block:'start',behavior:'instant'});
    });
    const mobileLayout=await mobile.page.evaluate(()=>{
      const top=selector=>Math.round(document.querySelector(selector).getBoundingClientRect().top);
      return {tools:top('.room-tool-group'),map:top('.map-area-map-stage'),inspector:top('.room-properties')};
    });
    console.log('Mobil (CSS px)', mobileLayout);
    assert.ok(mobileLayout.tools<mobileLayout.map && mobileLayout.map<mobileLayout.inspector,'Mobilens verktyg, karta och vald polygon');
    await mobile.page.screenshot({path:output+'/katakomber-touch.png'});
  }
  await mobile.open(map);
  await mobile.click([340,80]);await mobile.active(movable);
  const cdp=await mobile.page.context().newCDPSession(mobile.page);
  const [x,y]=await mobile.screen([300,50]);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+18,y:y+12}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(writes.length,touchStart);
  await mobile.mode('edit');await mobile.select(movable);
  const touchPoint=getRow(movable).shape_data.points[2];
  const [tx,ty]=await mobile.screen(touchPoint);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+9,y:ty+9}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await waitFor(()=>writes.length===touchStart+1,'Avsiktlig pekdragning i Redigera');
  assert.ok(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobilbredd');
  console.log('Godkänt: kartval, platskoppling, magnet, punktredigering, fyllning, historik, omladdning, spelarens tre upptäcktslägen och pekgester.'+
    (catacombs?' Verkliga DEV-geometrier: katakomber 11, Skelettbyn 21, Grottsystem 5.':' Syntetiska provrum.'));
} finally {
  await browser.close();
}
