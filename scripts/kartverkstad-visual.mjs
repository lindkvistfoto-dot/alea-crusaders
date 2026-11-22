// Run against a local ALEA build. Only fixture data exists in this browser context.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const [origin, output, compare] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {channel:'chrome'}), args:['--enable-unsafe-swiftshader'] });

async function openTestMap() {
  const rooms = [
    ['Portsal',36,45,205,160], ['Arkiv',300,45,190,160],
    ['Vaktrum',36,266,205,144], ['Brunnshall',300,266,190,144],
  ];
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
  await openMapAreaEditor(map.id);
}

try {
  const page = await browser.newPage();
  await page.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  // The application bundle imports the dice engine from a CDN. The editor never rolls dice.
  await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js', route =>
    route.fulfill({contentType:'text/javascript', body:'export default class DiceBox {}'}));
  page.on('pageerror', error => console.warn('Browser:', error.message));
  page.on('dialog', async dialog => { console.warn(dialog.message()); await dialog.dismiss(); });
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
  if (errors.length) throw new AggregateError(errors,'Kartverkstadens webbläsartester');
} finally {
  await browser.close();
}
