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
const linkedRoom = {...location,id:randomUUID(),name:'Östra rummet',location_key:'2'};
db.maps.push(map); db.sites.push(site); db.locations.push(location,linkedRoom);
const room = (points) => {
  const row = {id:randomUUID(),campaign_id:campaign,map_id:map.id,location_id:null,
    shape_type:'polygon',shape_data:{points},sort_order:db.areas.filter(a=>a.map_id===map.id).length};
  db.areas.push(row); return row.id;
};
const rectangle = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const frame = [rectangle(30,30,160,50),rectangle(30,140,160,50),rectangle(30,80,50,60),rectangle(140,80,50,60)].map(room);
db.areas.find(row=>row.id===frame[3]).location_id=linkedRoom.id;
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
const seamMap = {...map,id:randomUUID(),name:'Öppen väggskarv'};
const seamRooms = [rectangle(80,100,100,150),rectangle(186,100,100,150)].map((points,index)=>({
  id:randomUUID(),map_id:seamMap.id,campaign_id:campaign,shape_type:'polygon',shape_data:{points},
  sort_order:index,location_id:index?null:linkedRoom.id,updated_at:timestamp(),
}));
db.maps.push(seamMap);
db.areas.push(...seamRooms);
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
    // Mobile's sticky header can cover a map that Chromium otherwise considers visible.
    const stage=ui('.map-area-map-stage');
    if (touch) await stage.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    else await stage.scrollIntoViewIfNeeded();
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

