import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin=process.argv[2];
assert.match(origin,/^https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev\/?$/);
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({hasTouch:true,viewport:{width:1440,height:960}});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>ALEA_SUPABASE_CONFIG.url),'https://wkiuyklzzroavclnsxna.supabase.co');
  const rail=page.locator('#partyRail');
  await page.locator('#loginEmail').waitFor();
  assert.equal(await rail.count(),0);
  await page.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await page.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await page.locator('#loginForm').evaluate(form=>form.requestSubmit());
  await rail.locator('#grip').waitFor({timeout:60000});
  await mkdir('rail-results',{recursive:true});
  assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'false');
  await rail.evaluate(el=>window.acceptancePartyRail=el);
  await page.screenshot({path:'rail-results/desktop-closed.png',mask:[page.locator('#sessionUser:visible')]});
  await rail.locator('#grip').click();
  await page.waitForFunction(()=>{
    const lamps=document.querySelector('#partyRail').shadowRoot.querySelectorAll('.lamp');
    return [...lamps].some(l=>/På samma sida|På en annan sida|Ej ansluten/.test(l.getAttribute('aria-label')));
  },null,{timeout:60000});
  assert.equal(await rail.locator('button.lamp,.mail:visible').count(),0);
  const count=await rail.locator('.member').count();
  assert.ok(count>1);
  const expected=await page.evaluate(async()=>{
    const members=await dbJson('campaign_members?campaign_id=eq.'+encodeURIComponent(centralCampaignId)+'&select=user_id');
    return new Set([...members.map(member=>member.user_id),activeUser().id]).size;
  });
  assert.equal(count,expected,'One lamp for each person in the campaign');
  assert.equal(await rail.locator('.member .lamp:visible').count(),expected);
  assert.equal(await rail.locator('.name,.panel-heading,.rail,.edge-close,.windrose').count(),0);
  assert.ok(await rail.locator('.face').evaluateAll(faces=>faces.every(el=>el.getAttribute('aria-label'))));
  await Promise.all((await rail.locator('.face img').all()).map(img=>img.evaluate(el=>el.decode())));
  await page.screenshot({path:'rail-results/desktop-open.png',mask:[page.locator('#sessionUser:visible')]});
  for (const [button,section] of [['landingCharactersNavBtn','home'],['mapNavBtn','mapPage'],['diceNavBtn','dicePage']]) {
    await page.locator('#'+button).evaluate(b=>b.click());
    await page.locator('#'+section).waitFor();
    assert.ok(await rail.evaluate(el=>el===window.acceptancePartyRail));
    assert.equal(await rail.locator('#grip').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.arcane-character-rail:visible').count(),0);
    if (section==='dicePage') {
      const portrait=rail.locator('button.face').first();
      await portrait.click();
      await page.locator('.arcane-character-drawer.is-open').waitFor();
      await page.keyboard.press('Escape');
    }
  }
  await page.locator('#landingCharactersNavBtn').evaluate(button=>button.click());
  const card=page.locator('#home .charcard').first();
  const remove=card.locator('.char-delete');
  const grip=rail.locator('#grip');
  const drawer=rail.locator('.drawer');
  const settle=()=>drawer.evaluate(async el=>{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(el.getAnimations({subtree:true}).map(anim=>anim.finished.catch(()=>{})));
  });
  for (const width of [360,390]) {
    await page.setViewportSize({width,height:800});
    await grip.click();
    await settle();
    assert.equal(await grip.getAttribute('aria-expanded'),'false');
    const folded=await drawer.boundingBox();
    const cardBox=await card.boundingBox();
    const border=await drawer.evaluate(el=>parseFloat(getComputedStyle(el).borderLeftWidth));
    assert.equal(border,3);
    assert.equal(folded.x,width-border);
    assert.ok(await rail.locator('.face,.lamp').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().left>=innerWidth)));
    assert.equal(await rail.locator('.mail:visible').count(),0);
    assert.ok(cardBox.x+cardBox.width<=folded.x,'The folded rail has its own space beside the card');
    const header=await page.locator('header.alea-app-header').boundingBox();
    assert.ok(folded.y>=header.y+header.height-1,'The rail starts below page navigation');
    await remove.click({trial:true});
    assert.ok(await remove.evaluate(button=>{
      const r=button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.right-3,r.y+r.height/2));
    }));
    await page.screenshot({path:'rail-results/mobile-'+width+'-closed.png',mask:[page.locator('#sessionUser:visible')]});
    const touch=await page.context().newCDPSession(page);
    const y=Math.round(folded.y+folded.height/2);
    const start=width-12;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
    for (const travel of [8,20,35,55]) {
      await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start-travel,y}]});
    }
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
    await settle();
    assert.equal(await grip.getAttribute('aria-expanded'),'true');
    assert.ok(await rail.evaluate(el=>el===window.acceptancePartyRail));
    assert.equal(await rail.locator('.member .lamp:visible').count(),expected);
    await page.screenshot({path:'rail-results/mobile-'+width+'-open.png',mask:[page.locator('#sessionUser:visible')]});
  }
  await page.locator('#mapNavBtn').evaluate(button=>button.click());
  const map=page.locator('#mapPage');
  await map.waitFor();
  const before=await map.boundingBox();
  await grip.click();
  await settle();
  const after=await map.boundingBox();
  assert.equal(after.width,before.width);
  assert.equal(after.x,before.x);
  await page.reload({waitUntil:'domcontentloaded'});
  await rail.locator('#grip').waitFor({timeout:60000});
  await page.evaluate(()=>logoutUser());
  await page.locator('#loginEmail').waitFor();
  assert.equal(await rail.count(),0);
  console.log('Verified authenticated home, campaign presence, character list, map, dice, mobile, reload and logout.');
} finally { await browser.close(); }
