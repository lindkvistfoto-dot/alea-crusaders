// A real Admin → Platser → Kartverkstad session in Chromium. Only the network
// data is replaced with a disposable campaign; signed-in DEV play is separate.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, painting, output] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
await mkdir(output,{recursive:true});
const image = 'data:image/webp;base64,'+(await readFile(painting)).toString('base64');
const browser = await chromium.launch({...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'}),
  args:['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
try {
  await page.route(/^https?:/, r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js',
    r => r.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'}));
  await page.goto(origin);
  await page.waitForFunction(()=>window.aleaKartakademin && typeof openMapAreaEditor === 'function');
  await page.evaluate(async image => {
    const map = {id:crypto.randomUUID(),campaign_id:crypto.randomUUID(),site_id:crypto.randomUUID(),
      name:'Den målade kryptan',width:447,height:475,image_url:image};
    const character = crypto.randomUUID();
    const room={id:crypto.randomUUID(),location_id:crypto.randomUUID(),status:'explored',
      shape_type:'rect',shape_data:{x:0,y:0,width:447,height:475}};
    campaignSites=[{id:map.site_id,name:'Ljusprovet'}]; campaignMaps=[map];
    campaignLocations=[{id:room.location_id,name:'Kryptan',site_id:map.site_id,location_key:'1'}];
    centralCampaignRole='gm'; chars=[{_dbId:character,name:'Evalin'}];
    window.getMapImageUrl=async()=>image;
    // A known walkable floor inside two solid boundaries. The receiver extends
    // onto those solid pixels; it must not change the walkable/visible raster.
    const runs=[];
    for(let y=118;y<475;y++) runs.push([447*y+50,397]);
    let configuration={version:1,lights:[],geometry:[],darkness:.78,pixelsPerMeter:17,
      freeSight:{width:447,height:475,runs}},revision=1,positions=[{character_id:character,position:[162,150]}];
    window.dbJson=async(path,request)=>{
      if(path === 'rpc/save_campaign_map_academy'){
        const body=JSON.parse(request.body);
        if(body.p_revision!==revision)throw Error('Revision conflict');
        configuration=body.p_configuration;
        for(const p of body.p_positions)positions=[...positions.filter(i=>i.character_id!==p.character_id),p];
        return ++revision;
      }
      if(path.startsWith('campaign_map_academy?'))return [{configuration:structuredClone(configuration),revision}];
      if(path.startsWith('campaign_map_character_positions?'))return structuredClone(positions);
      if(path.startsWith('campaign_map_areas?'))return [room];
      if(path.startsWith('campaign_locations?'))return campaignLocations;
      if(path.startsWith('campaign_location_state?'))return [{location_id:room.location_id,status:'explored'}];
      return [];
    };
    window.surfaceFixture={map,room,character,config:()=>structuredClone(configuration)};
    document.querySelector('#loginScreen').classList.add('hidden');
    document.querySelectorAll('header,main,#admin,#adminNavBtn').forEach(el=>el.classList.remove('hidden'));
    document.querySelectorAll('main > section:not(#admin)').forEach(el=>el.classList.add('hidden'));
    await openAdminSection('places'); await openMapAreaEditor(map.id);
  },image);
  const ui=selector=>page.locator('#mapAreaEditor '+selector);
  const click=selector=>ui(selector).click();
  async function mapClick(x,y) {
    const p=await ui('#mapAreaSvg').evaluate((svg,[x,y])=>{
      const point=new DOMPoint(x,y).matrixTransform(svg.getScreenCTM());return [point.x,point.y];
    },[x,y]);
    await page.mouse.click(...p);
  }
  async function ready(){await ui('.kartakademin-canvas').waitFor();await page.waitForFunction(()=>document.querySelector('[data-map-scale]')?.textContent.includes('px/m'));}
  const reopen=async()=>{await page.evaluate(()=>openMapAreaEditor(window.surfaceFixture.map.id));await ready();};
  const surface=async()=>{await click('[data-mode-button=lights]');await click('[data-tool-choice=surface]');};
  const save=async()=>{await click('[data-save]');await ui('[data-save-status][data-status=saved]').waitFor();};
  await ready();await surface();
  for(const [x,y] of [[125,118],[315,118],[240,51],[50,323],[50,195],[27,254]]){
    if(x===50&&y===323)await ui('[data-items]').selectOption('');
    await mapClick(x,y);
  }
  await click('[data-tool-choice=light]');
  await mapClick(162,150);
  await ui('[name=characterId]').selectOption(await page.evaluate(()=>window.surfaceFixture.character));
  await ui('[name=playerVisible]').check();
  await save();await reopen();await surface();
  assert.equal(await ui('[data-items] option').count(),3);
  await ui('[data-items]').selectOption({index:1});
  await mapClick(230,52);await save();await reopen();await surface();
  const stored=await page.evaluate(()=>window.surfaceFixture.config());
  assert.equal(stored.geometry.length,2);
  assert.ok(Math.abs(stored.geometry[0].face[0][1]-52)<2);
  assert.equal(stored.lights.length,1);assert.ok(stored.lights[0].characterId);
  await page.screenshot({path:output+'/admin.png'});
  const screenshot=async name=>{
    // Hiding only editor guides uses the real editor's light-result control.
    await ui('[data-light-only]').check();
    const png=await ui('.kartakademin-canvas').screenshot({path:output+'/'+name+'.png'});
    await ui('[data-light-only]').uncheck();return png.toString('base64');
  };
  async function torch(on){await click('[data-tool-choice=light]');await click('[data-light-id]');await ui('[name=on]').setChecked(on);}
  async function move(x,y){await click('[data-tool-choice=position]');await ui('[data-items]').selectOption({index:1});await mapClick(x,y);}
  await torch(false);const dark=await screenshot('slackt');
  await torch(true);const near=await screenshot('nara');
  await move(284,147);const along=await screenshot('langs');
  await move(245,316);const far=await screenshot('bort');
  await move(76,233);const west=await screenshot('vast');
  await click('[data-tool-choice=light]');await click('[data-new]');await mapClick(162,150);
  const both=await screenshot('tva-ljus');
  const results=await page.evaluate(async shots=>{
    const samples=[];
    for(const b64 of shots){
      const img=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob());
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const mean=(x,y)=>{
        const sx=Math.round(img.width*x/447),sy=Math.round(img.height*y/475);
        const pix=ctx.getImageData(sx-2,sy-2,5,5).data;
        let total=0;
        for(let i=0;i<pix.length;i+=4)total+=(pix[i]+pix[i+1]+pix[i+2])/3;
        return +(total/25).toFixed(2);
      };
      samples.push([[162,85],[284,85],[37,233],[161,42],[161,157]].map(([x,y])=>mean(x,y)));
      img.close();
    }return samples;
  },[dark,near,along,far,west,both]);
  console.log('Pixel measurements [north W, north E, west, behind, floor]',results);
  assert.ok(results[0][0]>1 && results[1][0]>results[0][0]+6);
  assert.ok(results[2][1]>results[1][1]+5 && results[2][0]<results[1][0]-5);
  assert.ok(Math.abs(results[3][0]-results[0][0])<1 && Math.abs(results[1][3]-results[0][3])<1);
  assert.ok(results[4][2]>results[0][2]+6 && results[5][0]>results[4][0]+6 && results[5][2]>results[0][2]+6);
  await surface();await ui('[data-items]').selectOption({index:1});await click('[data-surface-remove]');await save();await reopen();
  const removed=await page.evaluate(()=>window.surfaceFixture.config().geometry);
  assert.equal(removed.filter(w=>w.face).length,1);assert.ok(removed.every(w=>w.light));
  await page.setViewportSize({width:390,height:844});await surface();
  for(const selector of ['[data-tool-choice=surface]','[data-items]','[data-save]']){
    await ui(selector).scrollIntoViewIfNeeded();
    assert.ok(await ui(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0 && r.x>=-1 && r.right<=innerWidth+1;}));
  }
  await page.screenshot({path:output+'/mobil.png'});
  await writeFile(output+'/results.json',JSON.stringify({samples:results},null,2));
} finally {await browser.close();}
