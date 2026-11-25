// Run against a locally served DEV build:
// node scripts/adventure-panels-acceptance.mjs http://127.0.0.1:4173 crypt.webp visual-results/panels
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
  const room = {id:randomUUID(), location_id:randomUUID(), name:'Portkammaren', status:'explored', shape_type:'rect', shape_data:{x:0,y:0,width:800,height:680}};
  const hero = {id:randomUUID(), character_id:art.heroes[0].id, name:art.heroes[0].name, q:4,r:5,player_visible:true};
  const guard = {id:randomUUID(), monster_id:randomUUID(), name:'Kryptväktare', q:7,r:4,player_visible:false};
  // Resume a saved, partly spent round. Resetting to the defaults must be detectable.
  const hex = {round:0,paused:3,epoch:0,prefs:{grid:'hidden'},budgets:{[hero.id]:{max:4,spent:1}}};
  const clients = [];
  const config = {version:1,darkness:0,pixelsPerMeter:25,lights:[],geometry:[],freeSight:null};
  async function client(manager) {
    const page = await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:960},hasTouch:mobile,isMobile:mobile});
    const role = manager?'sl':'spelare';
    page.setDefaultTimeout(8000);
    await page.route('**/*', route=>{
      const url = new URL(route.request().url());
      if(url.pathname==='/crypt.webp') return route.fulfill({path:painting,contentType:'image/webp'});
      if(url.pathname.includes('dice-box.es.min.js')) return route.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'});
      return url.origin===origin ? route.continue() : route.abort();
    });
    // Only the transport is simulated. A server change notifies the other session.
    await page.exposeFunction('panelFixtureRead', async (key,opts={})=>{
      const values = JSON.parse(opts.body||'{}');
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
    await page.exposeFunction('readFixtureCombat',()=>({
      combat:{id:session.id,status:'active',round_number:hex.round||hex.paused,phase:'action',active_actor_id:hero.id},
      actors:[hero,guard].filter(row=>manager||row.player_visible).map(row=>({
        id:row.id,name_snapshot:row.name,source_type:row.character_id?'character':'monster',
        source_id:row.character_id||row.monster_id,q:row.q,r:row.r,side:row.character_id?'players':'enemies',
        state:{movement_max:4,movement_remaining:4-(hex.budgets[row.id]?.spent||0)}
      }))
    }));
    async function notifyOthers(){
      for(const c of clients.filter(c=>c.page!==page)) await c.page.evaluate(async()=>{await window.readPanelCombat();await window.aleaAdventureFigures.refresh();});
    }
    async function enter(){
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.aleaAdventureFigures);
      await page.evaluate(async ({manager,map,room,hero})=>{
        window.readPanelCombat=async()=>{
          const data=await window.readFixtureCombat();activeCombat=data.combat;combatants=data.actors;
        };
        await window.readPanelCombat();
        window.dbJson=async(key,opts)=>{
          const result=await window.panelFixtureRead(key,opts);
          if(key==='rpc/read_adventure_hex') await window.readPanelCombat();
          return result;
        };
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
      assert.deepEqual(await Promise.all(clients.map(c=>snapshot(c.page))),before,'Kameran eller figurpositionerna ändrades vid lägesbyte');
    }
    const toggle=gm.page.locator('#adventureSlBoard .slcb-toggle');
    await inspect('utforskning-av',false,false);
    await mode('battle');await inspect('strid-av',true,false);
    await toggle.click();
    await gm.page.getByText('Hexagonernas utseende',{exact:true}).click();
    await gm.page.locator('[data-hex-setting=grid]').selectOption('always');
    await gm.page.locator('[data-tactical-grid].awakened').waitFor({state:'attached'});
    await toggle.click();await inspect('strid-på',true,true);
    await toggle.click();
    await gm.page.locator('[data-instance="'+hero.id+'"] [data-action=move]').click();
    const layer=gm.page.locator('.adventure-figure-layer');
    await gm.page.locator('#mapViewport').scrollIntoViewIfNeeded();
    const target=await layer.evaluate(async el=>{
      // Centre this one-step move in the viewport after the board has closed.
      const viewport=document.querySelector('#mapViewport');
      const dest=new DOMPoint(25*Math.sqrt(3)*(5+5/2),37.5*5);
      const bounds=viewport.getBoundingClientRect();
      const prior=dest.matrixTransform(el.getScreenCTM());
      mapView.x+=bounds.left+bounds.width/2-prior.x;
      mapView.y+=bounds.top+bounds.height/2-prior.y;
      applyMapTransform();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

      const point=new DOMPoint(25*Math.sqrt(3)*(5+5/2),37.5*5).matrixTransform(el.getScreenCTM());
      return [point.x,point.y];
    });
    await gm.page.waitForFunction(([x,y])=>document.querySelector('#mapViewport').contains(document.elementFromPoint(x,y)),target);
    if(mobile) await gm.page.touchscreen.tap(...target);
    else await gm.page.mouse.click(...target);
    await gm.page.waitForFunction(()=>!document.querySelector('[data-cancel]'));
    for(const {page} of clients){
      await page.waitForFunction(id=>{
        const piece=document.querySelector('[data-figure-id="'+id+'"]');
        const matrix=piece?.transform.baseVal.consolidate()?.matrix;
        return matrix && Math.abs(matrix.e-25*Math.sqrt(3)*7.5)<0.01 && Math.abs(matrix.f-187.5)<0.01;
      },hero.id);
    }
    assert.deepEqual([hero.q,hero.r],[5,5]);
    await mode('exploration');await inspect('utforskning-på',false,true);
    await mode('battle');await inspect('återupptagen',true,true);
    await player.enter();await inspect('omladdning',true,true);
    await toggle.click();
    const card=gm.page.locator('[data-instance="'+hero.id+'"]');
    assert.match(await card.innerText(),/Förflyttning 2 \/ 4/);
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
  }finally{for(const c of clients) await c.page.close();}
}

try{
  for(const mobile of [false,true]) await scenario(mobile);
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({failures},null,2));
  assert.equal(failures.length,0,failures.join('\n'));
}finally{await browser.close();}
