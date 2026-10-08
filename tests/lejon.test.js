import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function slice(start,end){
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a+start.length);
 if(a<0||b<a)throw Error('Missing LEJON code '+start+' -> '+end);
 return runtime.slice(a,b);
}
const code=[
 slice('function combatMagicCastingRules(', 'function combatSpellOptions('),
 slice('function combatSpellRangeHexes(', 'function combatCurrentAttackTargets('),
 slice('function combatEffectIsActive(', 'function combatEffectExpiry(')
].join('\n')+'\nthis.api={combatMagicCastingRules,combatMagicCastPreflight,combatMagicPsyCost,combatSpellRuleDurationRounds,combatSpellDurationRounds,combatMagicBinding,combatCastStatusSpell,combatCastAreaSpell,combatResolveTestFireball,combatEffectIsActive,combatSpellErfTarget,combatAwardSpellErf};';

function harness({outcome='success',sight=true,distance=1,psy=9}={}){
 const actor={id:'hero',name_snapshot:'Besvärjare',source_type:'npc',source_id:'npc1',q:0,r:0,current_psy:psy};
 const target={id:'target',name_snapshot:'Fienden',q:1,r:0,status:'active'};
 const calls=[],damage=[];
 const ctx={
  activeCombat:{id:'fight',round_number:5},centralCampaignId:'camp',
  combatants:[actor,target],combatActiveEffects:[],
  combatEffectRegistry:[
   {id:'ctrl',code:'condition_control',active:true,default_duration_rounds:null,expiration_condition:'manual'},
   {id:'fog',code:'area_fog',active:true,default_duration_rounds:null,expiration_condition:'manual'}
  ],
  combatRuntimeHexCells:()=>[{q:0,r:0,key:'0,0'},{q:1,r:0,key:'1,0'}],
  combatAxialDistance:()=>distance,combatHasLineOfSight:()=>sight,
  combatWeaponRangeHexes:()=>20,combatCanTargetHostile:()=>true,
  combatCannotAct:()=>false,combatMagicRuleProfile:()=>({}),
  combatExpertRoll:async()=>({outcome,success:['success','special','perfect'].includes(outcome),roll:9,confirmation_roll:null}),
  combatRollDice:async()=>({rolls:[{value:2}]}),
  combatResolveDamage:async(_a,victim,weapon,full)=>{damage.push({target:victim.id,formula:weapon.damage,full,spell:weapon._spell_damage});return {total:full?6:3}},
  combatShowOutcomeOverlay:()=>{},combatOutcomeLabel:outcome=>String(outcome),combatLoadEffects:async()=>{},loadActiveCombat:async()=>{},
  combatEffectExpiry:()=>({expires_round:null,expires_at:null}),
  dbJson:async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null;
   calls.push({url,method:options.method,body});
   if(url.startsWith('combatants?'))return [{id:actor.id,current_psy:body.current_psy}];
   return []
  }
 };
 runInNewContext(code,ctx);
 return {actor,target,api:ctx.api,calls,damage}
}
const statusAction=(overrides={})=>({id:'status-action',source_data:{
 spell_name:'KONTROLLERA VARELSE',magic_binding:{kind:'status',code:'condition_control',requires_resistance:true},
 effect_grade:3,spell_fv:14,duration_text:'Sx1 SR',range_text:'Sx10 rutor',
 resistance_target_id:'target',resistance_decision:'affected',...overrides
}});
const areaAction=(overrides={})=>({id:'area-action',source_data:{
 spell_name:'DIMMA',magic_binding:{kind:'area',code:'area_fog',supported:true},
 effect_grade:2,spell_fv:12,duration_text:'S/4 timmar',range_text:'Sx10 rutor',
 area_center:{q:1,r:0},area_radius:0,...overrides
}});
const magicWrites=(calls,table)=>calls.filter(x=>x.url===table||x.url.startsWith(table+'?'));

