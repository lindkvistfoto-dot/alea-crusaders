// Use the built app and actual WebGL pixels. No campaign login or remote game data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyCryptPilot } from './kartverkstad-crypt-visual.mjs';

const [origin] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
const browser = await chromium.launch({channel:'chrome', args:['--enable-unsafe-swiftshader']});
try {
  for (const viewport of [{width:1280,height:800}, {width:390,height:844}]) {
    const page = await browser.newPage({viewport, hasTouch:viewport.width < 500, deviceScaleFactor:1});
    await page.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route('https://unpkg.com/@3d-dice/dice-box@*/dist/dice-box.es.min.js', route =>
      route.fulfill({contentType:'text/javascript', body:'export default class DiceBox {}'}));
    await page.goto(origin);
    await page.waitForFunction(() => !!window.aleaBattleMapEffects);
    await page.evaluate(async () => {
      document.body.innerHTML = '<svg id="sample" width="240" height="120" viewBox="0 0 240 120" style="position:fixed;inset:0;background:#222"><foreignObject width="240" height="120"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;position:relative"></div></foreignObject></svg>';
      const floor = document.createElement('canvas');
      floor.width = 240; floor.height = 120;
      const c = floor.getContext('2d'); c.fillStyle = '#b0b0b0'; c.fillRect(0,0,240,120);
      const light = { characterId:'astrid', type:'magiskt', color:'#ffe6b0', motion:0, range:4,
        intensity:.95, on:true, direction:0, aperture:360 };
      const area = {shape_type:'rect', shape_data:{x:0,y:0,width:240,height:120}, status:'explored'};
      const state = {host:document.querySelector('#sample div'), map:{id:'crypt',width:240,height:120,image_url:floor.toDataURL()},
        config:{darkness:.94,pixelsPerMeter:40,environment:'underground',freeSight:{width:24,height:12,runs:[[0,288]]},
          geometry:[{closed:false,light:true,points:[[140,0],[140,120]]}],lights:[light]},
        areas:[area], objects:[], positions:[{character_id:'astrid',position:[70,60]}], manager:true,
        actors:[{id:'hero',position:[60,60]},{id:'opponent',position:[125,60]}], log:[], combatId:'test'};
      window.paintBattleSample = async (mode, t = 0) => {
        if (mode === 'move') state.positions = [{character_id:'astrid',position:[175,60]}];
        if (mode === 'hit') state.log = [{id:'hit', event_type:'spell_attack', actor_id:'hero', player_visible:true,
          details:{success:true,hit_resolved:true,spell_name:'Prov',target_results:[{target_id:'opponent',damage:true}]}}];
        if (mode === 'rain') {state.config = {...state.config,environment:'outdoor'}; state.weather = 'regn';}
        if (mode === 'hide') {
          state.manager = false;
          state.config = {...state.config,environment:'underground',lights:[],geometry:[]};
          state.areas = [area,{...area,status:'unknown',shape_data:{x:80,y:0,width:100,height:120}}];
        }
        // Freeze just the effects' next RAF, long enough to capture the moving sprite or weather.
        const raf = window.requestAnimationFrame;
        let scheduled;
        window.requestAnimationFrame = callback => {scheduled = callback;return 0;};
        try {
          await window.aleaBattleMapEffects.sync(state);
          const time = performance.now();
          if (scheduled) {
            window.battleFrame = scheduled;
            scheduled(time + t);
          } else if (mode === 'frame' && window.battleFrame) window.battleFrame(time + t);
        } finally { window.requestAnimationFrame = raf; }
      };
      await window.paintBattleSample('light');
    });
    const view = page.locator('#sample');
    async function frame(mode, delay = 0) {
      await page.evaluate(([name,t]) => window.paintBattleSample(name,t),[mode,delay]);
      return (await view.screenshot()).toString('base64');
    }
    const wall = await frame('light'), moved = await frame('move'), hit = await frame('hit',100);
    const settled = await frame('frame',1600), rain = await frame('rain'), rainLater = await frame('frame',120);
    const hidden = await frame('hide');
    const result = await page.evaluate(async images => {
      const pixels = await Promise.all(images.map(async base64 => {
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,'+base64)).blob());
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap,0,0); bitmap.close();
        return ctx.getImageData(0,0,240,120).data;
      }));
      const red = (frame,x,y) => pixels[frame][4*(y*240+x)];
      function changed(a,b,tolerance) {
        let count = 0;
        for (let i=0;i<pixels[a].length;i+=4) if (Math.abs(pixels[a][i]-pixels[b][i])>tolerance) count++;
        return count;
      }
      return {source:red(0,70,60),wallShadow:red(0,175,60),movedSource:red(1,175,60),
        movedShadow:red(1,70,60),projectile:changed(2,3,12),rain:changed(4,5,5),unknown:red(6,140,60)};
    },[wall,moved,hit,settled,rain,rainLater,hidden]);
    console.log('Battle Pixi pixels',viewport,result);
    assert.ok(result.source > result.wallShadow+80 && result.movedSource > result.movedShadow+80, 'carried source and wall occlusion');
    assert.ok(result.projectile > 20 && result.rain > 40, 'new resolved spell and moving outdoor rain');
    assert.equal(result.unknown,0,'unknown room stays black');
    await page.evaluate(() => window.aleaBattleMapEffects.clear());
    assert.equal(await view.locator('canvas').count(),0);
    await page.close();
  }
  await verifyCryptPilot(browser, origin);
} finally { await browser.close(); }
