const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const preview = process.argv[2];
const output = process.argv[3] || 'party-panel-results';
if (!preview) throw Error('Ange adressen till den isolerade förhandsvisningen.');

async function inspect(page) {
  return page.evaluate(() => {
    const map = document.querySelector('.map');
    const style = getComputedStyle(map);
    const rect = map.getBoundingClientRect();
    return {
      map: [rect.x, rect.y, rect.width, rect.height, style.backgroundPosition, style.backgroundSize],
      lamps: [...document.querySelectorAll('.member .lamp')].map(lamp => {
        const r = lamp.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
      sameRail: window.testRail === document.querySelector('.rail'),
    };
  });
}

async function testViewport(browser, device, width, height) {
  const mobile = device === 'mobil';
  const page = await browser.newPage({viewport: {width, height}, hasTouch: mobile, isMobile: mobile});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(preview);
  await page.waitForSelector('.member');
  await page.evaluate(async () => {
    const assets = await (await fetch('components.json')).json();
    if (assets.length !== 24) throw Error('Komponentregistret ska innehålla 24 bilder.');
    await Promise.all(assets.map(async asset => {
      const image = new Image();
      image.src = asset.url;
      await image.decode();
      if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw Error(asset.key);
    }));
    await Promise.all([...document.images].map(image => image.decode()));
  });
  const grip = page.locator('#grip');
  const results = [];
  for (const count of [1, 3, 4, 5, 8]) {
    await page.getByRole('button', {name:String(count), exact:true}).click();
    assert.equal(await page.locator('.member').count(), count);
    await page.evaluate(() => { window.testRail = document.querySelector('.rail'); });
    const open = await inspect(page);
    if ([4,8].includes(count)) await page.screenshot({path:path.join(output, device+'-'+count+'-oppen.png')});
    await grip.click();
    await page.waitForTimeout(420);
    const closed = await inspect(page);
    assert.equal(await grip.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(closed.map, open.map);
    assert(closed.sameRail);
    const travel = mobile ? 179 : 220;
    for (let i=0; i<count; i++) {
      assert.deepEqual(closed.lamps[i].slice(1), open.lamps[i].slice(1));
      assert(Math.abs(closed.lamps[i][0] - open.lamps[i][0] - travel) < .1);
    }
    if (count === 4) await page.screenshot({path:path.join(output, device+'-4-infalld.png')});
    await grip.click();
    await page.waitForTimeout(420);
    assert.deepEqual(await inspect(page), open);
    results.push({device,width,height,count,travel,railIdentity:true,lampGeometry:true,mapGeometry:true});
  }
  await page.getByRole('button', {name:'4',exact:true}).click();
  const lamp = page.locator('.lamp').first();
  const initial = await lamp.getAttribute('aria-label');
  await lamp.click();
  assert.notEqual(await lamp.getAttribute('aria-label'), initial);
  await page.locator('#send').click();
  const envelope = page.locator('.member').first().locator('.mail');
  assert(await envelope.isVisible());
  await envelope.click();
  assert(!(await envelope.isVisible()));
  const gripBox = await grip.boundingBox();
  const x = gripBox.x + gripBox.width/2, y = gripBox.y + gripBox.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x + 165,y,{steps:12});
  await page.mouse.up();
  assert.equal(await grip.getAttribute('aria-expanded'), 'false');
  await grip.focus();
  await page.keyboard.press('Enter');
  assert.equal(await grip.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await page.close();
  return results;
}

(async () => {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || undefined});
  try {
    const results = [];
    results.push(...await testViewport(browser,'desktop',1440,920));
    results.push(...await testViewport(browser,'mobil',390,844));
    await fs.writeFile(path.join(output,'test.json'),JSON.stringify(results,null,2));
    console.log('Godkända layouter:', results.length);
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode=1;});
