const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const [preview, output='party-panel-results'] = process.argv.slice(2);

async function settle(drawer) {
  await drawer.evaluate(async el=>{
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));
  });
}

async function measure(page) {
  return page.evaluate(()=>{
    const rect=el=>{
      const {x,y,width,height,right,bottom}=el.getBoundingClientRect();
      return {x,y,width,height,right,bottom};
    };
    const map=document.querySelector('.map');
    const drawer=document.querySelector('.drawer');
    const style=getComputedStyle(drawer);
    return {
      drawer:rect(drawer), border:parseFloat(style.borderLeftWidth), borderStyle:style.borderLeftStyle,
      map:rect(map), camera:[getComputedStyle(map).backgroundSize,getComputedStyle(map).backgroundPosition],
      scroll:[scrollX,scrollY],
      rows:[...drawer.querySelectorAll('.member')].map(row=>({
        face:rect(row.querySelector('.face')),lamp:rect(row.querySelector('.lamp img')),
        letter:row.querySelector('.mail').offsetWidth?rect(row.querySelector('.mail')):null
      }))
    };
  });
}
function near(actual,expected) { assert.ok(Math.abs(actual-expected)<0.6,actual+' vs '+expected); }
function checkOpen(state) {
  near(state.drawer.right,state.map.right);
  for (const {face,lamp,letter} of state.rows) {
    assert.ok(state.drawer.width-face.width<=16);
    near(lamp.x+lamp.width/2,face.x+face.width*.25);
    near(lamp.y+lamp.height/2,face.y+face.height*.933);
    if (letter) {
      near(letter.x+letter.width/2,face.x+face.width*.75);
      near(letter.y+letter.height/2,face.y+face.height*.933);
    }
  }
}
function checkFolded(state) {
  assert.ok(state.border>=2 && state.border<=3 && state.borderStyle!=='none');
  near(state.drawer.x+state.border,state.map.right);
  for (const {face,lamp,letter} of state.rows) {
    assert.ok(face.x>=state.map.right && lamp.x>=state.map.right);
    if (letter) assert.ok(letter.x<state.map.right-5 && letter.right>state.map.right-1);
  }
}

