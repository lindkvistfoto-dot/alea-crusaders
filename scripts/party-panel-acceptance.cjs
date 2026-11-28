const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const [url,output='party-panel-results']=process.argv.slice(2);

async function settle(drawer) {
  await drawer.evaluate(async el=>{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));
  });
}
async function geometry(page) {
  return page.evaluate(()=>{
    const box=s=>{const {x,y,width,height,right,bottom}=document.querySelector(s).getBoundingClientRect();return {x,y,width,height,right,bottom};};
    const style=getComputedStyle(document.querySelector('.map'));
    return {drawer:box('.drawer'),persona:box('.face'),lamp:box('.lamp'),map:box('.map'),
      camera:[style.backgroundSize,style.backgroundPosition,scrollX,scrollY],rim:parseFloat(getComputedStyle(document.querySelector('.drawer')).borderLeftWidth)};
  });
}
async function testMobile(browser,width,height) {
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  const drawer=page.locator('.drawer'),grip=drawer.locator('#grip'),faces=drawer.locator('.face');
  const tab=name=>drawer.getByRole('tab',{name,exact:true});
  const state=async n=>{await settle(drawer);assert.equal(await drawer.getAttribute('data-state'),String(n));};
  const shot=name=>page.screenshot({path:path.join(output,'mobil-'+width+'-'+name+'.png')});
  await faces.first().waitFor({state:'attached'});
  await page.evaluate(()=>{window.originalPortrait=document.querySelector('.face');});
  await state(0); const hidden=await geometry(page);
  assert.equal(hidden.rim,3); assert.equal(hidden.drawer.x,hidden.map.right-3);
  assert.ok(hidden.persona.x>=hidden.map.right && hidden.lamp.x>=hidden.map.right);
  await shot('dold'); await grip.click(); await state(1);
  const portraits=await geometry(page);
  assert.equal(portraits.map.right-portraits.drawer.x,58); await shot('portratt');
  // Measure the rail halfway through an actual drag. Finish one detent at a time.
  const handle=await grip.boundingBox(),x=handle.x+12,y=handle.y+20;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x-42,y,{steps:5});
  const mid=await geometry(page);
  assert.ok(Math.abs((portraits.persona.x-mid.persona.x)-42)<1);
  assert.ok(Math.abs((portraits.drawer.x-mid.drawer.x)-42)<1);
  await page.mouse.up(); await state(2);
  const full=await geometry(page); assert.ok(full.persona.x<portraits.persona.x-100);
  await faces.nth(1).click(); await tab('Färdigheter').click(); await state(2);
  const details=drawer.locator('.party-page');
  assert.ok(await details.textContent().then(s=>s.includes('Upptäcka fara')));
  assert.equal(await drawer.locator('button[data-roll]').count(),0);
  assert.equal(await page.evaluate(()=>document.querySelector('.face')===window.originalPortrait),true);
  await shot('full');
  const box=await details.boundingBox();
  const touch=await page.context().newCDPSession(page);
  const startY=box.y+Math.min(box.height-8,150), tx=box.x+box.width/2;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:startY}]});
  for(const dy of [10,22,36,50]) await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+2,y:startY-dy}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await touch.detach();
  await page.waitForFunction(()=>document.querySelector('.party-page').scrollTop>0);
  await state(2);

  await details.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  assert.ok(await details.evaluate(el=>el.scrollTop>0));
  const after=await geometry(page);
  assert.deepEqual(after.map,hidden.map); assert.deepEqual(after.camera,hidden.camera);
  assert.deepEqual(after.persona,full.persona);
  await faces.nth(2).click(); await state(2); assert.equal((await geometry(page)).drawer.x,full.drawer.x);
  await page.keyboard.press('Escape'); await state(1); await page.keyboard.press('Escape'); await state(0);
  await grip.click(); await state(1); await grip.focus(); await page.keyboard.press('ArrowLeft'); await state(2);
  assert.equal(await tab('Färdigheter').getAttribute('aria-selected'),'true');
  await page.keyboard.press('Escape'); await state(1); await page.keyboard.press('Escape'); await state(0);
  await page.getByRole('button',{name:'Simulera brev'}).click();
  const letter=drawer.locator('.mail:not([hidden])').first();
  await letter.click({position:{x:4,y:12}}); await state(2);
  assert.equal(await tab('Meddelanden').getAttribute('aria-selected'),'true');
  await details.getByText('Jag väntar vid kryptans port.').waitFor(); await letter.waitFor({state:'hidden'});
  const input=drawer.getByRole('textbox',{name:'Meddelande'});
  await input.fill('Jag kommer.'); await drawer.getByRole('button',{name:'Skicka',exact:true}).click();
  await details.getByText('Jag kommer.').waitFor();
  await page.setViewportSize({width,height:Math.min(390,height)}); await input.focus();
  const send=await drawer.getByRole('button',{name:'Skicka',exact:true}).boundingBox();
  assert.ok(send.y+send.height<=Math.min(390,height)+1);
  await page.setViewportSize({width,height});
  await page.keyboard.press('Escape'); await state(1);
  for(const count of [1,3,5,8]) {
    await page.getByRole('button',{name:String(count),exact:true}).click(); assert.equal(await faces.count(),count);
  }
  await faces.nth(1).click(); await state(2); await tab('Färdigheter').click();
  const members=drawer.locator('#members');
  await members.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const scroll=await members.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
  if(scroll.max>0)assert.ok(scroll.top>0);
  assert.ok(await details.evaluate(el=>el.scrollTop===0));
  assert.deepEqual(errors,[]); await page.close();
  return {width,height,rim:hidden.rim,portraits:portraits.map.right-portraits.drawer.x,full:full.drawer.width};
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'});
  try {
    const results=[];
    for(const [w,h] of [[390,844],[360,740],[844,390]]) results.push(await testMobile(browser,w,h));
    await fs.writeFile(path.join(output,'test.json'),JSON.stringify(results,null,2)); console.log(results);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
