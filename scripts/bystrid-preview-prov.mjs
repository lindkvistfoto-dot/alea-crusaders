import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const preview = 'https://23c840a4.alea-crusaders.pages.dev/';
const mapId = 'c1c82cce-073d-4c3f-8f0c-b7244c759521';
const sceneId = '939b6c94-c52a-4b4e-b5d0-72db108f3d46';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1536,height:800}});
  await page.goto(preview);
  if (await page.evaluate(() => window.ALEA_SUPABASE_CONFIG?.url) !== 'https://wkiuyklzzroavclnsxna.supabase.co') throw Error('Fel DEV-miljö');
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => typeof centralCampaignId !== 'undefined' && centralCampaignId === '846e8089-24da-4825-af34-32903117152a' && canManageCampaignMaps(),null,{timeout:60000});
  await page.goto(preview+'?view=adventure&map='+mapId);
  const frame=page.frameLocator('iframe.adventure-encounter-frame');
  for(const hero of ['astrid','lyra','evalin']){
    const pose=frame.locator('.combat-token-group [data-hero-class="'+hero+'"]');
    await pose.waitFor({timeout:45000});
    const original=page.locator('.adventure-figure-layer [data-hero-class="'+hero+'"]');
    const attrs=el=>['href','width','height','x','y'].map(a=>el.getAttribute(a));
    const a=await original.locator('image').evaluate(attrs);
    const b=await pose.locator('image').evaluate(attrs);
    if(a[0]!==b[0] || a.slice(1).some((n,i)=>Math.abs(n-b[i+1])>.001))throw Error('Figuren skiljer sig: '+hero);
  }
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/bystrid-start.png'});
} finally { await browser.close(); }
