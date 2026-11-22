import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [origin,output]=process.argv.slice(2);
assert.match(origin,/^https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev\/?$/);
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 page.on('pageerror',e=>console.log('Browser',e.stack));
 page.on('response',r=>{if(r.url().includes('adventure-player-map'))console.log('Player raster',r.status())});
 page.on('console',m=>{if(/Kunde inte (?:öppna karta|uppdatera kartor|synkronisera kampanjkartan)/.test(m.text()))console.log(m.text().slice(0,340))});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 assert.equal(await page.evaluate(()=>window.ALEA_SUPABASE_CONFIG?.url),'https://wkiuyklzzroavclnsxna.supabase.co');
 await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
 await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
 await page.locator('#loginForm').evaluate(form=>form.requestSubmit());
 await page.waitForFunction(()=>activeUser()?.id&&centralCampaignId&&chars.some(c=>c.id==='astrid'),null,{timeout:60000});
 await page.locator('#loginScreen').waitFor({state:'hidden'});
 await page.locator('#mapNavBtn').click();
 // Use the same visible map picker as the GM, even if another map is still loading.
 await page.locator('#adventureSlBoard .slcb-toggle').click();
 await page.locator('#mapPicker option').filter({hasText:'Skelettbyn'}).waitFor({state:'attached',timeout:60000});
 const target=await page.evaluate(()=>campaignMaps.find(m=>m.name==='Skelettbyn').id);
 await page.locator('#mapPicker').selectOption(target);
 await page.waitForFunction(()=>activeCampaignMap?.name==='Skelettbyn'&&document.getElementById('mapImage').naturalWidth>1,null,{timeout:60000}).catch(async e=>{
  console.log('Current display',await page.evaluate(()=>({map:activeCampaignMap?.name,manager:adventureCanManage(),loading:adventureLoading,size:document.getElementById('mapImage').naturalWidth,status:document.getElementById('mapStatusText').textContent})));
  throw e;
 });
 const expected=await page.evaluate(async()=>{
  await window.aleaCombatPaperDollMap.loadMapTokens();
  for(const id of ['astrid','lyra','evalin']){
   const char=chars.find(c=>c.id===id);
   const art=window.aleaCombatPaperDollMap.renderAdventureToken({source_type:'character',source_id:char._dbId,side:'heroes'},100);
   if(!art.includes('data-hero-class="'+id+'"'))throw Error('Hero Class missing for '+id);
  }
  const explored=campaignMapAreas.filter(a=>a.status==='explored');
  if(!explored.length||explored.length===campaignMapAreas.length)throw Error('Map needs explored and concealed rooms');
  await openMapLocationInfoByArea(explored[0].id);
  return explored.map(a=>a.id).sort();
 });
 const layout=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.width,r.right]};
  return ['.alea-app-header > .bar','#mapPage .mapworkarea','#mapLocationImagesPanel','#mapPage .mapmain','#mapLocationPanel'].map(rect);
 });
 assert.ok(Math.abs(layout[0][0]-layout[1][0])<3&&Math.abs(layout[0][2]-layout[1][2])<3,JSON.stringify(layout));
 assert.ok(Math.abs(layout[2][1]*2-layout[3][1])<3&&Math.abs(layout[4][1]-layout[2][1])<3,JSON.stringify(layout));
 await fs.mkdir(output,{recursive:true});
 await page.screenshot({path:path.join(output,'dev-skelettbyn-sl.png')});
 const mask=page.waitForResponse(r=>r.url().endsWith('/functions/v1/adventure-player-map')&&r.request().method()==='POST');
 await page.locator('#adventurePreview').click();
 const response=await mask;assert.equal(response.status(),200);
 await page.waitForFunction(()=>activeCampaignMap?.name==='Skelettbyn'&&document.querySelector('#mapImage').naturalWidth>1,null,{timeout:20000}).catch(async e=>{
  console.log('Current display',await page.evaluate(()=>({map:activeCampaignMap?.name,manager:adventureCanManage(),size:document.getElementById('mapImage').naturalWidth,status:document.getElementById('mapStatusText').textContent})));
  throw e;
 });
 assert.deepEqual(await page.evaluate(()=>campaignMapAreas.map(a=>a.id).sort()),expected);
 const cached=await page.evaluate(async()=>{
  const before=activeCampaignMap.image_url,tag=adventureProjectionTag;
  await viewCampaignMap(activeCampaignMap.id,false);
  return {conditional:!!tag,same:before===activeCampaignMap?.image_url};
 });
 if(cached.conditional)assert.ok(cached.same,'An unchanged projection should preserve its image and lighting canvas');
 assert.equal(await page.locator('.sl-outline,.map-location-gm,[data-concealed]').count(),0);
 await page.screenshot({path:path.join(output,'dev-skelettbyn-spelarvy.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#adventurePreview').click();
 await page.waitForFunction(()=>activeCampaignMap?.name==='Skelettbyn'&&adventureCanManage());
 await page.evaluate(()=>resetMapView());
 await page.screenshot({path:path.join(output,'dev-skelettbyn-mobil.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 console.log('DEV Skelettbyn: '+expected.length+' explored rooms, verified projection, 3 Hero Class poses, desktop and mobile.');
}finally{await browser.close();}
