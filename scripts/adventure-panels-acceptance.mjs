// Run against a locally served DEV build:
// node scripts/adventure-panels-acceptance.mjs http://127.0.0.1:4173 crypt.webp visual-results/panels
import {compareCombatPanels} from './adventure-encounter-acceptance.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const [origin, painting, output] = process.argv.slice(2);
assert.equal(new URL(origin).hostname, '127.0.0.1');
await fs.access(painting);
await fs.mkdir(output, {recursive:true});
const art = JSON.parse(await fs.readFile(new URL('../tests/fixtures/adventure-figure-art.json', import.meta.url)));
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--enable-unsafe-swiftshader']});
const failures = [];

async function scenario(mobile) {
  const device = mobile ? 'mobile' : 'desktop';
  const session = {id:randomUUID(), campaign_id:randomUUID(), status:'active'};
  const map = {id:randomUUID(), campaign_id:session.campaign_id, name:'Kryptans dörr', width:800, height:680, image_url:origin+'/crypt.webp', player_visible:true};
  const room = {id:randomUUID(), location_id:randomUUID(), name:'Portkammaren', status:'explored', shape_type:'rect', shape_data:{x:0,y:0,width:650,height:680}};
  const astrid=art.heroes.find(hero=>hero.name==='Astrid Eldhjärta');
  const hero = {id:randomUUID(), character_id:astrid.id, name:astrid.name, q:4,r:5,player_visible:true};
  const guard = {id:randomUUID(), monster_id:randomUUID(), name:'Kryptväktare', q:7,r:4,player_visible:false};
  // Resume a saved, partly spent round. Resetting to the defaults must be detectable.
  const hex = {round:0,paused:3,epoch:0,prefs:{grid:'hidden'},budgets:{[hero.id]:{max:18,spent:8}}};
  const clients = [];
  let nativeFight=null,nativePaused=false,starts=0,actors=[];
  let failNextResume=true,pauseCommits=0;
  const config = {version:1,darkness:0,pixelsPerMeter:25,lights:[],geometry:[],freeSight:null};
  async function client(manager) {
    const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:960},hasTouch:mobile,isMobile:mobile});
    const role = manager?'sl':'spelare';
    page.setDefaultTimeout(8000);
    await page.route('**/*', route=>{
      const url = new URL(route.request().url());
      if(url.pathname==='/crypt.webp' || url.pathname.includes('/hermes/system-asset/arcane-hero-class-')) return route.fulfill({path:painting,contentType:'image/webp'});
      if(url.pathname.includes('dice-box.es.min.js')) return route.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'});
      return url.origin===origin ? route.continue() : route.abort();
    });
    page.on('framenavigated',async frame=>{
      if(!frame.url().endsWith('?view=adventure-encounter'))return;
      try{
        await frame.waitForFunction(()=>window.aleaEnterEmbeddedEncounter);
        await frame.evaluate(async({campaign,manager})=>{
          centralCampaignId=campaign;centralCampaignRole=manager?'gm':'player';
          window.dbJson=window.panelFixtureRead;
          document.getElementById('loginScreen').classList.add('hidden');
          document.querySelector('main').classList.remove('hidden');
          await window.aleaEnterEmbeddedEncounter();
        },{campaign:session.campaign_id,manager});
      }catch(error){if(!frame.isDetached())failures.push(error.message);}
    });
    // Only the transport is simulated. A server change notifies the other session.
    await page.exposeFunction('panelFixtureRead', async (key,opts={})=>{
      const values = JSON.parse(opts.body||'{}');
      if(key==='rpc/start_adventure_encounter'){
        assert.ok(manager);
        assert.equal(values.p_session,session.id);assert.equal(values.p_map,map.id);
        assert.deepEqual(values.p_actors.map(a=>[a.figure_id,a.q,a.r]),[[hero.id,hero.q,hero.r],[guard.id,guard.q,guard.r]]);
        assert.equal(new Set(values.p_initiative.order).size,2);
        actors=values.p_actors.map(a=>({...a,source_instance_key:a.figure_id}));
        starts++;nativeFight=randomUUID();hex.round=0;hex.paused=0;
        await notifyOthers();return nativeFight;
      }
      if(key==='rpc/set_adventure_encounter_paused'){
        assert.ok(manager);assert.equal(values.p_encounter,nativeFight);
        if(!values.p_paused && failNextResume){failNextResume=false;throw Error('Tillfälligt avbrott i provet');}
        await new Promise(resolve=>setTimeout(resolve,350));
        pauseCommits++;nativePaused=values.p_paused;await notifyOthers();return null;
      }
      if(key==='rpc/command_adventure_hex'){
        assert.ok(manager);assert.equal(values.p_epoch,hex.epoch);
        switch(values.p_action){
          case 'setting': hex.prefs[values.p_values.key]=values.p_values.value;break;
          case 'begin': hex.round=hex.paused||1;hex.paused=0;break;
          case 'move': {
            const move=values.p_values;
            assert.equal(move.id,hero.id);
            assert.deepEqual(move.from,[hero.q,hero.r]);
            assert.equal(move.path.length,1);
            [hero.q,hero.r]=move.path[0];
            hex.budgets[hero.id].spent++;
            await notifyOthers();
            return [{id:hero.id}];
          }
          case 'pause': hex.paused=hex.round;hex.round=0;break;
          default: throw Error('Unexpected command '+values.p_action);
        }
        hex.epoch++;
        await notifyOthers();
        return structuredClone(hex);
      }
      if(key==='rpc/read_adventure_hex') return structuredClone(hex);
      if(key.includes('read_adventure_player_figures')) return [hero,guard].filter(row=>row.player_visible);
      if(key.startsWith('adventure_map_figures?')){
        assert.ok(manager);
        if(opts.method==='PATCH'){
          assert.ok(key.includes(guard.id));assert.equal(values.player_visible,true);
          guard.player_visible=true;await notifyOthers();return [guard];
        }
        return [hero,guard];
      }
      if(key.startsWith('combat_instances?')){
        if(key.includes('settings->>origin=eq.adventure'))return nativeFight && !key.includes('status=eq.completed')?[{id:nativeFight,status:nativePaused?'paused':'active'}]:[];
        const query=new URLSearchParams(key.split('?')[1]);
        if(nativeFight && query.get('id')==='eq.'+nativeFight)return [{id:nativeFight,round_number:1,status:nativePaused?'paused':'active',active_actor_id:actors[0].id,settings:{rows:30}}];
        assert.equal(query.get('map_id'),'eq.'+map.id);
        assert.equal(query.get('session_id'),'eq.'+session.id);
        assert.equal(query.get('campaign_id'),'eq.'+session.campaign_id);
        return query.has('active_actor_id') ? [{active_actor_id:hero.id}] : [{id:session.id}];
      }
      if(key.startsWith('combatants?')){
        const query=new URLSearchParams(key.split('?')[1]);
        if(nativeFight && query.get('combat_id')==='eq.'+nativeFight)return actors.filter(a=>manager||a.visible_to_players);
        assert.equal(query.get('combat_id'),'eq.'+session.id);
        if(!manager) assert.equal(query.get('visible_to_players'),'eq.true');
        return [hero,guard].filter(f=>manager||f.player_visible).map(f=>({
          id:f.id,source_id:f.character_id||f.monster_id,source_type:f.character_id?'character':'monster'
        }));
      }
      if(key.startsWith('game_sessions?')) return [session];
      if(key.startsWith('campaign_map_academy?')) return [{configuration:config,revision:1}];
      if(key.includes('read_campaign_map_academy_player')) return config;
      if(key.startsWith('campaign_location_assets?')) return [{id:room.id,asset_type:'image',title:'Kryptporten',storage_path:'crypt.webp',player_visible:true}];
      if(key.startsWith('campaign_location_player_texts?')) return [{player_description:'Porten står på glänt.',player_visible:true}];
      if(key.startsWith('campaign_location_gm_notes?')) {assert.ok(manager);return [{gm_description:'Hemlig vaktpost'}];}
      if(key.startsWith('arcane_system_assets?')) return art.assets;
      if(key.startsWith('combatant_battle_poses?')) return art.poses;
      return [];
    });
    async function notifyOthers(){
      for(const c of clients.filter(c=>c.page!==page)) await c.page.evaluate(()=>window.aleaAdventureFigures.refresh());
    }
    async function enter(){
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.aleaAdventureFigures);
      await page.evaluate(async ({manager,map,room,hero})=>{
        window.dbJson=window.panelFixtureRead;
        centralCampaignId=map.campaign_id;centralCampaignRole=manager?'gm':'player';campaignMaps=[map];
        chars=[{id:'astrid',_dbId:hero.character_id,name:hero.name,isNpc:false,identity:{namn:hero.name},live:{}}];
        window.locationAssetStorageFetch=async key=>{
          if(key!=='object/campaign-location-assets/crypt.webp') throw Error('Unknown fixture asset');
          return fetch(map.image_url);
        };
        document.querySelectorAll('#loginScreen,#landing').forEach(el=>el.classList.add('hidden'));
        document.querySelectorAll('header,main').forEach(el=>el.classList.remove('hidden'));
        document.querySelectorAll('main > section').forEach(el=>el.classList.toggle('hidden',el.id!=='mapPage'));
        setCampaignMapData(map,[room]);await openMapLocationInfoByArea(room.id);
      },{manager,map,room,hero});
      await page.locator('[data-figure-id="'+hero.id+'"]').waitFor({state:'attached'});
      await page.locator('#mapImage').evaluate(img=>img.decode());
      if(!hex.round) await page.getByRole('img',{name:'Kryptporten'}).waitFor();
      await page.evaluate(()=>{Object.assign(mapView,{scale:1.2,x:-75,y:-40,fitted:false});applyMapTransform();});
    }
    await enter();
    if(!mobile){
      for(const width of [1440,1920]){
        await page.setViewportSize({width,height:960});
        const geometry=await page.evaluate(()=>{
          const bounds=selector=>document.querySelector(selector).getBoundingClientRect();
          const header=bounds('.alea-app-header > .bar');
          const board=bounds('#mapPage .mapworkarea');
          const tracks=getComputedStyle(document.querySelector('#mapPage .mapworkarea')).gridTemplateColumns.split(' ').map(parseFloat);
          return {left:board.left-header.left,right:board.right-header.right,tracks};
        });
        assert.ok(Math.abs(geometry.left)<=1 && Math.abs(geometry.right)<=1,JSON.stringify(geometry));
        const [left,center,right]=geometry.tracks;
        assert.ok(Math.abs(left-right)<=1 && Math.abs(center-left*2)<=1,JSON.stringify(geometry));
      }
      await page.setViewportSize({width:1440,height:960});
    }
    const c={page,role,enter};clients.push(c);return c;
  }
  async function snapshot(page){
    return page.evaluate(()=>{
      const point=document.querySelector('#mapCanvas').getBoundingClientRect();
      const viewport=document.querySelector('#mapViewport').getBoundingClientRect();
      return {camera:[mapView.scale,mapView.x,mapView.y,point.x-viewport.x,point.y-viewport.y],pieces:[...document.querySelectorAll('[data-figure-id]')].map(el=>[el.dataset.figureId,el.getAttribute('transform')]).sort()};
    });
  }
  async function inspect(stage,battle,grid){
    for(const {page,role} of clients){
      const left=page.locator('#mapPage .mapworkarea > aside').first();
      const right=page.locator('#mapPage .mapworkarea > aside').last();
      assert.equal(await page.locator('#mapPage .mapworkarea > aside').count(),2);
      const [l,r]=await Promise.all([left.innerText(),right.innerText()]);
      const check=(ok,msg)=>{if(!ok) failures.push(device+' / '+role+' / '+stage+' — '+msg);};
      check(await left.isVisible()&&await right.isVisible(),'båda panelytorna ska vara åtkomliga');
      check(await left.getByRole('img',{name:'Kryptporten'}).isVisible()===!battle,'delad bild i rätt läge');
      check(r.includes('Porten står på glänt.')===!battle,'platsbeskrivning i rätt läge');
      check(/runda\s*3\b/i.test(l)===battle,'runda 3 i vänsterpanelen');
      check(l.includes(hero.name)===battle,'aktuell aktör i vänsterpanelen');
      check(/handling|anfall|attack/i.test(l)===battle,'handlingar i vänsterpanelen');
      check(/turordning/i.test(r)===battle && r.includes(hero.name)===battle,'turordning och deltagare i högerpanelen');
      const expectedCards=battle?(role==='sl'||guard.player_visible?2:1):0;
      check(await right.locator('[data-combatant-id]:visible').count()===expectedCards,'antal synliga deltagarkort');
      check(r.includes(guard.name)===(battle&&(role==='sl'||guard.player_visible)),'vaktens synlighet i högerpanelen');
      check(!r.includes('Hemlig vaktpost')||role==='sl','SL-information dold för spelaren');
      check((await page.locator('[data-tactical-grid].awakened').count()>0)===grid,'rutnätets verkliga synlighet');
      await page.screenshot({path:path.join(output,[device,role,stage].join('-')+'.png')});
    }
  }
  try{
    const gm=await client(true), player=await client(false);
    const button=mode=>gm.page.locator('#adventureModeSwitch [data-mode="'+mode+'"]');
    async function mode(value){
      const before=await Promise.all(clients.map(c=>snapshot(c.page)));
      await button(value).click();
      await gm.page.waitForFunction(value=>document.querySelector('[data-mode="'+value+'"]').getAttribute('aria-pressed')==='true',value);
      const after=await Promise.all(clients.map(c=>snapshot(c.page)));
      for(const [i,result] of after.entries()){
        assert.deepEqual(result.pieces,before[i].pieces);
        assert.deepEqual(result.camera.slice(0,3),before[i].camera.slice(0,3));
        // Subtracting browser client rectangles can differ by a fraction of a CSS pixel.
        for(const axis of [3,4])assert.ok(Math.abs(result.camera[axis]-before[i].camera[axis])<.01);
      }
    }
    const toggle=gm.page.locator('#adventureSlBoard .slcb-toggle');
    await inspect('utforskning-av',false,false);
    await mode('battle');await inspect('strid-av',true,false);
    await toggle.click();
    await gm.page.getByText('Hexagonernas utseende',{exact:true}).click();
    await gm.page.locator('[data-hex-setting=grid]').selectOption('always');
    await gm.page.locator('[data-tactical-grid].awakened').waitFor({state:'attached'});
    await toggle.click();await inspect('strid-på',true,true);
    assert.match(await gm.page.locator('.adventure-move-cost').innerText(),/8\/18/);
    for(const [q,spent,type] of [[5,9,'half'],[6,10,'full']]){
      await toggle.click();
      await gm.page.locator('[data-instance="'+hero.id+'"] [data-action=move]').click();
      const layer=gm.page.locator('.adventure-figure-layer');
      await gm.page.locator('#mapViewport').scrollIntoViewIfNeeded();
      const target=await layer.evaluate(async (el,q)=>{
        // Centre this one-step move in the viewport after the board has closed.
        const viewport=document.querySelector('#mapViewport');
        const dest=new DOMPoint(25*Math.sqrt(3)*(q+5/2),37.5*5);
        const bounds=viewport.getBoundingClientRect();
        const prior=dest.matrixTransform(el.getScreenCTM());
        mapView.x+=bounds.left+bounds.width/2-prior.x;
        mapView.y+=bounds.top+bounds.height/2-prior.y;
        applyMapTransform();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

        const point=new DOMPoint(25*Math.sqrt(3)*(q+5/2),37.5*5).matrixTransform(el.getScreenCTM());
        return [point.x,point.y];
      },q);
      await gm.page.waitForFunction(([x,y])=>document.querySelector('#mapViewport').contains(document.elementFromPoint(x,y)),target);
      if(mobile) await gm.page.touchscreen.tap(...target);
      else await gm.page.mouse.click(...target);
      await gm.page.waitForFunction(()=>!document.querySelector('[data-cancel]'));
      for(const {page} of clients){
        await page.waitForFunction(({id,q})=>{
          const piece=document.querySelector('[data-figure-id="'+id+'"]');
          const matrix=piece?.transform.baseVal.consolidate()?.matrix;
          return matrix && Math.abs(matrix.e-25*Math.sqrt(3)*(q+2.5))<0.01 && Math.abs(matrix.f-187.5)<0.01;
        },{id:hero.id,q});
      }
      assert.deepEqual([hero.q,hero.r],[q,5]);
      const cost=gm.page.locator('.adventure-move-cost');
      await gm.page.locator('.adventure-move-cost[data-move-type='+type+']').filter({hasText:spent+'/18'}).waitFor();
      assert.ok((await cost.innerText()).includes(spent+'/18'));
      await gm.page.screenshot({path:path.join(output,device+'-sl-'+spent+'-av-18.png')});
    }
    await mode('exploration');await inspect('utforskning-på',false,true);
    await mode('battle');await inspect('återupptagen',true,true);
    await player.enter();await inspect('omladdning',true,true);
    await toggle.click();
    const card=gm.page.locator('[data-instance="'+hero.id+'"]');
    assert.match(await card.innerText(),/Förflyttning 8 \/ 18/);
    await gm.page.locator('[data-instance="'+guard.id+'"] [data-action=visibility]').click();
    await player.page.locator('[data-figure-id="'+guard.id+'"]').waitFor({state:'attached'});
    await toggle.click();await inspect('avslöjad',true,true);
    if(mobile){
      await mode('exploration');
      for(const {page} of clients){
        const zone=page.locator('.map-zone[data-area-id="'+room.id+'"]');
        await zone.scrollIntoViewIfNeeded();
        await zone.tap();
        await page.getByRole('img',{name:'Kryptporten'}).waitFor();
      }
    }
    async function cameraControls(page){
      const camera=()=>page.evaluate(()=>[mapView.scale,-mapView.x/mapView.scale,-mapView.y/mapView.scale]);
      const presets=page.locator('#adventureZoomPreset');
      await page.locator('.adventure-camera-tools').scrollIntoViewIfNeeded();
      const battle=await button('battle').getAttribute('aria-pressed');
      for(const preset of ['all','room','battle','group','person']){
        await presets.selectOption(preset);
        assert.ok((await camera()).every(Number.isFinite));
      }
      const before=await camera();
      await page.locator('.adventure-camera-tools [aria-label="Zooma ut"]').click();
      assert.ok((await camera())[0]<before[0]);
      await page.locator('.adventure-camera-tools [aria-label="Zooma in"]').click();
      const restored=await camera();
      restored.forEach((value,i)=>assert.ok(Math.abs(value-before[i])<.01));
      await page.locator('.adventure-camera-tools').getByRole('button',{name:'Centrera'}).click();
      assert.equal(await button('battle').getAttribute('aria-pressed'),battle);
    }
    // A deliberate selection unlocks Person. The previously opened room unlocks Rum.
    await gm.page.evaluate(()=>{const el=document.querySelector('[data-figure-id]');el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,isPrimary:true}));});
    await cameraControls(gm.page);
    const start=gm.page.locator('[data-action=start-encounter]');
    if(!await start.isVisible())await toggle.click();
    await start.evaluate(button=>{button.click();button.click();});
    for(const {page} of clients){
      await page.locator('.adventure-encounter-frame').waitFor();
      await page.evaluate(()=>window.aleaAdventureFigures.refresh());
      assert.equal(await page.locator('.adventure-encounter-frame').count(),1);
      assert.ok(await page.locator('#mapViewport').isVisible());
      assert.ok(await page.locator('.adventure-camera-tools').isVisible());
      const overlay=page.frameLocator('.adventure-encounter-frame').locator('.combat-map-svg');
      const mapBox=await page.locator('#mapViewport').boundingBox(),tactical=await overlay.boundingBox();
      for(const key of ['x','y','width','height'])assert.ok(Math.abs(tactical[key]-mapBox[key])<3,'Kartlagren skiljer sig '+JSON.stringify({mapBox,tactical}));
      const sameArt=await page.evaluate(({id,source})=>{
        const child=document.querySelector('.adventure-encounter-frame').contentWindow;
        const host=window.aleaAdventureEncounterContext(child);
        const actor={source_instance_key:id,source_type:'character',source_id:source,name_snapshot:'Astrid Eldhjärta'};
        const drawing=host.drawFigure(actor,Math.sqrt(3)*37.5/1.5);
        const original=document.querySelector('[data-figure-id="'+id+'"] [data-hero-class]');
        const comparison=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+drawing+'</svg>','image/svg+xml');
        const figure=comparison.querySelector('[data-hero-class]');
        return !!figure && !!original && figure.isEqualNode(original);
      },{id:hero.id,source:hero.character_id});
      assert.ok(sameArt,'Samma Hero Class-original, fotpunkt och skala i båda lägena');
    }
    await cameraControls(gm.page);
    const playerMask=player.page.frameLocator('.adventure-encounter-frame').locator('#encounter-discovery rect');
    assert.equal(await playerMask.getAttribute('width'),'650');
    const originalDocument=await gm.page.locator('.adventure-encounter-frame').evaluate(f=>f.contentWindow.performance.timeOrigin);
    assert.equal(starts,1);
    await button('exploration').click();
    await gm.page.getByRole('button',{name:'Stanna kvar i strid'}).click();
    assert.equal(nativePaused,false);
    await button('exploration').click();
    await gm.page.getByRole('button',{name:'Pausa och utforska'}).click();
    for(const {page} of clients)await page.locator('.adventure-encounter-frame').waitFor({state:'hidden'});
    await player.enter();
    assert.equal(await player.page.locator('.adventure-encounter-frame').count(),0);
    await gm.page.getByRole('button',{name:'Återuppta strid'}).click();
    await gm.page.locator('.adventure-transition').filter({hasText:'Tillfälligt avbrott'}).waitFor();
    await gm.page.getByRole('button',{name:'Försök igen'}).click();
    await gm.page.locator('.adventure-transition').filter({hasText:'Återupptar striden'}).waitFor();
    for(const {page} of clients)await page.locator('.adventure-encounter-frame').waitFor();
    assert.equal(starts,1);
    assert.equal(await gm.page.locator('.adventure-encounter-frame').evaluate(f=>f.contentWindow.performance.timeOrigin),originalDocument);
    await button('exploration').click();
    await gm.page.getByRole('button',{name:'Avsluta strid',exact:true}).click();
    const confirmation=gm.page.locator('#appConfirm');
    await confirmation.locator('#appConfirmOk').click({trial:true});
    await confirmation.getByRole('button',{name:'Avbryt'}).click();
    assert.ok(await gm.page.locator('.adventure-encounter-frame').isVisible());
    assert.equal(pauseCommits,2);
    nativeFight=null;
    for(const {page} of clients){
      await page.evaluate(()=>window.aleaAdventureFigures.refresh());
      assert.equal(await page.locator('.adventure-encounter-frame').count(),0);
      assert.equal(await page.locator('.mapworkarea').isVisible(),true);
      assert.ok(await page.locator('[data-figure-id="'+hero.id+'"]').count());
    }
  }finally{for(const c of clients) await c.page.close();}
}

try{
  await compareCombatPanels(browser,origin,output);
  for(const mobile of [false,true]) await scenario(mobile);
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({failures},null,2));
  assert.equal(failures.length,0,failures.join('\n'));
}finally{await browser.close();}
