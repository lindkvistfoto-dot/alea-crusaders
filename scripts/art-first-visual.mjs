import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const root='http://127.0.0.1:4182',out='visual-results/art-first';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1220,height:900}});
await context.route(/^https?:/,r=>new URL(r.request().url()).origin===root?r.continue():r.abort());
await context.routeWebSocket(/supabase\.co/,s=>s.close());
const errors=[];
context.on('page',p=>p.on('pageerror',err=>errors.push(err.message)));
const ready=p=>p.waitForFunction(()=>document.querySelectorAll('#hero-list button').length===3 && document.querySelector('#scene canvas') && !document.querySelector('#startup-error').textContent);
const expected=(page,id,value)=>page.waitForFunction(([id,v])=>document.getElementById(id).textContent.includes(v),[id,value]);
async function measure(page,ms=12000){
  await page.bringToFront();
  await page.locator('#scene canvas').scrollIntoViewIfNeeded();
  return page.evaluate(ms=>new Promise(resolve=>{
    const intervals=[];let last;
    window.aleaCryptFrameProbe=()=>{const now=performance.now();if(last)intervals.push(now-last);last=now;};
    setTimeout(()=>{delete window.aleaCryptFrameProbe;intervals.sort((a,b)=>a-b);
      resolve({frames:intervals.length,medianMs:intervals[Math.floor(intervals.length*.5)],p95Ms:intervals[Math.floor(intervals.length*.95)],backend:document.querySelector('#scene canvas').dataset.renderer});
    },ms);
  }),ms);
}
try{
  const gm=await context.newPage();await gm.goto(root+'/kryptans-dorr.html?art=1');await ready(gm);
  const role=gm.locator('#role');assert.equal(await role.innerText(),'Spelledare');
  await gm.locator('#scene canvas').screenshot({path:out+'/01-malad-kammare.png'});
  await gm.locator('#door-action').click();await expected(gm,'door-value','Öppen');await gm.waitForTimeout(550);
  await gm.locator('#lamp-toggle').click();await expected(gm,'lamp-toggle','Tänd');
  await gm.locator('#scene canvas').screenshot({path:out+'/02-port-oppen-ljus-slackta.png'});
  await gm.locator('#lamp-toggle').click();await expected(gm,'lamp-toggle','Släck');
  await gm.locator('#door-action').click();await expected(gm,'door-value','Stängd');
  const clients=[];
  for(const id of ['evalin','lyra']){
    await gm.locator('#invite').click();await gm.locator('#invite-actor').selectOption(id);
    const url=await gm.locator('#open-invite').getAttribute('href');await gm.locator('#invite-dialog .dialog-close').click();
    const page=await context.newPage(),masterRequests=[];
    page.on('request',r=>{if(/(?:chamber|unlit)(?:-[a-zA-Z0-9_-]+)?\.(jpg|webp)/.test(r.url()))masterRequests.push(r.url());});
    await page.goto(url);await ready(page);
    assert.ok(await page.locator('#observed').isHidden());clients.push({page,masterRequests});
  }
  await gm.locator('#door-action').click();
  for(const {page} of clients){await expected(page,'door-value','Öppen');await expected(page,'observed','Kryptväktaren ses av');}
  await gm.locator('#door-action').click();for(const {page} of clients){await expected(page,'door-value','Stängd');assert.ok(await page.locator('#observed').isHidden());}
  const player=clients[0].page;await player.bringToFront();await player.locator('.movement summary').click();
  await player.locator('[data-step=west]').click();await expected(gm,'journal','förflyttar sig');
  await player.locator('#search').click();await expected(gm,'journal','Finna dolda ting');
  await gm.locator('#combat-action').click();await expected(player,'phase','Strid');
  await gm.locator('#combat-action').click();await expected(player,'phase','Äventyr');
  await player.reload();await ready(player);await expected(player,'door-value','Stängd');
  await player.bringToFront();await player.locator('#scene canvas').screenshot({path:out+'/04-spelare.png'});
  for(const {masterRequests} of clients)assert.deepEqual(masterRequests,[]);
  const detailInvite=player.url();
  await Promise.all(clients.map(({page})=>page.close()));
  const painted=await measure(gm);
  await gm.setViewportSize({width:390,height:844});await gm.waitForTimeout(500);const mobile=await measure(gm);
  await gm.screenshot({path:out+'/03-mobil.png',fullPage:true});
  for(const width of [390,320]){
    await gm.setViewportSize({width,height:844});
    const overflow=await gm.evaluate(()=>({
      width:innerWidth,scroll:document.documentElement.scrollWidth,
      elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.id,e.className])
    }));
    assert.ok(overflow.scroll<=width+1,JSON.stringify(overflow));
  }
  await gm.setViewportSize({width:390,height:844});
  const detailPlayer=await context.newPage();
  await detailPlayer.setViewportSize({width:390,height:844});await detailPlayer.goto(detailInvite);await ready(detailPlayer);
  await detailPlayer.locator('[data-camera=person]').click();
  await gm.locator('[data-hero=evalin]').click();
  for(const [x,y,name] of [[527,475,'06-kistan'],[516,285,'07-tunnor-och-vagg']]){
    await gm.locator('[data-camera=map]').click();
    const canvas=gm.locator('#scene canvas');
    const box=await canvas.boundingBox(),scale=Math.min(box.width/723.5,box.height/768);
    const count=await gm.locator('#journal-count').textContent();
    const playerCount=await detailPlayer.locator('#journal-count').textContent();
    await canvas.click({position:{x:(box.width-723.5*scale)/2+x*scale,y:(box.height-768*scale)/2+y*scale}});
    await gm.waitForFunction(n=>document.querySelector('#journal-count').textContent!==n,count);
    await gm.locator('[data-camera=person]').click();
    await gm.waitForTimeout(1000);
    await canvas.screenshot({path:out+'/'+name+'.png'});
    await detailPlayer.waitForFunction(n=>document.querySelector('#journal-count').textContent!==n,playerCount);
    await detailPlayer.bringToFront();await detailPlayer.locator('#scene canvas').screenshot({path:out+'/'+name+'-spelare.png'});
    await gm.bringToFront();
  }
  await detailPlayer.close();await gm.close();
  const original=await context.newPage();await original.setViewportSize({width:1220,height:900});
  await original.goto(root+'/kryptans-dorr.html');await ready(original);const constructed=await measure(original);
  await original.locator('#scene canvas').screenshot({path:out+'/05-kryptans-dorr.png'});
  assert.deepEqual(errors,[]);for(const m of [painted,mobile,constructed])assert.ok(m.frames>5);
  const result={desktop:painted,mobileViewport:mobile,baseline:constructed,errors,playerMasterRequests:0};
  console.log('ART FIRST',JSON.stringify(result));await writeFile(out+'/comparison.json',JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();}
