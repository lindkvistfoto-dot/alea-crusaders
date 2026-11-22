// Run against a local ALEA build. Only fixture data exists in this browser context.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, output, compare, fixturePath] = process.argv.slice(2);
const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, 'utf8')) : null;
assert.equal(new URL(origin).hostname, '127.0.0.1');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'}), args:['--enable-unsafe-swiftshader'] });

async function openTestMap({scrollTest = false, fixture = null} = {}) {
  const rooms = [
    ['Portsal',36,45,205,160], ['Arkiv',300,45,190,160],
    ['Vaktrum',36,266,205,144], ['Brunnshall',300,266,190,144],
  ];
  if (scrollTest && !fixture) {
    for (let index = 0; index < 24; index++) {
      rooms.push([`Rum ${index + 5}`, 246 + index % 2 * 22, 22 + Math.floor(index / 2) * 33, 17, 25]);
    }
  }
  const id = () => crypto.randomUUID();
  const plan = document.createElement('canvas');
  plan.width = 530; plan.height = 450;
  const pen = plan.getContext('2d');
  pen.fillStyle = '#3e4038'; pen.fillRect(0,0,530,450);
  pen.strokeStyle = '#666452'; pen.lineWidth = 1;
  for (let y=0;y<450;y+=18) {
    pen.strokeRect(0,y,530,18);
    for (let x=(y%36 ? 17 : 0);x<530;x+=35) pen.strokeRect(x,y,35,18);
  }
  for (const [x,y,w,h] of [[166,112,202,25],[135,176,26,150],[393,176,25,148]]) {
    pen.fillStyle='#b4a78b'; pen.fillRect(x,y,w,h);
  }
  const campaign = id();
  const site = {id:id(),campaign_id:campaign,name:'Fästet'};
  const areas = rooms.map(([name,x,y,w,h],index) => {
    pen.fillStyle='#aa9c80'; pen.fillRect(x,y,w,h);
    pen.strokeStyle='#776a51'; pen.lineWidth=4; pen.strokeRect(x+4,y+4,w-8,h-8);
    pen.fillStyle='#352f24'; pen.textAlign='center'; pen.font='18px Georgia';
    pen.fillText(name,x+w/2,y+h/2);
    const location = {id:id(), name, campaign_id:campaign, site_id:site.id, location_key:String(index+1)};
    campaignLocations.push(location);
    return {id:id(),location_id:location.id,shape_type:'rect',shape_data:{x,y,width:w,height:h}};
  });
  const map = {id:id(),campaign_id:campaign,site_id:site.id,name:'Fästets källare',width:530,height:450};
  campaignSites = [site];
  campaignMaps = [map];
  centralCampaignRole='gm';
  if (scrollTest) {
    centralCampaignId = campaignMaps[0].campaign_id;
    supabaseSession = {user:{id:id()}, access_token:'visual-test-fixture'};
  }
  if (fixture) {
    campaignMaps = fixture.maps;
    campaignSites = fixture.sites;
    campaignLocations = fixture.locations;
    areas.splice(0, areas.length, ...fixture.areas);
  }
  const image = URL.createObjectURL(await new Promise(resolve => plan.toBlob(resolve)));
  window.getMapImageUrl = async () => image;
  let configuration = {environment:'underground',pixelsPerMeter:26.5,darkness:.60};
  let revision = 1;
  window.dbJson = async (path, request) => {
    if (path === 'rpc/save_campaign_map_academy') {
      configuration = JSON.parse(request.body).p_configuration;
      return ++revision;
    }
    if (path.startsWith('campaign_map_areas?')) return areas;
    if (path.startsWith('campaign_locations?')) return campaignLocations;
    if (path.startsWith('campaign_map_academy?')) return [{configuration,revision}];
    if (path.startsWith('campaign_location_state?')) return areas.map(area=>({location_id:area.location_id,status:'explored'}));
    return [];
  };
  document.querySelector('#loginScreen').classList.add('hidden');
  document.querySelectorAll('header,main,#admin,#adminNavBtn').forEach(el=>el.classList.remove('hidden'));
  document.querySelectorAll('main > section:not(#admin)').forEach(el=>el.classList.add('hidden'));
  await openAdminSection('places');
  await openMapAreaEditor(campaignMaps[0].id);
}

async function newPage(options) {
  const page = await browser.newPage(options);
  await page.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  // The application bundle imports the dice engine from a CDN. The editor never rolls dice.
  await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js', route =>
    route.fulfill({contentType:'text/javascript', body:'export default class DiceBox {}'}));
  page.on('pageerror', error => console.warn('Browser:', error.message));
  page.on('dialog', async dialog => { console.warn(dialog.message()); await dialog.dismiss(); });
  return page;
}

// A locator tap can automatically scroll hidden ancestors. Check the real
// hit target after scrolling the document, and tap exactly that point.
async function tapVisible(page, selector) {
  const target = await page.locator(selector).evaluate(element => {
    const {left, top, right, bottom, width, height} = element.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const hit = document.elementFromPoint(x, y);
    const fullyVisible = height > 0 && width > 0 && left >= 0 && top >= 0 &&
      right <= visualViewport.width && bottom <= visualViewport.height;
    return {x, y, top, bottom, height:visualViewport.height,
      reachable: fullyVisible && element.contains(hit), covering: hit?.closest('[id]')?.id};
  });
  assert.ok(target.reachable, `${selector} was unreachable at ${JSON.stringify(target)}`);
  await page.touchscreen.tap(target.x, target.y);
}

