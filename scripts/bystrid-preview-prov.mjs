import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const preview = 'https://dab39658.alea-crusaders.pages.dev/';
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
  await frame.locator('.combat-row-move:enabled').waitFor({timeout:60000});
  const receipt=await page.evaluate(()=>dbJson('rpc/bystrid_preview_move_probe_975',{method:'POST',headers:{'x-client-info':'alea-adventure-combat'},body:'{}'}));
  if(receipt.spent!==1 || receipt.rolled_back!==true)throw Error('Fel vid rörelseprov');
  console.log('DEV: ett rörelsepoäng, kartfigur synkad, provet tillbakarullat');
  await page.getByRole('button',{name:'Utforskning',exact:true}).click();
  await frame.locator('#appConfirm:not(.hidden)').getByRole('button',{name:'Avbryt'}).click();
  const btn=frame.locator('.combat-row-move');
  const size=await btn.boundingBox();
  if(Math.abs(size.width-size.height)>1)throw Error('Ikonens mått '+JSON.stringify(size));
  await btn.click();
  const tile=frame.locator('.combat-movement-hit[data-q="0"][data-r="6"]');
  await tile.click();
  const confirm=frame.getByRole('button',{name:'Bekräfta förflyttning'});
  if(!await confirm.isEnabled())throw Error('Ingen valbar destination');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/bystrid-start.png'});
  await frame.locator('.combat-movement-panel').getByRole('button',{name:'Avbryt'}).click();
} finally { await browser.close(); }
