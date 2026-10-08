import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261008_eldsalamander_summon_unique.sql',import.meta.url),'utf8');
const start=runtime.indexOf('function combatIsFireElementalSummonName('),end=runtime.indexOf('function combatGmToolboxHtml(',start);
if(start<0||end<start)throw Error('Missing elemental GM summon controls');
const section=runtime.slice(start,end);
const caster={id:'actor-1',name_snapshot:'Magikern',side:'heroes',q:2,r:3,sort_order:2,status:'active'};
const successful={id:'spell-1',combatant_id:'actor-1',status:'resolved',round_number:4,
 source_data:{spell_name:'FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)'},
 result:{success:true,effect_grade:3}};
const sample={id:'elemental-1',name:'Eldsalamander',active:true,
 npc_key:'eldsalamander_frammanad',attributes:{FYS:0,STO:8,SMI:11,PSY:12,KP:11,FORFLYTTNING:10},
 weapons:[{name:'Eldberöring',fv:11,damage:'1T6'}]};
function setup(overrides={}){
 const combatants=[{...caster}],combatActions=[structuredClone(successful)],writes=[],alerts=[];
 const env={combatCanManage:()=>true,activeCombat:{id:'combat-1',round_number:4},
  centralCampaignId:'campaign-1',combatants,combatActions,combatGmPlacementId:null,
  combatGmIsReserve:c=>c.state?.in_reserve===true,escAttr:String,
  crypto:{randomUUID:()=> 'new-summon-1'},
  alert:msg=>alerts.push(msg),confirm:()=>true,
  console,Map,
  combatSourceStats:()=>({current_kp:11,max_kp:11,current_psy:12,max_psy:12,
   movement_max:10,movement_remaining:10,attributes:{...sample.attributes},
   smi:11,sty:0,sto:8,attack_profile:{weapons:sample.weapons}}),
  dbJson:async(path,opts)=>{
   if(path.startsWith('campaign_npcs?'))return[sample];
   if(!opts)throw Error('Unexpected query '+path);
   const body=JSON.parse(opts.body);writes.push({path,body});
   if(path.startsWith('combatants?select=id')){combatants.push(body);return[{id:body.id}]}
   return[]
  },
  loadActiveCombat:async()=>{},renderCombat:()=>{},...overrides};
 runInNewContext(section+'\nthis.api={candidates:combatSummonActionCandidates,html:combatSummonPanelHtml,create:combatCreateEldsalamanderFromSpell,dismiss:combatDismissEldsalamander};',env);
 return {api:env.api,env,combatants,combatActions,writes,alerts}
}
describe('Eldsalamander – SL creates creature after Expert summon',()=>{
 it('offers button only for resolved successful summon magic',()=>{
  const x=setup();
  expect(x.api.candidates()).toHaveLength(1);
  expect(x.api.html()).toContain('Skapa eldsalamander');
  x.combatActions[0].result.success=false;
  expect(x.api.candidates()).toHaveLength(0);
  x.combatActions[0].result.success=true;
  x.combatActions[0].result.blocked_by_beskyddare=true;
  expect(x.api.candidates()).toHaveLength(0)
 });
 it('does not offer an unrelated summoning spell or failed action',()=>{
  const x=setup();
  x.combatActions[0].source_data.spell_name='TILLKALLA VARELSE';
  expect(x.api.candidates()).toHaveLength(0);
  for(const element of ['LUFT','JORD','VATTEN']){
   x.combatActions[0].source_data.spell_name='FRAMMANA/SKICKA BORT ELEMENTAR – '+element+' (F)';
   expect(x.api.candidates()).toHaveLength(0);
 }
 x.combatActions[0].source_data.spell_name='FRAMMANA/SKICKA BORT ELEMENTAR (F)';
 expect(x.api.candidates()).toHaveLength(1); // Old resolved casts still work.
 x.combatActions[0].source_data.spell_name=successful.source_data.spell_name;
 x.combatActions[0].status='planned';
  expect(x.api.candidates()).toHaveLength(0)
 });
 it('instantiates a reusable NPC in reserve with caster side, verified KP and action link',async()=>{
  const x=setup();
  await x.api.create('spell-1');
  const inserted=x.writes.find(w=>w.path.startsWith('combatants?select=id'))?.body;
  expect(inserted).toMatchObject({id:'new-summon-1',combat_id:'combat-1',
   source_type:'npc',source_id:'elemental-1',source_instance_key:'summon:spell-1',
   name_snapshot:'Eldsalamander',side:'heroes',status:'removed',
   max_kp:11,current_kp:11,movement_max:10});
  expect(inserted.state).toMatchObject({in_reserve:true,effect_grade:3,
   summoning_action_id:'spell-1',summon_template_key:'eldsalamander_frammanad'});
  expect(x.env.combatGmPlacementId).toBe('new-summon-1');
  expect(x.writes.some(w=>w.path==='combat_log')).toBe(true)
 });
 it('never creates two creatures from the same spell',async()=>{
  const x=setup();
  await x.api.create('spell-1');
  await x.api.create('spell-1');
  expect(x.writes.filter(w=>w.path.startsWith('combatants?select=id'))).toHaveLength(1);
  expect(x.api.html()).toContain('Redan skapad');
  expect(migration).toContain('combatants_summon_action_once_idx');
  expect(migration).toContain("source_instance_key like 'summon:%'")
 });
 it('dismisses only actual summoned Eldsalamanders and removes them from play',async()=>{
  const x=setup();
  await x.api.create('spell-1');
  await x.api.dismiss('new-summon-1');
  const patch=x.writes.find(w=>w.path.startsWith('combatants?id=eq.new-summon-1'));
  expect(patch.body.status).toBe('removed');
  expect(patch.body.state.summon_dismissed).toBe(true);
  expect(patch.body.state.in_reserve).toBe(false)
 });
 it('players cannot summon or dismiss from SL toolbox',async()=>{
  const x=setup({combatCanManage:()=>false});
  await x.api.create('spell-1');
  expect(x.writes).toHaveLength(0);
  expect(x.api.html()).toBe('');
 });
});