async function checkMobileScroll(width, height, resizedHeight) {
  const page = await newPage({viewport:{width,height}, isMobile:true, hasTouch:true});
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.aleaKartakademin && typeof openMapAreaEditor === 'function');
    await page.evaluate(openTestMap, {scrollTest:true, fixture});
    const settings = page.locator('.kartakademin-settings');
    const roomRows = page.locator('#mapAreaList [data-room-id]');
    await roomRows.first().waitFor();
    const roomCount = fixture?.areas.length ?? 28;
    assert.equal(await roomRows.count(), roomCount);
    await page.locator('#aleaSoundboard').waitFor();
    const soundboard = page.locator('[data-board-toggle]');
    const mixer = page.locator('[data-audio-settings]');
    const bottom = () => page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    const lastControl = '#mapAreaAddImage';
    const screenshot = state => page.screenshot({path:`${output}/scroll-${width}x${height}-${state}.png`});

    if (compare === 'baseline') {
      await settings.evaluate(panel => { panel.open = true; });
      await bottom();
      await screenshot('bottom');
      return;
    }

    const openFileChooser = () => Promise.all([
      page.waitForEvent('filechooser', {timeout:3000}),
      tapVisible(page, lastControl),
    ]);
    await bottom();
    await screenshot('bottom');
    await openFileChooser();
    await settings.locator('summary').tap();
    assert.equal(await settings.evaluate(panel => panel.open), false);

    await settings.locator('summary').tap();
    await settings.locator('[data-config=north]').fill('27');
    assert.equal(await settings.locator('[data-config=north]').inputValue(), '27');
    await page.locator('[data-layer=rooms]').tap();
    assert.equal(await page.locator('[data-layer=rooms]').isChecked(), false);
    await page.locator('[data-layer=rooms]').tap();
    await page.locator('[data-save]').tap();
    await page.locator('[data-save-status][data-status=saved]').waitFor();
    await settings.locator('summary').tap();
    await settings.locator('summary').tap();

    await page.locator('[data-zoom-in]').tap();
    await page.locator('[data-zoom-in]').tap();
    assert.equal(await page.locator('[data-zoom-percent]').textContent(), '156 %');
    await page.locator('[data-pan-tool]').tap();
    await page.locator('[data-pan-tool]').tap();
    await page.locator('[data-fit-view]').tap();
    assert.equal(await page.locator('[data-zoom-percent]').textContent(), '100 %');

    await roomRows.last().tap();
    assert.equal(await roomRows.last().getAttribute('aria-pressed'), 'true');
    const places = page.locator('.room-properties #mapAreaLocation');
    assert.ok(await places.locator('option').count() >= roomCount, 'The full place list is available');
    assert.ok(await places.isEnabled());

    // A swipe starting inside the long room list must move the document.
    await roomRows.nth(Math.floor(roomCount / 2)).evaluate(row => row.scrollIntoView({block:'center'}));
    const rowBox = await roomRows.nth(Math.floor(roomCount / 2)).boundingBox();
    const pageScroll = await page.evaluate(() => scrollY);
    const touch = await page.context().newCDPSession(page);
    const x = Math.round(rowBox.x + rowBox.width / 2);
    const y = Math.round(rowBox.y + rowBox.height / 2);
    await touch.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
    for (const distance of [22, 50, 86, 124]) {
      await touch.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x,y:y-distance}]});
    }
    await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(previous => scrollY > previous + 20, pageScroll);
    await touch.detach();

    await mixer.tap();
    await page.locator('#aleaAudioPanel').waitFor();
    await soundboard.tap();
    await page.locator('#aleaSoundboardPanel').waitFor();
    const lastAudioControls = await page.locator('body > :is(#aleaAudioDock, #aleaSoundboard)').evaluateAll(docks =>
      docks.map(dock => '#' + dock.id + (dock.id === 'aleaAudioDock' ? ' [data-audio-volume=event]' : ' .alea-soundboard-help'))
    );
    await bottom();
    for (const [index, selector] of [...lastAudioControls].reverse().entries()) {
      if (index > 0) await page.locator(selector).evaluate(element => element.scrollIntoView({block:'center'}));
      assert.ok(await page.locator(selector).evaluate(element => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.height > 0 && rect.bottom <= visualViewport.height;
      }), `The end of the open audio panel is visible (${selector})`);
    }
    await screenshot('sound-open');
    for (const nextHeight of [resizedHeight, height]) {
      await page.setViewportSize({width,height:nextHeight});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator(lastControl).evaluate(element => element.scrollIntoView({block:'center'}));
      await screenshot(nextHeight === height ? 'with-sound' : 'reduced');
      await openFileChooser();
    }
    console.log(`Scroll ${width}×${height} / ${resizedHeight}px: ${roomCount} room rows and the final control are reachable`);
  } finally {
    await page.close();
  }
}

