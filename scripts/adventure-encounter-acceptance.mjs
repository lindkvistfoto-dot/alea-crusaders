// Exercise both copies of the native combat runtime without a login. Each
// browser context owns its own transport and encounter, including action rows.
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function compareCombatPanels(browser,origin,output){
  const starts=[['Astrid Eldhjärta',-1,6,18],['Lyra Gråväv',-2,8,16],['Evalin Hugger',0,7,15],
    ['Skelettvakt 1',5,1,6],['Skelettvakt 2',5,2,6],['Skelettvakt 3',6,4,6],['Skelettvakt 4',4,4,6]];
  const results=[];
  for(const [embedded,gm] of [[false,true],[true,true],[false,false],[true,false]]){
    const ctx=await browser.newContext({viewport:{width:1536,height:960}});
    try{
      await ctx.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.pathname.includes('dice-box.es.min.js'))return route.fulfill({contentType:'text/javascript',body:'export default class DiceBox {}'});
        return url.origin===origin?route.continue():route.abort();
      });
      const campaign=randomUUID(),session=randomUUID(),map={id:randomUUID(),name:'Skelettbyn · regelprov',width:embedded?1535:1254,height:embedded?1024:1254,image_url:''};
      const fight={id:randomUUID(),name:map.name,campaign_id:campaign,map_id:map.id,session_id:session,
        status:'active',phase:'movement',round_number:1,settings:{rows:embedded?30:10,origin:embedded?'adventure':'reference'}};
      const actors=starts.map(([name,q,r,maximum],i)=>({
        id:randomUUID(),combat_id:fight.id,source_id:randomUUID(),source_instance_key:randomUUID(),name_snapshot:name,
        source_type:i<3?'character':'monster',side:i<3?'heroes':'enemies',visible_to_players:true,status:'active',
        current_kp:18,max_kp:18,current_psy:16,max_psy:16,sort_order:i,q,r,movement_max:maximum,
        movement_remaining:i===0?10:maximum,state:{initiative_rank:i+1,smi:12}
      }));
      const hero=actors[0];
      fight.active_actor_id=hero.id;
      const actions=[],moves=[],log=[];
      await ctx.exposeFunction('encounterTransport',(key,opts={})=>{
        const [table,query]=key.split('?'),params=new URLSearchParams(query);
        const payload=opts.body?JSON.parse(opts.body):{};
        const byId=rows=>rows.find(row=>'eq.'+row.id===params.get('id'));
        if(table==='combat_instances'){
          if(embedded){
            assert.ok(params.getAll('id').includes('eq.'+fight.id));
            assert.equal(opts.headers['x-client-info'],'alea-adventure-combat');
          }
          if(opts.method==='PATCH')Object.assign(fight,payload);
          return [fight];
        }
        if(table==='rpc/combat_finish_and_recover'){
          assert.equal(payload.p_combat_id,fight.id);
          fight.status='completed';
          return {spent:0,recovered:0};
        }
        if(table==='combatants'){
          if(opts.method==='PATCH')Object.assign(byId(actors),payload);
          if(!gm && embedded){
            assert.equal(params.get('visible_to_players'),'eq.true');
            assert.ok(params.get('source_instance_key')?.startsWith('in.('));
          }
          return gm?actors:actors.filter(a=>a.visible_to_players);
        }
        if(table==='combat_log'){
          if(opts.method==='POST')log.push(...[payload].flat().map(row=>({...row,id:randomUUID()})));
          return log.slice().reverse();
        }
        if(table==='combat_actions'){
          if(opts.method==='POST')actions.push({id:randomUUID(),...payload});
          if(opts.method==='PATCH')Object.assign(byId(actions),payload);
          if(opts.method==='DELETE')actions.splice(actions.indexOf(byId(actions)),1);
          return actions;

        }
        if(table==='rpc/alea_move_multhex'||table==='rpc/move_adventure_combatant'){
          assert.equal(table,embedded?'rpc/move_adventure_combatant':'rpc/alea_move_multhex');
          const args=JSON.parse(opts.body);
          assert.equal(args.p_combatant_id,hero.id);
          assert.equal(args.p_expected_remaining,hero.movement_remaining);
          assert.deepEqual([args.p_from_q,args.p_from_r],[hero.q,hero.r]);
          assert.equal(args.p_path.length,1);
          Object.assign(hero,args.p_path[0]);hero.movement_remaining--;
          moves.push([hero.q,hero.r]);return hero;
        }
        return [];
      });
      if(!gm)actors.at(-1).visible_to_players=false;
      const page=await ctx.newPage();
      await page.goto(origin);
      await page.waitForFunction(()=>window.aleaEnterEmbeddedEncounter);
      if(embedded){
        // The host provides the same map/session binding as displayEncounter.
        await page.evaluate(({map,fight,actors,gm})=>{
          const iframe=document.createElement('iframe');
          iframe.id='nativeEncounterFixture';iframe.style='position:fixed;inset:0;width:100vw;height:100vh;background:#15110c;z-index:9999';
          window.aleaAdventureEncounterContext=child=>child===iframe.contentWindow?{
            id:fight.id,gm,map,scope:'campaign_id=eq.'+fight.campaign_id+'&session_id=eq.'+fight.session_id+'&map_id=eq.'+map.id,
            visibleFigures:()=>actors.filter(a=>a.visible_to_players).map(a=>a.source_instance_key),finishing:()=>{},refresh:()=>{}
          }:null;
          document.body.append(iframe);iframe.src='?view=adventure-encounter';
        },{map,fight,actors,gm});
        await page.waitForFunction(()=>document.querySelector('#nativeEncounterFixture')?.contentWindow?.aleaEnterEmbeddedEncounter);
      }
      const frame=embedded?page.frames().find(f=>f.url().endsWith('?view=adventure-encounter')):page.mainFrame();
      await frame.evaluate(async({fight,map,embedded,gm})=>{
        centralCampaignId=fight.campaign_id;centralCampaignRole=gm?'gm':'player';
        document.querySelector('#loginScreen').classList.add('hidden');
        document.querySelector('main').classList.remove('hidden');
        document.querySelectorAll('main > section').forEach(el=>el.classList.toggle('hidden',el.id!=='combatPage'));
        window.dbJson=window.encounterTransport;
        if(embedded)await window.aleaEnterEmbeddedEncounter();
        else {
          window.loadCombatRuntimeBackground=async()=>{combatRuntimeMapMeta=map;combatRuntimeMapUrl='';};
          await loadActiveCombat(fight.id);
        }
      },{fight,map,embedded,gm});
      if(!gm){
        assert.equal(await frame.locator('.combatant-card').count(),6);
        assert.equal(await frame.locator('.combat-row-attack').isDisabled(),true);
        assert.equal(await frame.locator('.combat-row-move').isDisabled(),true);
        assert.equal(await frame.locator('#combatBody .sl-control-board').count(),0);
        continue;
      }
      const steps=[];
      for(const [spent,q] of [[8,-1],[9,0],[10,1]]){
        if(spent>8)await frame.evaluate(q=>moveActiveCombatantToHex(q,6),q);
        const state=await frame.evaluate(()=>({
          spent:combatMovementSpent(combatActiveActor()),attack:!document.querySelector('.combat-row-attack').disabled,
          movement:!document.querySelector('.combat-row-move').disabled,
          cards:document.querySelectorAll('#combatBody .combatant-card').length
        }));
        assert.equal(state.spent,spent);assert.equal(state.cards,7);
        assert.equal(state.attack,spent<=9);assert.equal(state.movement,true);
        assert.equal(actions.filter(a=>a.source_data.action_key==='move_full').length,spent>9?1:0);
        steps.push(state);
        await page.screenshot({path:path.join(output,(embedded?'aventyr':'referens')+'-'+spent+'-av-18.png')});
      }
      assert.deepEqual(moves,[[0,6],[1,6]]);
      for(let spent=11;spent<=18;spent++){
        await frame.evaluate(q=>moveActiveCombatantToHex(q,6),spent%2?0:1);
        assert.equal(hero.movement_remaining,18-spent);
      }
      assert.equal(await frame.locator('.combat-row-move').isDisabled(),true);
      assert.equal(await frame.evaluate(()=>combatReachableHexes(combatActiveActor()).has('0,6')),false);
      assert.equal(moves.length,10,'Full movement must stop at 18');
      assert.equal(actions.filter(a=>a.source_data.action_key==='move_full').length,1);
      for(let turn=0;turn<actors.length;turn++){
        const currentId=fight.active_actor_id;
        await frame.evaluate(id=>endCombatTurn(null,id),currentId);
        if(turn<actors.length-1)assert.notEqual(fight.active_actor_id,currentId);
      }
      assert.equal(fight.round_number,2);
      assert.equal(hero.movement_remaining,18);
      assert.equal(log.filter(row=>row.event_type==='turn_end').length,7);
      // Independent melee checkpoint after the round reset, with the same
      // adjacent defender in each run. Drive the actual target and parry UI.
      fight.active_actor_id=hero.id;
      const defender=actors[3];
      Object.assign(defender,{q:hero.q+1,r:hero.r});
      hero.state.attack_profile={weapons:[{id:'sword',name:'Svärd',category:'melee',fv:15,damage:'1T6'}]};
      defender.state.attack_profile={shields:[{id:'shield',name:'Sköld',fv:15,abs:5}]};
      await frame.evaluate(async({id,roll})=>{
        window.combatRollDice=async()=>({rolls:[{value:roll}]});
        await loadActiveCombat(id);
      },{id:fight.id,roll:embedded?9:8});
      await frame.locator('.combat-row-attack').click();
      await frame.waitForFunction(()=>combatChosenAction(combatActiveActor())?.status==='planned');
      await frame.locator('.combatant-card[data-combatant-id="'+defender.id+'"]').click();
      await frame.evaluate(()=>combatAttackButton(null,combatActiveActor().id));
      const attack=actions.find(a=>a.action_type==='attack');
      assert.equal(attack?.result?.awaiting_parry,true);
      assert.equal(await frame.locator('.combat-defense-attack').isVisible(),true);
      await page.screenshot({path:path.join(output,(embedded?'aventyr':'referens')+'-forsvar.png')});
      await frame.evaluate(async()=>{
        const pending=combatPendingParryOpportunity();
        await chooseCombatParry(pending.defender.id,pending.attack.id,pending.options[0].key);
      });
      assert.equal(attack.result.parry_decision,'parried');
      assert.equal(log.filter(r=>r.event_type==='attack').length,1);
      assert.equal(log.filter(r=>r.event_type==='parry').length,1);
      await frame.locator('#combatBody .slcb-toggle').click();
      await frame.locator('#combatBody .combat-stop-btn').click();
      await frame.locator('#appConfirmOk').click();
      await frame.waitForFunction(()=>activeCombat?.settings?.end_summary?.format===1);
      assert.equal(fight.status,'completed');
      assert.deepEqual([hero.q,hero.r],[1,6]);
      results.push(steps);
    }finally{await ctx.close();}
  }
  assert.deepEqual(results[0],results[1]);
}