async function testViewport(browser,device,width,height) {
  const mobile=device==='mobil';
  const page=await browser.newPage({viewport:{width,height},hasTouch:mobile,isMobile:mobile});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto(preview);
  const drawer=page.locator('.drawer'),grip=drawer.locator('#grip');
  await drawer.locator('.member').first().waitFor({state:'attached'});
  const shot=state=>page.screenshot({path:path.join(output,device+'-'+state+'.png')});
  // Decode the actual published art, including CSS leather, before taking screenshots.
  await page.evaluate(async()=>{
    const registry=await (await fetch('../../features/party/components.json')).json();
    const wanted=['LAMP_GREEN','LAMP_RED','LAMP_YELLOW','ENVELOPE','PANEL_BACKGROUND'];
    await Promise.all(wanted.map(async key=>{
      const entry=registry.find(o=>o.key==='ARCANE_PARTY_'+key);
      const img=new Image(); img.src=entry.url; await img.decode();
      if(img.naturalWidth!==entry.width||img.naturalHeight!==entry.height)throw Error(key);
    }));
    await Promise.all([...document.querySelectorAll('.face img')].map(i=>i.decode()));
  });
  if(mobile) { checkFolded(await measure(page)); await grip.click(); await settle(drawer); }
  assert.equal(await drawer.locator('.rail,.name,.windrose,h1,h2,.edge-close,.panel-heading').count(),0);
  assert.equal(await drawer.locator('button.face,button.lamp').count(),4); // Demo lamps are operable.
  const results=[];
  for (const n of [1,3,4,5,8]) {
    await page.getByRole('button',{name:String(n),exact:true}).click();
    const rows=drawer.locator('.member');
    assert.equal(await rows.count(),n);
    assert.equal(await drawer.locator('.portrait[inert]').count(),0);
    await rows.first().evaluate(el=>window.partyNodes=[el.closest('.drawer'),...el.querySelectorAll('.face,.lamp,.mail')]);
    const open=await measure(page); checkOpen(open);
    await grip.click({position:{x:6,y:9}}); await settle(drawer);
    const folded=await measure(page); checkFolded(folded);
    assert.deepEqual([folded.map,folded.camera,folded.scroll],[open.map,open.camera,open.scroll]);
    assert.equal(await drawer.locator('.portrait[inert]').count(),n);
    await grip.focus(); await page.keyboard.press('Enter'); await settle(drawer);
    assert.ok(await rows.first().evaluate(el=>[el.closest('.drawer'),...el.querySelectorAll('.face,.lamp,.mail')].every((node,i)=>node===window.partyNodes[i])));
    results.push({device,width,height,count:n,panelWidth:open.drawer.width,portraitWidth:open.rows[0].face.width,foldedBorder:folded.border});
  }
  await page.getByRole('button',{name:'4',exact:true}).click();
  for (const btn of await drawer.locator('.mail').all()) if (await btn.isVisible()) await btn.click();
  await grip.click(); await settle(drawer);
  checkFolded(await measure(page)); assert.equal(await drawer.locator('.mail:not([hidden])').count(),0);
  await shot('infalld');
  await page.locator('#send').click(); await page.locator('#send').click();
  await settle(drawer); checkFolded(await measure(page));
  await shot('olast');
  const mail=drawer.locator('.mail').first();
  if (mobile) {
    await mail.tap({position:{x:5,y:12}}); await settle(drawer);
    assert.equal(await grip.getAttribute('aria-expanded'),'true');
    assert.ok(await mail.isVisible());
  } else { await grip.click({position:{x:7,y:10}}); await settle(drawer); }
  for (const btn of await drawer.locator('.mail').all()) if (await btn.isVisible()) await btn.click();
  await page.getByRole('button',{name:'4',exact:true}).click();
  for (let i=0;i<5;i++) await page.locator('#send').click();
  const lamp=drawer.locator('.lamp').last();
  await lamp.click(); await lamp.click(); // leave a disconnected participant for the visual check
  assert.match(await lamp.getAttribute('aria-label'),/Frånkopplad/);
  assert.equal(await mail.locator('.count').textContent(),'2');
  for(const btn of (await drawer.locator('.mail').all()).slice(1)) await btn.click();
  checkOpen(await measure(page)); await shot('utfalld');
  await mail.click(); assert.equal(await mail.isVisible(),false);
  // Stop halfway and verify the portrait and lamp travel with the actual border.
  const before=await measure(page);
  const handle=await grip.boundingBox(),x=handle.x+7,y=handle.y+9;
  await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+22,y,{steps:8});
  const mid=await measure(page);
  near(mid.drawer.x-before.drawer.x,22);
  near(mid.rows[0].lamp.x-before.rows[0].lamp.x,22);
  near(mid.rows[0].face.x-before.rows[0].face.x,22);
  await page.mouse.move(x+before.drawer.width-4,y,{steps:8}); await page.mouse.up(); await settle(drawer);
  checkFolded(await measure(page));
  await grip.focus(); await page.keyboard.press('Enter'); await settle(drawer);
  await page.keyboard.press('Escape'); await settle(drawer); checkFolded(await measure(page));
  if (!mobile) {
    await page.locator('#send').click();
    const waiting=drawer.locator('.mail:not([hidden])').first();
    await waiting.click({position:{x:5,y:12}});
    assert.equal(await drawer.locator('.mail:not([hidden])').count(),0);
    assert.equal(await grip.getAttribute('aria-expanded'),'false');
  }
  await page.getByRole('button',{name:'8',exact:true}).click();
  await page.setViewportSize({width:mobile?760:1100,height:360});
  await grip.click({position:{x:7,y:9}}); await settle(drawer);
  const long=await page.locator('.viewport').evaluate(el=>{
    const pageY=window.scrollY;
    el.scrollTop=el.scrollHeight;
    const last=el.querySelector('.member:last-child .face').getBoundingClientRect();
    return {scrolled:el.scrollTop>0,pageStill:pageY===window.scrollY,lastFits:last.bottom<=el.getBoundingClientRect().bottom};
  });
  assert.deepEqual(long,{scrolled:true,pageStill:true,lastFits:true});
  assert.deepEqual(errors,[]); await page.close(); return results;
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'});
  try {
    const results=[];
    results.push(...await testViewport(browser,'desktop',1440,920));
    results.push(...await testViewport(browser,'mobil',390,844));
    await fs.writeFile(path.join(output,'test.json'),JSON.stringify(results,null,2));
    console.log('Godkända panellägen för 1, 3, 4, 5 och 8 deltagare på mobil och desktop.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
