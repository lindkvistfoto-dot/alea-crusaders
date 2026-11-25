// Run only against the designated DEV playtest. Results exclude login and credentials.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
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
    const confirm=variant==='before'?frame.locator('#appConfirmOk'):page.locator('#appConfirmOk');
    await confirm.filter({hasText:'Avsluta strid'}).click();
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
  async function checkPlayerProjection(){
    // A second browser represents the player's screen; changing focus in a
    // single browser can suspend the other tab's animation frames.
    const playerBrowser=await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader']});
    const spectator=await playerBrowser.newPage({storageState:await context.storageState(),viewport:{width:1440,height:920}});
    try{
      await spectator.goto(url);
      await spectator.waitForFunction(id=>activeCampaignMap?.id===id && document.querySelector('.mapworkarea.encounter-active'),map,{timeout:75000});
      const preview=spectator.locator('#adventurePreview');
      await preview.click();
      async function masked(active){
        await spectator.waitForFunction(({map,active})=>{
          const image=document.querySelector('#mapImage'),frame=document.querySelector('.adventure-encounter-frame');
          return adventurePlayerPreview && activeCampaignMap?.id===map && image.naturalWidth===1 &&
            !campaignMapAreas.length && !document.querySelector('[data-figure-id]') &&
            (active ? frame?.getClientRects().length && frame.contentDocument?.querySelector('#encounter-discovery')?.childElementCount===0 : !frame?.getClientRects().length);
        },{map,active},{timeout:45000,polling:150}).catch(async error=>{
          console.log('Spelarens kartstatus',await spectator.evaluate(()=>({
            preview:adventurePlayerPreview,map:activeCampaignMap?.id,areas:campaignMapAreas.length,
            width:document.querySelector('#mapImage').naturalWidth,visibility:document.visibilityState,
            figures:document.querySelectorAll('[data-figure-id]').length,connection:document.querySelector('#mapPage').dataset.realtime,
            frame:document.querySelector('.adventure-encounter-frame')?.hidden,notice:document.querySelector('.adventure-transition')?.textContent,
            status:document.querySelector('#mapStatusText')?.textContent
          })));
          throw error;
        });
      }
      await masked(true);
      await mode('exploration').click();await page.getByRole('button',{name:'Pausa och utforska'}).click();
      await masked(false);
      await mode('battle').click();await masked(true);
      console.log('Spelarprojektion verifierad före, under och efter paus på provkartan.');
    }finally{await playerBrowser.close();}
  }
  async function checkExploredRoom(){
    const village='dca58a7b-217d-46bc-8526-1468fad1dd69';
    const picker=page.locator('#mapPicker');
    if(!await picker.isVisible())await page.locator('#adventureSlBoard .slcb-toggle').click();
    await picker.selectOption(village);
    await page.waitForFunction(id=>activeCampaignMap?.id===id && campaignMapAreas.some(a=>a.status==='explored') && campaignMapAreas.some(a=>a.status!=='explored'),village).catch(async error=>{
      console.log('Rumskartans status',await page.evaluate(()=>({
        map:activeCampaignMap?.name,requested:adventureRequestedMap?.id,manager:adventureCanManage(),
        size:document.querySelector('#mapImage').naturalWidth,areas:campaignMapAreas.length,
        status:document.querySelector('#mapStatusText')?.textContent
      })));
      throw error;
    });
    const expected=await page.evaluate(async()=>{
      const rooms=campaignMapAreas.filter(a=>a.status==='explored');
      await openMapLocationInfoByArea(rooms[0].id);
      return rooms.map(a=>a.id).sort();
    });
    await page.locator('#adventureZoomPreset').selectOption('room');
    await page.locator('#adventurePreview').click();
    await page.waitForFunction(id=>adventurePlayerPreview && activeCampaignMap?.id===id && document.querySelector('#mapImage').naturalWidth>1,village);
    assert.deepEqual(await page.evaluate(()=>campaignMapAreas.map(a=>a.id).sort()),expected);
    assert.equal(await page.locator('.sl-outline,[data-concealed]').count(),0);
    console.log('Rum och serverbeskuren spelarvy kontrollerade på Skelettbyn med',expected.length,'utforskade områden.');
  }
  async function recordSwitch(){
    const folder=await fs.mkdtemp(os.tmpdir()+'/bystrid-video-');
    const cdp=await context.newCDPSession(page),frames=[],writes=[];
    await page.evaluate(()=>{
      window.scrollTo(0,0);
      document.addEventListener('click',event=>{
        const dot=document.createElement('i');
        Object.assign(dot.style,{position:'fixed',zIndex:2147483647,left:event.clientX-12+'px',top:event.clientY-12+'px',width:'24px',height:'24px',border:'3px solid gold',borderRadius:'50%',pointerEvents:'none'});
        (document.querySelector('dialog[open]')||document.body).append(dot);
        dot.animate([{opacity:1,transform:'scale(.6)'},{opacity:0,transform:'scale(1.8)'}],{duration:450}).finished.then(()=>dot.remove());
      },true);
    });
    const top=Math.max(0,Math.floor((await mode('exploration').boundingBox()).y/2)*2-8);
    cdp.on('Page.screencastFrame',e=>{
      const filename='frame-'+String(frames.length).padStart(5,'0')+'.jpg';
      frames.push({filename,time:e.metadata.timestamp});
      writes.push(fs.writeFile(folder+'/'+filename,Buffer.from(e.data,'base64')));
      void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
    });
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:82});
    await page.waitForTimeout(700);
    await mode('exploration').click();
    await page.waitForTimeout(450);
    await page.getByRole('button',{name:'Pausa och utforska'}).click();
    await page.locator('.adventure-encounter-frame').waitFor({state:'hidden'});
    await page.waitForTimeout(1000);
    await mode('battle').click();
    await page.locator('.adventure-encounter-frame:visible').waitFor();
    await frame.locator('.combat-token-group').first().waitFor();
    await page.waitForTimeout(1200);
    await cdp.send('Page.stopScreencast');await cdp.detach();await Promise.all(writes);
    assert.ok(frames.length>3);
    const sequence=frames.map(({filename,time},i)=>'file '+filename+'\nduration '+Math.max(.016,(frames[i+1]?.time??time+1)-time)).join('\n');
    await fs.writeFile(folder+'/frames.txt',sequence+'\nfile '+frames.at(-1).filename+'\n');
    execFileSync('ffmpeg',['-loglevel','error','-f','concat','-safe','0','-i',folder+'/frames.txt','-vf','crop=iw:ih-'+top+':0:'+top+',fps=25,format=yuv420p','-c:v','libx264','-crf','22','-movflags','+faststart','-y',output+'/Bystrid-kartvaxling.mp4']);
    await fs.rm(folder,{recursive:true});
  }
  async function checkFigureAlignment(){
    const actor=await frame.locator('.combat-map-svg').evaluate(svg=>{
      const a=combatActiveActor(),g=combatRuntimeGeometry(),matrix=svg.getScreenCTM();
      const p=new DOMPoint(g.xPitch*(a.q+a.r/2),g.rowPitch*a.r).matrixTransform(matrix);
      return {id:a.source_instance_key,x:p.x,y:p.y,scale:matrix.a};
    });
    const delta=await page.evaluate(a=>{
      const frame=document.querySelector('.adventure-encounter-frame').getBoundingClientRect();
      const piece=document.querySelector('[data-figure-id="'+a.id+'"]').getScreenCTM();
      return {x:frame.left+a.x-piece.e,y:frame.top+a.y-piece.f,scale:a.scale-piece.a};
    },actor);
    assert.ok(Math.abs(delta.x)<2&&Math.abs(delta.y)<2&&Math.abs(delta.scale)<.005,JSON.stringify(delta));
    console.log('Avvikelse vid figurens fotpunkt',JSON.stringify(delta));
  }
  async function checkMovement(){
    await frame.locator('.combat-row-move').click();
    const candidates=frame.locator('.combat-movement-hit');
    const key=await candidates.evaluateAll(nodes=>{
      const svg=document.querySelector('.combat-map-svg'),rect=svg.getBoundingClientRect();
      const actor=combatActiveActor();
      return nodes.map(el=>({el,r:el.getBoundingClientRect()})).filter(({r})=>r.x+r.width/2>rect.left && r.x+r.width/2<rect.right && r.y+r.height/2>rect.top && r.y+r.height/2<rect.bottom)
        .sort((a,b)=>combatAxialDistance(actor,{q:+a.el.dataset.q,r:+a.el.dataset.r})-combatAxialDistance(actor,{q:+b.el.dataset.q,r:+b.el.dataset.r}))
        .map(({el})=>[el.dataset.q,el.dataset.r])[0];
    });
    assert.ok(key,'En synlig nåbar hex krävs');
    await frame.locator('.combat-movement-hit[data-q="'+key[0]+'"][data-r="'+key[1]+'"]').click();
    await frame.getByRole('button',{name:'Bekräfta förflyttning'}).click();
    await frame.locator('.combat-row-move').evaluate(async()=>{
      const end=performance.now()+15000;
      while(combatMovementCommitting && performance.now()<end)await new Promise(r=>setTimeout(r,30));
      if(combatMovementCommitting || combatMovementSpent(combatActiveActor())<1)throw Error('Förflyttningen registrerades inte');
    });
  }
  await open();
  const paused=await mode('battle').textContent()==='Återuppta strid';
  if(paused)await mode('battle').click();
  if(paused || await mode('battle').getAttribute('aria-pressed')==='true' || await page.locator('.adventure-encounter-frame').count())await finish();
  await open();
  for(const cycle of [1,2]){
    await measure('start',cycle,await startButton());
    const board=frame.locator('.combat-map-svg');
    if(variant==='after')await checkFigureAlignment();
    const box=await board.boundingBox();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.55);
    await page.mouse.wheel(0,-175);
    await page.mouse.down();await page.mouse.move(box.x+box.width*.5+48,box.y+box.height*.55-30,{steps:7});await page.mouse.up();
    const camera=()=>page.evaluate(()=>[mapView.scale,-mapView.x/mapView.scale,-mapView.y/mapView.scale]);
    const readTurn=()=>frame.locator('.combat-map-svg').evaluate(()=>({id:activeCombat.id,turn:activeCombat.active_actor_id,
      left:combatActiveActor().movement_remaining,round:activeCombat.round_number,
      actions:combatActions.map(a=>[a.id,a.status]).sort()}));
    if(variant==='after' && cycle===1){
      await page.locator('#adventureZoomPreset').selectOption('all');
      await checkMovement();
      await page.locator('#adventureZoomPreset').selectOption('group');
      await page.locator('#adventureZoomPreset').selectOption('battle');
      await page.locator('.adventure-camera-tools [aria-label="Zooma ut"]').click();
      await page.locator('.adventure-camera-tools [aria-label="Zooma in"]').click();
    }
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
    if(variant==='after'){assert.deepEqual(await camera(),beforeCamera);await checkFigureAlignment();}
    if(variant==='after' && cycle===2)await checkPlayerProjection();
    if(variant==='after' && cycle===1){
      console.log('Sparad tur, förflyttning och handlingar verifierade',JSON.stringify(beforeTurn));
      await recordSwitch();
    }
    await finish();
  }
  if(variant==='after')await checkExploredRoom();
  await context.close();
}finally{await browser.close();}