try {
  const page = await newPage();
  async function checkViewport(width,height) {
    await page.setViewportSize({width,height});
    await page.goto(origin);
    await page.waitForFunction(() => window.aleaKartakademin && typeof openMapAreaEditor === 'function');
    await page.evaluate(openTestMap);
    const roomRows = compare === 'baseline'
      ? '#mapAreaList .map-area-list-row select:visible, #mapAreaList [data-room-id]:visible'
      : '#mapAreaList [data-room-id]';
    await page.locator(roomRows).first().waitFor();
    await page.waitForFunction(() => document.querySelector('[data-map-scale]')?.textContent.includes('px/m'));
    await page.screenshot({path:`${output}/${width}x${height}.png`});
    if (compare === 'baseline') return;
    const metrics = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      const widths = Array.from(document.querySelector('.map-area-workspace').children, child=>child.getBoundingClientRect().width);
      return {banner:box('.alea-app-header .bar'), workspace:box('.map-area-workspace'), widths,
        stage:box('.map-area-map-stage'), board:box('#mapAreaImage'), pageWidth:document.documentElement.scrollWidth,
        list:box('#mapAreaList'), rows:[...document.querySelectorAll('#mapAreaList [data-room-id]')].map(el=>el.getBoundingClientRect().toJSON())};
    });
    console.log(width,height,metrics);
    assert.ok(metrics.pageWidth <= width);
    if(width>900) {
      assert.ok(Math.abs(metrics.banner.x-metrics.workspace.x)<=1 && Math.abs(metrics.banner.width-metrics.workspace.width)<=1,'banner edges');
      assert.ok(Math.abs(metrics.widths[0]*2-metrics.widths[1])<=1 && Math.abs(metrics.widths[0]-metrics.widths[2])<=1,'panel proportions');
      assert.ok(metrics.workspace.bottom<=height+1,'toolbar within viewport');
      assert.equal(metrics.rows.length,4);
      assert.ok(metrics.rows.every(row=>row.x>=metrics.list.x-1 && row.right<=metrics.list.right+1),'room labels inside panel');
    }
    assert.ok(metrics.board.x>=metrics.stage.x-1 && metrics.board.right<=metrics.stage.right+1 &&
      metrics.board.y>=metrics.stage.y-1 && metrics.board.bottom<=metrics.stage.bottom+1,'map inside frame');
    const save = page.locator('[data-save]');
    await save.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.ok(await save.evaluate(button=>button.matches(':focus-visible')));
    await save.hover();
    assert.ok(await save.evaluate(button=>button.matches(':hover')));
    assert.ok(await page.locator('[data-room-mode=select][aria-pressed=true]').count());
    const help = page.getByRole('button',{name:'Mer information om Rumsverktyg'});
    await help.click();
    await page.getByRole('button',{name:'Stäng information'}).click();
    for (const key of ['pan','ruler']) {
      const tool = page.locator(`[data-${key}-tool]`);
      await tool.click(); assert.equal(await tool.getAttribute('aria-pressed'),'true'); await tool.click();
    }
    await page.locator('[data-zoom-in]').click();
    assert.equal(await page.locator('[data-zoom-percent]').textContent(),'125 %');
    await page.locator('[data-fit-view]').click();
    await page.locator('[data-mode-button=sight]').click();
    await page.locator('[data-mask-tool=paint]').click();
    assert.equal(await page.locator('[data-mask-tool=paint]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-mode-button=lights]').click();
    await page.locator('[data-new]').click();
    await page.locator('#mapAreaSvg').click({position:{x:50,y:50}});
    assert.ok(await page.locator('[name=intensity]').isEnabled());
    await page.evaluate(async () => {
      const samples = [
        ['[data-mode-button=lights]',null], ['[data-save]',null],
        ['.kartakademin-navigation',null], ['.kartakademin-frame span',null],
        ['[data-tool-choice=light]','::before'],
      ];
      for (const [selector,pseudo] of samples) {
        const style = getComputedStyle(document.querySelector(selector),pseudo);
        const match = style.backgroundImage.match(/url\("([^"]+)"\)/);
        if (!match) throw Error('Ingen bild för ' + selector);
        const img = new Image();
        img.src = match[1];
        await img.decode();
      }
    });
    await save.click();
    await page.locator('[data-save-status][data-status=saved]').waitFor();
    await page.evaluate(() => openMapAreaEditor(campaignMaps[0].id));
    await page.locator('[data-mode-button=lights]').click();
    await page.locator('[data-light-id]').first().waitFor();
  }
  const errors = [];
  for (const [width,height] of [[1366,768],[1920,1080],[390,844]]) {
    try { await checkViewport(width,height); }
    catch (error) { errors.push(error); console.error(width,height,error); }
  }
  for (const viewport of [[360,740,666],[915,412,354],[834,1112,1020]]) {
    try { await checkMobileScroll(...viewport); }
    catch (error) { errors.push(error); console.error(viewport,error); }
  }
  if (errors.length) throw new AggregateError(errors,'Kartverkstadens webbläsartester');
} finally {
  await browser.close();
}
