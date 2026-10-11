import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function segment(a,b){
 const start=runtime.indexOf(a),end=runtime.indexOf(b,start);
 if(start<0||end<=start)throw Error('Missing magic section: '+a);
 return runtime.slice(start,end)
}
const multiplierCode=segment('function combatItemMagicMultiplier(', 'async function combatRecordItemMagicUse(');
describe('Magic-item combat uses normal Expert spell phases',()=>{
 it('quick spells cast in the same SR and normal spells require one preparation SR',()=>{
  const casting=segment('function combatMagicCastingRules(', 'function combatMagicBinding(');
  const env={combatMagicBinding:()=>({supported:true}),
   combatMagicRuleProfile:()=>({category:'manual'})};
  runInNewContext(casting+'this.rules=combatMagicCastingRules;',env);
  expect(env.rules({name:'ELD (F)',kvick:false},1)).toMatchObject({
   quick:false,resolve_round_offset:1,cl_modifier:0,psy_cost:1});
  expect(env.rules({name:'DISTRAKTION (K)',kvick:true},1)).toMatchObject({
   quick:true,resolve_round_offset:0,cl_modifier:0,psy_cost:1});
 });
 it('EG 1 ×4 deals four independently rolled hits but charges once and casts once',async()=>{
  const code=multiplierCode+'\n'+segment('async function combatResolveTestFireball(', 'async function rollCombatTestFireball(');
  const actor={id:'actor',name_snapshot:'Astrid'},target={id:'target',name_snapshot:'Orch'};
  const action={id:'magic-action',source_data:{
   spell_name:'ELD (F)',spell_fv:13,effect_grade:1,damage_text:'1T6 per EG',
   item_magic:{effect_multiplier:4,psy_source:'artifact',item_name:'Dödsbringaren'}}};
  const effects=[],logs=[],payments=[],rolls=[];
  const env={window:{},activeCombat:{id:'combat',round_number:2},centralCampaignId:'campaign',
   combatants:[actor,target],combatMagicTargetAllocations:()=>[],
   combatExpertRoll:async()=>{rolls.push(1);return {outcome:'success',success:true,roll:8}},
   combatSpellActualPsyCost:()=>0,combatShowOutcomeOverlay:()=>{},
   combatPayForSpell:async(...args)=>payments.push(args),
   combatAwardSpellErf:async()=>null,combatResolveBeskyddarePassage:async()=>({checks:[],blocked:false}),
   combatDeferForAntimagic:async()=>false,combatMagicDamageFormula:()=> '1T6',
   combatResolveDamage:async()=>{effects.push(1);return{total:2}},
   combatOutcomeLabel:()=> 'Lyckat',
   dbJson:async(path,opts)=>{logs.push({path,body:JSON.parse(opts.body)});return []}};
  runInNewContext(code+'this.cast=combatResolveTestFireball;',env);
  await env.cast(actor,target,action);
  expect(rolls).toHaveLength(1);
  expect(payments).toHaveLength(1);
  expect(effects).toHaveLength(4);
  const result=logs.find(row=>row.path.startsWith('combat_actions?')).body.result;
  expect(result.effect_grade).toBe(1);
  expect(result.target_results).toHaveLength(4);
  expect(Array.from(result.target_results,r=>r.repetition)).toEqual([1,2,3,4]);
  expect(logs.filter(row=>row.path==='combat_log')).toHaveLength(1);
 });
 it('does not silently truncate a huge multiplier',()=>{
  const env={};
  runInNewContext(multiplierCode+'this.count=combatItemMagicAutomatedCount;',env);
  expect(env.count({source_data:{item_magic:{effect_multiplier:4}}})).toBe(4);
  expect(()=>env.count({source_data:{item_magic:{effect_multiplier:25}}})).toThrow('högst 20');
 });
});
