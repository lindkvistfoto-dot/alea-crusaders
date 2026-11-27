import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin=process.argv[2];
assert.match(origin,/^https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev\/?$/);
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>ALEA_SUPABASE_CONFIG.url),'https://wkiuyklzzroavclnsxna.supabase.co');
  const rail=page.locator('#partyRail');
  await page.locator('#loginEmail').waitFor();
  assert.equal(await rail.count(),0);
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit());
  await rail.locator('.lamp').first().waitFor({timeout:60000});
  assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'false');
  await rail.evaluate(el=>window.acceptancePartyRail=el);
  await rail.locator('#grip').click();
  await page.waitForFunction(()=>{
    const lamps=document.querySelector('#partyRail').shadowRoot.querySelectorAll('.lamp');
    return [...lamps].some(l=>/På samma sida|På en annan sida|Ej ansluten/.test(l.title));
  },null,{timeout:60000});
  assert.equal(await rail.locator('button.lamp,.mail:visible').count(),0);
  const count=await rail.locator('.member').count();
  assert.ok(count>1);
  for (const [button,section] of [['landingCharactersNavBtn','home'],['mapNavBtn','mapPage'],['diceNavBtn','dicePage']]) {
    await page.locator('#'+button).evaluate(b=>b.click());
    await page.locator('#'+section).waitFor();
    assert.ok(await rail.evaluate(el=>el===window.acceptancePartyRail));
    assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.arcane-character-rail:visible').count(),0);
  }
  await page.setViewportSize({width:390,height:844});
  await rail.locator('#grip').click();
  assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'false');
  await rail.locator('#grip').click();
  assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'true');
  await page.reload({waitUntil:'domcontentloaded'});
  await rail.locator('#grip').waitFor({timeout:60000});
  await page.evaluate(()=>logoutUser());
  await page.locator('#loginEmail').waitFor();
  assert.equal(await rail.count(),0);
  console.log('Verified authenticated home, campaign presence, character list, map, dice, mobile, reload and logout.');
} finally { await browser.close(); }