describe('LEJON – behavior-tested Expert magic across real cast flows',()=>{
 test('Expert preflight checks FV, EG, school cap, PSY and unsupported spells',()=>{
  const {actor,api}=harness({psy:3});
  const spell={name:'BLIXT (F, K)',damage_text:'1T6 per EG',fv:10,school_fv:3};
  expect(api.combatMagicCastPreflight(actor,spell,2).valid).toBe(true);
  expect(api.combatMagicCastPreflight(actor,spell,4).valid).toBe(false);
  expect(api.combatMagicCastPreflight(actor,{...spell,school_fv:10},4).errors).toContain('Otillräcklig PSY');
  expect(api.combatMagicCastPreflight(actor,{name:'FINNA VATTEN',fv:10},1).valid).toBe(false);
  expect(api.combatMagicCastPreflight(actor,{name:'VÄDERKONTROLL (R)',fv:10,ritual:true},1).valid).toBe(false);
 });
 test('K spells resolve in the same SR; normal spells are prepared for the next SR',()=>{
  const {api}=harness();
  expect(api.combatMagicCastingRules({name:'BLIXT (F, K)'},2)).toMatchObject({quick:true,resolve_round_offset:0,cl_modifier:-2});
  expect(api.combatMagicCastingRules({name:'DIMMA'},2)).toMatchObject({quick:false,resolve_round_offset:1});
  expect(runtime).toContain('ready_round:currentRound+(castRules.quick?0:1)');
 });
 test('Sx1 SR uses EG; manually assigned SR overrides automatic duration',()=>{
  const {api}=harness();
  expect(api.combatSpellRuleDurationRounds(statusAction().source_data?statusAction():{})).toBe(3);
  expect(api.combatSpellDurationRounds(statusAction({effect_duration_rounds:5}))).toBe(5);
  expect(api.combatSpellDurationRounds(areaAction())).toBeNull();
  expect(api.combatSpellDurationRounds(areaAction({effect_duration_rounds:4}))).toBe(4);
  expect(runtime).toContain("duration_text:spell.duration_text||''");
 });
 test('resisted status spell spends PSY but never persists a condition',async()=>{
  const x=harness(),action=statusAction({resistance_decision:'resisted'});
  await x.api.combatCastStatusSpell(x.actor,x.target,action);
  expect(x.actor.current_psy).toBe(6);
  expect(magicWrites(x.calls,'combatant_effects')).toHaveLength(0);
  expect(magicWrites(x.calls,'combat_actions')[0].body.result.resisted).toBe(true);
 });
 test('successful condition control persists for exactly EG SR',async()=>{
  const x=harness(),action=statusAction();
  await x.api.combatCastStatusSpell(x.actor,x.target,action);
  const effect=magicWrites(x.calls,'combatant_effects')[0].body;
  expect(effect).toMatchObject({combatant_id:'target',applied_round:5,expires_round:7,strength:3});
  expect(x.api.combatEffectIsActive({status:'active',applied_round:5,expires_round:7},7)).toBe(true);
  expect(x.api.combatEffectIsActive({status:'active',applied_round:5,expires_round:7},8)).toBe(false);
  expect(x.actor.current_psy).toBe(6);
 });
 test.each([['fail',1],['fumble',1],['perfect',2]])('%s status costs %i PSY',async(outcome,cost)=>{
  const x=harness({outcome}),action=statusAction();
  await x.api.combatCastStatusSpell(x.actor,x.target,action);
  expect(x.actor.current_psy).toBe(9-cost);
  expect(magicWrites(x.calls,'combatant_effects').length).toBe(outcome==='perfect'?1:0);
 });
 test('DIMMA persists a saved map area and manual duration in SR',async()=>{
  const x=harness(),action=areaAction({effect_duration_rounds:4,area_radius:0});
  await x.api.combatCastAreaSpell(x.actor,action);
  expect(magicWrites(x.calls,'combat_area_effects')[0].body).toMatchObject({center_q:1,center_r:0,radius:0,expires_round:8});
  expect(x.actor.current_psy).toBe(7);
 });
 test('DIMMA without converted duration remains SL-controlled, not real-time expiry',async()=>{
  const x=harness(),action=areaAction();
  await x.api.combatCastAreaSpell(x.actor,action);
  expect(magicWrites(x.calls,'combat_area_effects')[0].body.expires_round).toBeNull();
 });
 test('area outside range or through wall is rejected before roll and PSY spending',async()=>{
  for(const conditions of [{distance:21},{sight:false}]){
   const x=harness(conditions);
   await expect(x.api.combatCastAreaSpell(x.actor,areaAction())).rejects.toThrow();
   expect(magicWrites(x.calls,'combatants')).toHaveLength(0);
   expect(magicWrites(x.calls,'combat_area_effects')).toHaveLength(0);
  }
 });
 test('failed area cast costs one PSY and makes no fog area',async()=>{
  const x=harness({outcome:'fail'});
  await x.api.combatCastAreaSpell(x.actor,areaAction());
  expect(x.actor.current_psy).toBe(8);
  expect(magicWrites(x.calls,'combat_area_effects')).toHaveLength(0);
 });
 test('allocated lightning strike deals EG-scaled spell damage without weapon SB',async()=>{
  const x=harness({outcome:'special'}),action={id:'direct',source_data:{
   spell_name:'BLIXT (F, K)',effect_grade:3,spell_fv:14,damage_text:'1T6 per EG',
   target_allocations:[{target_id:'target',eg:2},{target_id:'hero',eg:1}]
  }};
  await x.api.combatResolveTestFireball(x.actor,x.target,action);
  expect(x.damage).toEqual([
   {target:'target',formula:'2T6',full:true,spell:true},
   {target:'hero',formula:'1T6',full:true,spell:true}
  ]);
  expect(x.actor.current_psy).toBe(6);
  const result=magicWrites(x.calls,'combat_actions')[0].body.result;
  expect(result.target_results).toHaveLength(2);
 });
 test('direct spell failure spends only one PSY, damages no targets',async()=>{
  const x=harness({outcome:'fail'}),action={id:'direct',source_data:{spell_name:'ELD (F)',effect_grade:4,spell_fv:12,damage_text:'1T6 per EG'}};
  await x.api.combatResolveTestFireball(x.actor,x.target,action);
  expect(x.actor.current_psy).toBe(8);
  expect(x.damage).toHaveLength(0);
 });
});
