// Run only against the designated DEV playtest. Results exclude login and credentials.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const [origin,variant]=process.argv.slice(2);
assert.match(origin,/^https:\/\/[a-z0-9-]+\.alea-crusaders\.pages\.dev\/?$/);
assert.ok(['before','after'].includes(variant));
const map='c1c82cce-073d-4c3f-8f0c-b7244c759521';
const output='test-results/switch/'+variant;
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
const timings=[];
try{
  const auth=await browser.newPage();
  await auth.goto(origin);
  assert.equal(await auth.evaluate(()=>window.ALEA_SUPABASE_CONFIG.url),'https://wkiuyklzzroavclnsxna.supabase.co');
  await auth.locator('#loginEmail').fill(process.env.ALEA_DEV_TEST_EMAIL);
  await auth.locator('#loginPassword').fill(process.env.ALEA_DEV_TEST_PASSWORD);
  await auth.locator('#loginForm').evaluate(f=>f.requestSubmit());
  await auth.waitForFunction(()=>typeof centralCampaignId!=='undefined' && centralCampaignId==='846e8089-24da-4825-af34-32903117152a' && canManageCampaignMaps(),null,{timeout:90000});
  const context=await browser.newContext({storageState:await auth.context().storageState(),viewport:{width:1440,height:920}});
  await auth.close();
  const page=await context.newPage();
  page.setDefaultTimeout(75000);
  page.on('dialog',async dialog=>{console.log('Appdialog',dialog.message().slice(0,140));await dialog.accept();});
  const url=new URL('?view=adventure&map='+map,origin).href;
  const mode=key=>page.locator('#adventureModeSwitch [data-mode='+key+']');
  const frame=page.frameLocator('.adventure-encounter-frame');
  const button=page.locator('[data-action=start-encounter]');
  let resources=[];
  page.on('request',r=>resources.push({document:r.resourceType()==='document',image:r.resourceType()==='image',api:r.url().includes('/rest/v1/'),art:r.url().includes('/campaign-maps/'),fig:r.url().includes('battle_poses')||r.url().includes('hero-class')}));
  async function open(){
    await page.goto(url);
    await page.waitForFunction(id=>activeCampaignMap?.id===id && document.querySelector('#mapImage').naturalWidth>1,map,{timeout:90000});
    await mode('exploration').waitFor();
    assert.equal(await page.evaluate(()=>activeCampaignMap.name),'Bystrid Skelett – spelprov');
  }
  async function finish(){
    await frame.locator('.combat-row-move').first().waitFor();
    await mode('exploration').click();
    await page.getByRole('button',{name:'Avsluta strid',exact:true}).click();
    await frame.locator('#appConfirmOk').click();
    await page.locator('.adventure-encounter-frame').waitFor({state:'detached'});
  }
  async function startButton(){
    if(!await button.isVisible())await page.locator('#adventureSlBoard .slcb-toggle').click();
    await button.waitFor();
    return button;
  }
  async function measure(kind,cycle,control){
    resources=[];
    await page.evaluate(({kind})=>{
      const el=document.querySelector('#mapViewport');
      const state=()=>({disabled:document.querySelector('[data-mode=battle]').disabled,
        frame:!!document.querySelector('.adventure-encounter-frame')?.getClientRects().length,
        dialog:!!document.querySelector('[data-encounter-choice][open]'),
        note:document.querySelector('.adventure-transition')?.textContent||'',
        start:!!document.querySelector('[data-action=start-encounter]:disabled')});
      document.addEventListener('click',()=>{
        const then=performance.now(),previous=JSON.stringify(state());let feedback;
        window.switchResult=null;
        function sample(){
          const elapsed=Math.round(performance.now()-then),now=state();
          if(feedback===undefined && JSON.stringify(now)!==previous)feedback=elapsed;
          const child=document.querySelector('.adventure-encounter-frame')?.contentDocument;
          const use=kind==='paus'?(!now.frame && !now.disabled && el.offsetWidth>0):
            now.frame && !!child?.querySelector('.combat-row-move') && !!child?.querySelector('.combat-token-group') && !now.note;
          if(use){
            const mask=document.querySelector('.map-fog');
            const opaque=kind==='paus' && getComputedStyle(mask).visibility==='visible' &&
              !document.querySelector('#mapOverlay mask > :nth-child(2)') && !el.querySelector('.kartakademin-canvas');
            window.switchResult={feedback:feedback??elapsed,controls:elapsed,usable:opaque?null:elapsed,opaque};
          }else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      },{capture:true,once:true});
    },{kind});
    await control.click();
    await page.waitForFunction(()=>window.switchResult,null,{timeout:90000});
    const result=await page.evaluate(()=>window.switchResult);
    const counts=Object.fromEntries(['document','image','api','art','fig'].map(k=>[k,resources.filter(r=>r[k]).length]));
    timings.push({kind,cycle,...result,requests:counts});console.log('BYSTRID',JSON.stringify(timings.at(-1)));
    await fs.writeFile(output+'/times.json',JSON.stringify(timings,null,2));
    return result;
  }
  await open();
  if(await mode('battle').textContent()==='Återuppta strid')await mode('battle').click();
  if(await mode('battle').getAttribute('aria-pressed')==='true'||await page.locator('.adventure-encounter-frame').count())await finish();
  await open();
  for(const cycle of [1,2]){
    await measure('start',cycle,await startButton());
    const board=frame.locator('.combat-map-svg');
    const box=await board.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);
    await page.mouse.wheel(0,-175);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.5+48,box.y+box.height*.55-30,{steps:7});await page.mouse.up();
    const camera=()=>page.evaluate(()=>[mapView.scale,-mapView.x/mapView.scale,-mapView.y/mapView.scale]);
    const readTurn=()=>frame.locator('.combat-map-svg').evaluate(()=>({id:activeCombat.id,turn:activeCombat.active_actor_id,
      left:combatActiveActor().movement_remaining,round:activeCombat.round_number,
      actions:combatActions.map(a=>[a.id,a.status]).sort()}));
    const beforeCamera=await camera(),beforeTurn=await readTurn();
    await mode('exploration').click();
    const pause=await measure('paus',cycle,page.getByRole('button',{name:'Pausa och utforska'}));
    if(cycle===1){
      await page.waitForTimeout(2000);
      await page.locator('#mapViewport').screenshot({path:output+'/paus.png'});
      if(variant==='before')console.log('Paus efter två sekunder',await page.evaluate(()=>({mask:getComputedStyle(document.querySelector('.map-fog')).visibility,areas:campaignMapAreas.length})));
    }
    if(variant==='after'){assert.ok(pause.usable!==null);assert.deepEqual(await camera(),beforeCamera);}
    await measure('återuppta',cycle,mode('battle'));
    assert.deepEqual(await readTurn(),beforeTurn);
    if(variant==='after')assert.deepEqual(await camera(),beforeCamera);
    await finish();
  }
  await context.close();
}finally{await browser.close();}
