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

async function checkDockAndLetters(page, open) {
  const result = await page.evaluate(isOpen => {
    const edge = document.querySelector('.map').getBoundingClientRect().right;
    const side = document.querySelector(isOpen ? '.panel' : '.rail').getBoundingClientRect();
    // Right edge of the opaque bronze on the straight middle sections of the source PNGs.
    const slim = document.querySelector('.rail').getBoundingClientRect().width===3;
    const inset = isOpen ? 8 / 361 : slim ? 0 : 8 / 120;
    const rail = document.querySelector('.rail').getBoundingClientRect();
    const letters = [...document.querySelectorAll('.mail:not([hidden])')].filter(mail=>mail.offsetWidth).map(mail => {
      const row = mail.closest('.member');
      const box = mail.getBoundingClientRect();
      const name = row.querySelector('.name').getBoundingClientRect();
      const face = row.querySelector('.face').getBoundingClientRect();
      const x = isOpen ? box.left + box.width / 2 : box.left + 5;
      const y = box.top + box.height / 2;
      return {
        positioned: isOpen ? box.left > Math.max(face.right, name.right) && box.right <= edge
                           : box.left < rail.left && box.right > rail.left,
        reachable: mail.contains(document.elementFromPoint(x, y)),
      };
    });
    return {gap: edge - (side.right - side.width * inset), letters};
  }, open);
  assert(result.gap <= 1 && result.gap > -3, 'Bronze edge must meet the map border: ' + result.gap);
  for (const letter of result.letters) assert(letter.positioned && letter.reachable, JSON.stringify(letter));
}

async function testViewport(browser, device, width, height) {
  const mobile = device === 'mobil';
  const page = await browser.newPage({viewport: {width, height}, hasTouch: mobile, isMobile: mobile});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(preview);
  await page.waitForSelector('.member');
  await page.evaluate(async () => {
    const assets = await (await fetch('../../features/party/components.json')).json();
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
  if (mobile) {
    assert.equal(await grip.getAttribute('aria-expanded'),'false');
    assert.equal(await page.locator('.rail i:visible,.lamp:visible,.mail:visible,#grip img:visible').count(),0);
    assert.equal((await page.locator('.rail').boundingBox()).width,3);
    await page.screenshot({path:path.join(output,'mobil-kant.png')});
    await page.locator('#send').click();
    await page.locator('#send').click();
    assert.equal(await page.locator('.mail:visible').count(),1);
    await page.screenshot({path:path.join(output,'mobil-nytt-brev.png')});
    const letter=page.locator('.mail:visible').first();
    await letter.click({position:{x:6,y:22}});
    assert.equal(await grip.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.mail:visible').count(),2);
    await page.waitForTimeout(420);
  }
  for (const count of [1, 3, 4, 5, 8]) {
    await page.getByRole('button', {name:String(count), exact:true}).click();
    assert.equal(await page.locator('.member').count(), count);
    await page.evaluate(() => { window.testRail = document.querySelector('.rail'); });
    const open = await inspect(page);
    const originalLetter = await page.locator('.mail').first().elementHandle();
    await checkDockAndLetters(page, true);
    if ([4,8].includes(count)) await page.screenshot({path:path.join(output, device+'-'+count+'-oppen.png')});
    await grip.click({position:{x:5,y:10}});
    await page.waitForTimeout(420);
    const closed = await inspect(page);
    assert.equal(await grip.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(closed.map, open.map);
    assert(closed.sameRail);
    await checkDockAndLetters(page, false);
    assert(await originalLetter.evaluate(mail => mail === document.querySelector('.mail')));
    await originalLetter.dispose();
    const travel = mobile ? 190 : 220;
    if (mobile) assert.equal(await page.locator('.lamp:visible').count(),0);
    else for (let i=0; i<count; i++) {
      assert.deepEqual(closed.lamps[i].slice(1), open.lamps[i].slice(1));
      assert(Math.abs(closed.lamps[i][0] - open.lamps[i][0] - travel) < .1);
    }
    if (count === 4) await page.screenshot({path:path.join(output, device+'-4-infalld.png')});
    await grip.click({position:{x:5,y:10}});
    await page.waitForTimeout(420);
    assert.deepEqual(await inspect(page), open);
    results.push({device,width,height,count,travel,railIdentity:true,lampGeometry:true,mapGeometry:true});
  }
  await page.getByRole('button', {name:'4',exact:true}).click();
  const lamp = page.locator('.lamp').first();
  if (!mobile) {
    const initial = await lamp.getAttribute('aria-label');
    await lamp.click();
    assert.notEqual(await lamp.getAttribute('aria-label'), initial);
  }
  await page.locator('#send').click();
  const envelope = page.locator('.member').first().locator('.mail');
  assert(await envelope.isVisible());
  await envelope.click();
  assert(!(await envelope.isVisible()));
  const gripBox = await grip.boundingBox();
  const x = gripBox.x + gripBox.width/2, y = gripBox.y + (mobile ? 15 : gripBox.height/2);
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
