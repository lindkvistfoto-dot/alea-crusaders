import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const root=process.env.CRYPT_PREVIEW_URL??'http://127.0.0.1:4182/kryptans-dorr.html';
const out=process.env.CRYPT_RESULTS??'visual-results/living-darkness';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN??'/usr/bin/google-chrome',
  args:['--no-sandbox','--enable-unsafe-swiftshader']});
const metrics=[],errors=[];
async function sceneReady(page){
  await page.waitForSelector('#scene canvas');
  await page.waitForFunction(()=>document.querySelectorAll('#hero-list button').length===3 && !document.querySelector('#startup-error').textContent);
  await page.locator('#scene canvas').scrollIntoViewIfNeeded();
}
async function model(page,id){
  await page.locator('[data-light-model="'+id+'"]').click();
  await page.locator('#scene canvas').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
async function measure(page,device,mode){
  await model(page,mode);
  await page.waitForTimeout(1500);
  const sample=await page.evaluate(()=>new Promise(resolve=>{
    const start=performance.now(),deltas=[];let last=null;
    window.aleaCryptFrameProbe=()=>{const t=performance.now();if(last!==null)deltas.push(t-last);last=t;};
    setTimeout(()=>{
      delete window.aleaCryptFrameProbe;
      const seconds=(performance.now()-start)/1000;
      deltas.sort((a,b)=>a-b);
      resolve({frames:deltas.length,fps:+(deltas.length/seconds).toFixed(1),
        medianMs:+deltas[Math.floor(deltas.length*.5)]?.toFixed(1),p95Ms:+deltas[Math.floor(deltas.length*.95)]?.toFixed(1),
        backend:document.querySelector('#scene canvas').dataset.renderer});
    },6000);
  }));
  assert.ok(sample.frames>5);
  metrics.push({device,mode,...sample});console.log(device,mode,sample);
}
try{
  for(const [device,viewport,dpr] of [['desktop',{width:1360,height:1000},1],['mobile-emulation',{width:390,height:844},2]]){
    const context=await browser.newContext({viewport,deviceScaleFactor:dpr,hasTouch:dpr===2,isMobile:dpr===2});
    context.on('page',p=>p.on('pageerror',err=>errors.push(err.message)));
    await context.routeWebSocket(/supabase\.co/,s=>s.close());
    const page=await context.newPage();
    await page.goto(root+'?art=1&darkness=1');
    await sceneReady(page);
    assert.equal(await page.locator('[data-light-model=b]').getAttribute('aria-pressed'),'true');
    if(device==='desktop'){
      await page.emulateMedia({reducedMotion:'reduce'});
      const maskSamples=await page.evaluate(async()=>{
        const {createDarkness}=await import('/features/art-first/darkness.js');
        const engine=createDarkness(),visible=new Path2D();visible.rect(0,0,85,100);
        const land={visible},lamp={id:0,on:true,foot:[32,50],range:65};
        const p={role:'gm',width:120,height:100,walls:[{x1:60,y1:0,x2:60,y2:100}],lamps:[lamp]};
        const options={ambient:.8,reach:1,flicker:0};
        function alpha(view,x,y){
          const {src}=engine.draw(view,land,options,0,null);
          return src.getContext('2d').getImageData(Math.floor(x*src.width/120),Math.floor(y*src.height/100),1,1).data[3];
        }
        const near=alpha(p,32,50),falloff=alpha(p,48,68),behind=alpha(p,74,50);
        const memory=alpha({...p,role:'player',walls:[...p.walls]},96,45);
        const dark=alpha({...p,lamps:[]},32,50);
        return {near,falloff,behind,memory,dark};
      });
      assert.ok(maskSamples.near<10 && maskSamples.falloff>maskSamples.near && maskSamples.behind>190);
      assert.equal(maskSamples.memory,0);assert.ok(maskSamples.dark>=200);
      console.log('Overlay alpha (0–255)',maskSamples);
      const canvas=page.locator('#scene canvas');
      await page.locator('[data-hero=evalin]').click();
      for(const state of ['all','torch']){
        if(state==='torch')await page.locator('#lamp-toggle').click();
        for(const id of ['a','b']){
          await model(page,id);
          await canvas.screenshot({path:out+'/'+state+'-'+id+'.png'});
        }
      }
      const journal=await page.locator('#journal-count').textContent();
      await page.locator('[data-camera=party]').click();
      for(const id of ['a','b']){
        await model(page,id);
        await canvas.screenshot({path:out+'/detail-'+id+'.png'});
      }
      assert.equal(await page.locator('#journal-count').textContent(),journal);
      await page.locator('#torch-action').click();
      await canvas.screenshot({path:out+'/extinguished.png'});
      await page.locator('#torch-action').click();await page.locator('#lamp-toggle').click();
      await page.locator('#door-action').click();
      await page.waitForFunction(()=>document.querySelector('#door-value').textContent.includes('Öppen'));
      await page.locator('#door-action').click();await page.locator('[data-camera=map]').click();
      await page.locator('#invite').click();await page.locator('#invite-actor').selectOption('evalin');
      const url=await page.locator('#open-invite').getAttribute('href');
      await page.locator('#invite-dialog .dialog-close').click();
      const player=await context.newPage(),masters=[];
      player.on('request',r=>{if(/(?:warm-floor|chamber|unlit)(?:-[\w-]+)?\.(?:jpg|webp)/.test(r.url()))masters.push(r.url());});
      await player.goto(url);await sceneReady(player);
      for(const id of ['b','a','b'])await model(player,id);
      await player.locator('.movement summary').click();await player.locator('[data-step=west]').click();
      await page.waitForFunction(()=>document.querySelector('#journal').textContent.includes('förflyttar sig'));
      await player.locator('#scene canvas').screenshot({path:out+'/player-b.png'});
      assert.deepEqual(masters,[]);await player.close();await page.bringToFront();
      await page.emulateMedia({reducedMotion:'no-preference'});
    }else{
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.locator('#scene canvas').screenshot({path:out+'/mobile-b.png'});
    }
    // Fresh identical world (no move, selected camera or transient animation) for timings.
    await page.goto(root+'?art=1&darkness=1');await sceneReady(page);
    for(const id of ['a','b'])await measure(page,device,id);
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(out+'/metrics.json',JSON.stringify({metrics,errors},null,2));
}finally{await browser.close();}