const pointString = points => points.map(p=>p.join(',')).join(' ');
const parsePoints = value => value.split(' ').map(pair=>pair.split(',').map(Number));
function polygonArea(points) {
  return Math.abs(points.reduce((sum,[x,y],index)=>{
    const [nx,ny]=points[(index+1)%points.length];
    return sum+x*ny-nx*y;
  },0))/2;
}
// A repair updates exactly one existing row. Check untouched records, the
// recipient's identity/metadata, and the number and exact value of all writes.
function checkRepair(before, recipient, afterPoints, firstWrite) {
  assert.deepEqual(writes.slice(firstWrite).map(op=>op.map(change=>change.id)),[[recipient]]);
  assert.deepEqual(readRows(before[0].map_id).map(r=>r.id),before.map(r=>r.id));
  for (const row of before) {
    const saved=getRow(row.id);
    if (row.id===recipient) {
      assert.deepEqual(saved,{...row,updated_at:saved.updated_at,shape_data:{...row.shape_data,points:afterPoints}});
    } else assert.deepEqual(saved,row);
  }
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
    const picker=ui('[data-gap-target]');
    await ui('[data-gap-preview]').waitFor();
    const beforeRepair=structuredClone(readRows(catacombs.id));
    const [roomThree,roomNine]=[2,8].map(order=>beforeRepair.find(row=>row.sort_order===order));
    assert.deepEqual((await picker.locator('option').evaluateAll(nodes=>nodes.map(o=>o.value))).sort(),[roomThree.id,roomNine.id].sort());
    assert.equal(await picker.inputValue(),roomNine.id,'Den längsta gemensamma gränsen föreslås');
    await picker.selectOption(roomThree.id);
    const preview=ui('[data-gap-repair-id="'+roomThree.id+'"]');
    const mergedPoints=parsePoints(await preview.getAttribute('points'));
    assert.ok(Math.abs(polygonArea(mergedPoints)-polygonArea(roomThree.shape_data.points)-147.7)<1e-6,'DEV-glipans exakta yta');
    await page.screenshot({path:output+'/katakomber-glipa.png'});
    const firstWrite=writes.length;
    await ui('#mapAreaSaveBtn').click();await waitFor(()=>writes.length>firstWrite,'Laga katakombernas glipa');
    checkRepair(beforeRepair,roomThree.id,mergedPoints,firstWrite);
    await active(roomThree.id);
    assert.equal(await count(),11);
    await ui('#mapAreaUndoBtn').click();
    await waitFor(()=>pointString(getRow(roomThree.id).shape_data.points)===pointString(roomThree.shape_data.points),'Återställ glipa');
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
  const [left,right]=frame.slice(2);
  await select(left);
  const beforeRepair=structuredClone(readRows(map.id));
  const firstRepairWrite=writes.length;
  await mode('fill');await click([110,110]);
  const target=ui('[data-gap-target]');
  assert.equal(await target.inputValue(),left,'Ett markerat angränsande rum prioriteras');
  assert.deepEqual((await target.locator('option').evaluateAll(nodes=>nodes.map(o=>o.value))).sort(),[...frame].sort());
  await target.selectOption(right);
  const preview=ui('[data-gap-repair-id="'+right+'"]');
  await preview.waitFor();
  const repairedPoints=parsePoints(await preview.getAttribute('points'));
  // The right frame plus gap equals [80,190] × [80,140], with any
  // additional collinear vertices retained for the neighboring boundaries.
  assert.equal(polygonArea(repairedPoints),110*60);
  for(const [x,y] of repairedPoints) assert.ok(x>=80 && x<=190 && y>=80 && y<=140);
  assert.match(await ui('#mapAreaSaveBtn').innerText(),/Polygon 4/);
  await page.screenshot({path:output+'/fill-preview.png'});
  await ui('#mapAreaCancelBtn').click();
  await active(left);
  assert.equal(writes.length,firstRepairWrite);
  assert.deepEqual(readRows(map.id),beforeRepair,'Avbruten lagning får inte skriva en enda ändring');

  await mode('fill');await click([110,110]);await target.selectOption(right);
  await ui('#mapAreaSaveBtn').click();
  await waitFor(()=>writes.length>firstRepairWrite,'Laga östra rummets gräns');
  checkRepair(beforeRepair,right,repairedPoints,firstRepairWrite);
  await active(right);assert.equal(await count(),6);
  await ui('#mapAreaUndoBtn').click();
  const originalRight=beforeRepair.find(r=>r.id===right);
  await waitFor(()=>pointString(getRow(right).shape_data.points)===pointString(originalRight.shape_data.points),'Ångra lagning');
  await ui('#mapAreaRedoBtn').click();
  await waitFor(()=>pointString(getRow(right).shape_data.points)===pointString(repairedPoints),'Gör om lagning');
  await open(map,true);assert.equal(await count(),6);await select(right);await active(right);
  assert.equal(await ui('#mapAreaLocation').inputValue(),linkedRoom.id);
  assert.equal(await ui('#mapAreaRoomLayer [data-area-id="'+right+'"]').getAttribute('points'),pointString(repairedPoints));
  await mode('fill');
  assert.equal(await ui('[data-gap-candidate]').count(),0,'Den lagade glipan ska inte återkomma efter omladdning');
  await mode('draw');
  for (const p of [[240,255],[312,255],[312,340]])await click(p);
  await click([240,255]);
  await waitFor(()=>readRows(map.id).length===7,'Slutför med första punkten');
  const drawn=readRows(map.id).at(-1);
  await active(drawn.id);
  await mode('draw');await click([70,300]);await page.keyboard.press('Escape');assert.equal(readRows(map.id).length,7);
  await select(drawn.id);await ui('[data-room-delete]').click();
  await page.locator('#appConfirm').getByRole('button',{name:'Avbryt'}).click();
  assert.ok(getRow(drawn.id),'Avbryt borttagning');
  await ui('[data-room-delete]').click();await page.locator('#appConfirmOk').click();
  await waitFor(()=>!getRow(drawn.id),'Ta bort polygon');
  await ui('#mapAreaUndoBtn').click();await waitFor(()=>!!getRow(drawn.id),'Återställ borttagen polygon');

  await open(seamMap);
  await mode('fill');assert.equal(await ui('[data-gap-candidate]').count(),0);
  const seamSource=seamRooms[0].id;
  const beforeSeam=structuredClone(readRows(seamMap.id)),seamWrite=writes.length;
  async function pickSeam(){
    await ui('[data-gap-edges]').click();
    await click([179,175]);await ui('[data-seam-source]').waitFor({state:'attached'});
    await click([187,175]);await ui('[data-seam-target]').waitFor({state:'attached'});
    await ui('[data-gap-preview]').waitFor();
  }
  await pickSeam();await page.keyboard.press('Escape');
  assert.equal(writes.length,seamWrite);assert.deepEqual(readRows(seamMap.id),beforeSeam);
  await mode('fill');await pickSeam();
  const seamPatch=parsePoints(await ui('[data-gap-preview]').getAttribute('points'));
  assert.equal(polygonArea(seamPatch),6*150,'Laga en öppen skarv, kant till kant');
  const seamResult=parsePoints(await ui('[data-gap-repair-id="'+seamSource+'"]').getAttribute('points'));
  assert.equal(polygonArea(seamResult),106*150);
  assert.ok(seamResult.some(([x,y])=>x===186 && y===100) && seamResult.some(([x,y])=>x===186 && y===250));
  await page.screenshot({path:output+'/open-seam-preview.png'});
  await ui('#mapAreaSaveBtn').click();await waitFor(()=>writes.length>seamWrite,'Laga öppen skarv');
  checkRepair(beforeSeam,seamSource,seamResult,seamWrite);
  await active(seamSource);assert.equal(await count(),2);
  await ui('#mapAreaUndoBtn').click();
  await waitFor(()=>pointString(getRow(seamSource).shape_data.points)===pointString(beforeSeam[0].shape_data.points),'Ångra öppen skarv');

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
  const cdp=await mobile.page.context().newCDPSession(mobile.page);
  const mobileUi=mobile.ui;
  const panButton=mobileUi('[data-pan-tool]'),rulerButton=mobileUi('[data-ruler-tool]');
  const notice=mobileUi('#mapAreaNotice');
  const touchMode=key=>mobileUi('[data-room-mode='+key+']').tap();
  async function dragMap(point,dx,dy) {
    const [x,y]=await mobile.screen(point);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }

  // A tap on the already current Välj tool must take the pointer back from
  // Panorera, even when a zoom redraw has turned each room into a reference.
  const level=catacombs || map;
  const targetRoom=catacombs ? readRows(level.id).find(r=>r.sort_order===4) : getRow(frame[1]);
  const targetPoint=catacombs ? [560,520] : [119,165];
  const originalMobileRows=structuredClone(readRows(level.id));
  await touchMode('edit');
  assert.match(await notice.innerText(),/Tryck på rummet/i,'Redigera visar hur första rummet väljs');
  await touchMode('select');
  await panButton.tap();
  await mobileUi('[data-zoom-in]').tap();await mobileUi('[data-zoom-in]').tap();
  assert.equal(await mobileUi('[data-zoom-percent]').textContent(),'156 %');
  assert.equal(await panButton.getAttribute('aria-pressed'),'true');
  assert.equal(await mobileUi('[data-room-mode][aria-pressed=true]').count(),0,'Endast kameraverktyget ska visas aktivt');
  assert.match(await notice.innerText(),/Panorera/i);
  await touchMode('select');
  assert.equal(await panButton.getAttribute('aria-pressed'),'false','Välj måste återta pekaren från Panorera');
  assert.equal(await mobileUi('[data-room-mode=select]').getAttribute('aria-pressed'),'true');
  await mobile.click(targetPoint);await mobile.active(targetRoom.id);
  const selectedName='Polygon '+(targetRoom.sort_order+1);
  assert.ok((await notice.innerText()).includes(selectedName),'Vald polygons identitet behövs direkt intill kartan');
  assert.ok((await notice.innerText()).includes(targetRoom.location_id?'Rum':'Saknar plats'));
  assert.equal(await mobileUi('.map-editor-zone.reference').count(),0);
  assert.equal(await mobileUi('.map-editor-zone.selected').getAttribute('data-area-id'),targetRoom.id);
  assert.deepEqual(readRows(level.id),originalMobileRows);

  // The room above stays selected while the camera moves. Tile coordinates,
  // the zoom setting and stored geometry are independent of the camera offset.
  await panButton.tap();
  const canvas=mobileUi('#mapAreaCanvas'),leftBefore=await canvas.evaluate(el=>el.style.left);
  await dragMap(targetPoint,25,16);
  assert.notEqual(await canvas.evaluate(el=>el.style.left),leftBefore,'Pekdragning med handen panorerar kartan');
  await touchMode('edit');
  assert.equal(await panButton.getAttribute('aria-pressed'),'false');
  await mobileUi('[data-vertex-index]').first().waitFor({state:'attached'});
  assert.ok((await notice.innerText()).includes(selectedName));
  // A nudge or a cancelled touch over a tool must not take a pan gesture.
  await panButton.tap();
  const selectTool=mobileUi('[data-room-mode=select]');
  await selectTool.scrollIntoViewIfNeeded();
  const box=await selectTool.boundingBox(),bx=box.x+box.width/2,by=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bx,y:by}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:bx+25,y:by}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await panButton.getAttribute('aria-pressed'),'true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bx,y:by}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await panButton.getAttribute('aria-pressed'),'true');
  await mobileUi('[data-room-id="'+targetRoom.id+'"]').tap();
  assert.equal(await panButton.getAttribute('aria-pressed'),'false','Listval tar tillbaka pekaren');
  await mobileUi('[data-layer=rooms]').uncheck();await touchMode('select');
  assert.ok(await mobileUi('[data-layer=rooms]').isChecked());
  await mobileUi('[data-light-only]').check();await touchMode('select');
  assert.equal(await mobileUi('[data-light-only]').isChecked(),false);
  await rulerButton.tap();
  assert.equal(await rulerButton.getAttribute('aria-pressed'),'true');
  assert.match(await notice.innerText(),/Linjal/i);
  await touchMode('fill');
  assert.equal(await rulerButton.getAttribute('aria-pressed'),'false');
  assert.equal(await mobileUi('[data-room-mode=fill]').getAttribute('aria-pressed'),'true');
  await touchMode('select');
  assert.equal(writes.length,touchStart);
  assert.deepEqual(readRows(level.id),originalMobileRows);

  await mobileUi('.room-tool-group').evaluate(el=>{
    el.style.scrollMarginTop=Math.ceil(document.querySelector('.alea-app-header').getBoundingClientRect().height+12)+'px';
    el.scrollIntoView({block:'start',behavior:'instant'});
  });
  const mobileLayout=await mobile.page.evaluate(()=>{
    const bounds=selector=>{
      const {top,bottom}=document.querySelector(selector).getBoundingClientRect();
      return {top:Math.round(top),bottom:Math.round(bottom)};
    };
    return {toolbar:bounds('#mapAreaToolbar'),notice:bounds('#mapAreaNotice'),map:bounds('.map-area-map-stage'),
      inspector:bounds('.room-properties'),height:innerHeight};
  });
  console.log('Mobil (CSS px)', mobileLayout);
  assert.ok(mobileLayout.toolbar.bottom<=mobileLayout.notice.top+1 && mobileLayout.notice.bottom<=mobileLayout.map.top+1 &&
    mobileLayout.map.bottom<=mobileLayout.inspector.top+1 && mobileLayout.notice.top>=0 && mobileLayout.notice.bottom<mobileLayout.height,
    'Mobil visar verktygen, vald polygon och kartan i den ordningen utan att de överlappar');
  await mobile.page.screenshot({path:output+(catacombs?'/katakomber-touch.png':'/verktyg-touch.png')});

  await mobile.open(seamMap);
  await touchMode('draw');await mobile.click([100,315]);await mobile.click([190,315]);
  const draft=mobileUi('[data-draft-vertex]');
  assert.equal(await draft.count(),2);
  await panButton.tap();await dragMap([140,215],22,12);await touchMode('draw');
  assert.equal(await draft.count(),2,'Tillfällig panorering ska bevara ett påbörjat utkast');
  await mobileUi('#mapAreaCancelBtn').tap();
  await touchMode('fill');await panButton.tap();await mobileUi('[data-gap-edges]').tap();
  assert.equal(await panButton.getAttribute('aria-pressed'),'false');
  await mobile.click([176,175]);await mobileUi('[data-seam-source]').waitFor({state:'attached'});
  await panButton.tap();await mobileUi('[data-gap-edges]').tap();
  assert.equal(await panButton.getAttribute('aria-pressed'),'false');
  await mobileUi('[data-seam-source]').waitFor({state:'attached'});
  await mobile.click([189,175]);await mobileUi('[data-gap-repair-id="'+seamSource+'"]').waitFor();
  await mobileUi('#mapAreaCancelBtn').tap();
  assert.equal(writes.length,touchStart,'Pekförhandsvisning av väggskarv ska inte sparas');
  await mobile.open(map);
  await mobile.click([340,80]);await mobile.active(movable);
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
