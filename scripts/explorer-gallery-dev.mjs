import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, output] = process.argv.slice(2);
assert.match(origin, /^https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev\/?$/);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(origin, {waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>ALEA_SUPABASE_CONFIG.url),'https://wkiuyklzzroavclnsxna.supabase.co');
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>activeUser()?.id && centralCampaignId,null,{timeout:60000});
  await page.locator('#mapNavBtn').click();
  await page.locator('#adventureSlBoard .slcb-toggle').click();
  await page.locator('#mapPicker option').filter({hasText:'Skelettbyn'}).first().waitFor({state:'attached',timeout:60000});
  const mapId = await page.evaluate(()=>campaignMaps.find(m=>m.name==='Skelettbyn')?.id);
  assert.ok(mapId);
  await page.locator('#mapPicker').selectOption(mapId);
  await page.waitForFunction(id=>activeCampaignMap?.id===id && campaignMapAreas.some(a=>a.status==='explored'),mapId);
  const projection = page.waitForResponse(r=>r.url().endsWith('/functions/v1/adventure-player-map') && r.request().method()==='POST');
  await page.locator('#adventurePreview').click();
  assert.equal((await projection).status(),200);
  await page.waitForFunction(id=>activeCampaignMap?.id===id && !adventureCanManage() && document.querySelector('#mapImage').naturalWidth,mapId);
  await page.evaluate(()=>openMapLocationInfoByArea(campaignMapAreas.find(a=>a.status==='explored').id));
  const gallery=page.locator('#explorerGallery');
  await gallery.waitFor();
  await page.waitForFunction(()=>{
    const root=document.querySelector('#explorerGallery');
    return root.style.getPropertyValue('--eg-THUMB_ACTIVE') && root.querySelector('canvas').width===Math.round(root.clientWidth*devicePixelRatio);
  });
  await gallery.locator('[data-do=full] img:not([hidden])').waitFor({timeout:45000});
  assert.ok(await page.evaluate(()=>campaignMapAreas.every(a=>a.status==='explored')));
  const hiddenNames=await gallery.locator('select option').evaluateAll(options=>options.filter(o=>!campaignMaps.some(m=>m.player_visible&&m.id===o.value)).length);
  assert.equal(hiddenNames,0);
  await page.screenshot({path:output+'/dev-desktop.png'});
  await gallery.screenshot({path:output+'/dev-panel.png'});
  await gallery.locator('[data-do=expand]').click();
  await page.locator('dialog.explorer-image-viewer[open] img').evaluate(img=>img.decode());
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await gallery.scrollIntoViewIfNeeded();
  await page.screenshot({path:output+'/dev-mobile.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log('DEV: inloggad kampanj, serverbeskuren karta, delad bildhistorik, HERMES, helbild, desktop och mobil.');
} finally { await browser.close(); }
