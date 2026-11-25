import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const preview = 'https://1397361b.alea-crusaders.pages.dev/';
const mapId = 'c1c82cce-073d-4c3f-8f0c-b7244c759521';
const sceneId = '939b6c94-c52a-4b4e-b5d0-72db108f3d46';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1600,height:1000}});
  await page.goto(preview);
  if (await page.evaluate(() => window.ALEA_SUPABASE_CONFIG?.url) !== 'https://wkiuyklzzroavclnsxna.supabase.co') throw Error('Fel DEV-miljö');
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => typeof centralCampaignId !== 'undefined' && centralCampaignId === '846e8089-24da-4825-af34-32903117152a' && canManageCampaignMaps(),null,{timeout:60000});
  await page.evaluate(async ({mapId,sceneId}) => {
    const overview = 'dca58a7b-217d-46bc-8526-1468fad1dd69';
    const [parent] = await dbJson('campaign_maps?id=eq.'+overview+'&select=site_id');
    const [scene] = await dbJson('campaign_combat_scenes?id=eq.'+sceneId+'&select=*');
    if (scene.name !== 'Bystrid Skelett' || scene.settings.rows!==10 || scene.background_width!==1254 || scene.background_height!==1254) throw Error('Scenen har ändrats');
    const path=centralCampaignId+'/'+mapId+'/map.webp';
    const source=await mapStorageFetch('object/authenticated/combat-scene-maps/'+encodeStoragePath(scene.background_image_path));
    if(!source.ok)throw Error('Källbild '+source.status);
    const blob=await source.blob();
    const rows=await dbJson('campaign_maps?id=eq.'+mapId+'&select=id,image_path');
    if(!rows.length)await dbJson('campaign_maps',{method:'POST',body:JSON.stringify({id:mapId,campaign_id:centralCampaignId,site_id:parent.site_id,name:'Bystrid Skelett – spelprov',image_path:path,width:1254,height:1254,pixels_per_meter:83.6,fully_revealed:true,created_by:supabaseSession.user.id})});
    else if(rows[0].image_path!==path)throw Error('Kartans bildsökväg har ändrats');
    const target='object/authenticated/campaign-maps/'+encodeStoragePath(path);
    let saved=await mapStorageFetch(target);
    if(!saved.ok){
      const uploaded=await mapStorageFetch('object/campaign-maps/'+encodeStoragePath(path),{method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob});
      if(!uploaded.ok)throw Error('Kunde inte kopiera bilden '+uploaded.status);
      saved=await mapStorageFetch(target);
    }
    const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).join(',');
    if(!saved.ok||await digest(await saved.blob())!==await digest(blob))throw Error('Kartkopian avviker');
  },{mapId,sceneId});
  await page.goto(preview+'?view=adventure&map='+mapId);
  await page.waitForFunction(id=>typeof activeCampaignMap!=='undefined' && activeCampaignMap?.id===id,mapId,{timeout:60000});
  // A retry may revisit the same fight. Never reset an encounter that has been played.
  if(!await page.evaluate(async mapId=>(await dbJson('combat_instances?map_id=eq.'+mapId+'&select=id',{headers:{'x-client-info':'alea-adventure-combat'}})).length,mapId)){
    if(!await page.evaluate(()=>activateViewedMap()))throw Error('SL kunde inte aktivera provkartan');
    if(!await page.locator('[data-field=seedScene]').isVisible())await page.locator('[aria-controls=adventureFigurePanel]').click();
    await page.locator('[data-field=seedScene]').selectOption(sceneId);
    await page.locator('[data-action=start-encounter]').click();
  }
  await page.frameLocator('iframe.adventure-encounter-frame').getByText('Runda 1',{exact:true}).first().waitFor({timeout:45000});
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/bystrid-start.png'});
} finally { await browser.close(); }
