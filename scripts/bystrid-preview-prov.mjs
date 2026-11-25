import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const previews=['https://23c840a4.alea-crusaders.pages.dev/','https://d04d7294.alea-crusaders.pages.dev/'];
const mapId = 'c1c82cce-073d-4c3f-8f0c-b7244c759521';
const sceneId = '939b6c94-c52a-4b4e-b5d0-72db108f3d46';
const browser = await chromium.launch();
try {
  for(const preview of [...previews,...previews.slice().reverse(),...previews]){
  const page = await browser.newPage({viewport:{width:1536,height:800}});
  await page.goto(preview);
  if (await page.evaluate(() => window.ALEA_SUPABASE_CONFIG?.url) !== 'https://wkiuyklzzroavclnsxna.supabase.co') throw Error('Fel DEV-miljö');
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => typeof centralCampaignId !== 'undefined' && centralCampaignId === '846e8089-24da-4825-af34-32903117152a' && canManageCampaignMaps(),null,{timeout:60000});
  let reads=0;page.on('request',r=>{if(r.url().includes('/rest/v1/'))reads++});
  const start=Date.now();
  await page.goto(preview+'?view=adventure&map='+mapId);
  const frame=page.frameLocator('iframe.adventure-encounter-frame');
  const token=frame.locator('.combat-token-group').first();
  try {await token.waitFor({timeout:60000});}
  catch(error){console.log('unavailable',preview,'frames',page.frames().length);await page.close();continue;}
  console.log('BENCHMARK',preview,Date.now()-start,reads);
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/bystrid-start.png'});
  await page.close();
  }
} finally { await browser.close(); }
