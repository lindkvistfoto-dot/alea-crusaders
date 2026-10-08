import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const begin=src.indexOf('function combatMagicBinding('),end=src.indexOf('function combatSpellOptions(',begin);
if(begin<0||end<=begin)throw Error('Missing FALK binding functions');
const env={};
runInNewContext(src.slice(begin,end)+'this.api={combatMagicBinding,combatMagicDamageFormula,combatMagicPsyCost};',env);
const {combatMagicBinding:binding,combatMagicDamageFormula:formula,combatMagicPsyCost:psy}=env.api;

describe('FALK – explicit spell bindings, costs and safe combat dispatch',()=>{
 test('ELD, BLIXT, ENERGISTRÅLE and FROST are verified damaging spells',()=>{
  for(const name of ['ELD (F)','BLIXT (F, K)','ENERGISTRÅLE (F)','FROST (F)']){
   expect(binding({name,damage_text:'1T6 per EG'})).toMatchObject({kind:'damage',supported:true})
  }
 });
 test('damage formula correctly multiplies dice by assigned EG',()=>{
  expect(formula({damage_text:'1T6 per EG'},1)).toBe('1T6');
  expect(formula({damage_text:'1T6 per EG'},3)).toBe('3T6');
  expect(formula({damage_text:'2T8 per EG'},4)).toBe('8T8')
 });
 test('unknown or special poison damage is not silently replaced by one die',()=>{
  expect(binding({name:'GASMOLN (F)',damage_text:'Gift (special)',attack_magic:true}).supported).toBe(false);
  expect(formula({damage_text:'Gift (special)'},2)).toBeNull();
  expect(src).not.toContain("damage:action.source_data?.damage_text||'1T6'")
 });
 test('ritual marker takes priority even for otherwise known effects',()=>{
  expect(binding({name:'FROST (R)',ritual:true,damage_text:'1T6 per EG'})).toMatchObject({kind:'ritual',supported:false});
  expect(binding({name:'VÄDERKONTROLL (R)'}).kind).toBe('ritual')
 });
 test('unimplemented spells stay available as known entries but cannot cast',()=>{
  const x=binding({name:'FINNA VATTEN'});
  expect(x.supported).toBe(false);
  expect(x.kind).toBe('unimplemented')
 });
 test('FLYGA is a support effect with no involuntary resistance',()=>{
  expect(binding({name:'FLYGA'})).toMatchObject({kind:'status',code:'spell_flyga',requires_resistance:false})
 });
 test('sleep and paralysis target persisted incapacity definitions',()=>{
  expect(binding({name:'FÖRROLLAD SÖMN'}).code).toBe('condition_sleep');
  expect(binding({name:'PARALYSERING'}).code).toBe('condition_paralysis')
 });
 test('fear, panic, confusion and creature control target TIGER conditions',()=>{
  const cases={'RÄDSLA (K)':'condition_fear','PANIK':'condition_panic',
   'FÖRVIRRA':'condition_confusion','KONTROLLERA VARELSE':'condition_control'};
  for(const [name,code] of Object.entries(cases))
   expect(binding({name})).toMatchObject({code,kind:'status',requires_resistance:true})
 });
 test('successful and special casts spend full EG, perfect half rounded up',()=>{
  expect(psy('success',5)).toBe(5);expect(psy('special',3)).toBe(3);
  expect(psy('perfect',5)).toBe(3);expect(psy('perfect',4)).toBe(2)
 });
 test('failure and fumble spend exactly one PSY',()=>{
  for(const type of ['fail','fumble',null])expect(psy(type,7)).toBe(1)
 });
 test('status spells cannot resolve without saved adjudication, and resistance prevents effects',()=>{
  expect(src).toContain("!['resisted','affected'].includes(data.resistance_decision)");
  expect(src).toContain("combatSetMagicResistance(actorId,targetId,decision)");
  expect(src).toContain("if(rolled.success&&!resisted)");
  expect(src).toContain("resistance_target_id!==String(target.id)")
 });
 test('direct spells spend PSY and each target uses its own EG allocation',()=>{
  expect(src).toContain('await combatSpendMagicPsy(actor,result.psy_cost)');
  expect(src).toContain('combatMagicDamageFormula(action.source_data,allocation.eg)');
  expect(src).toContain('psy_cost:combatMagicPsyCost(outcome,eg)')
 });
 test('casting remains split across two SR unless tagged as quick',()=>{
  expect(src).toContain('ready_round:currentRound+(castRules.quick?0:1)');
  expect(src).toContain('Number(action.source_data?.ready_round)<=round');
  expect(src).toContain('resolve_round_offset:quick?0:1')
 });
 test('spell reference metadata is taken from the canonical register',()=>{
  expect(src).toContain('rule_id:rule.id,attack_magic:rule.attack_magic===true');
  expect(src).toContain("damage_text:rule.damage_text||''");
  expect(src).toContain('if(!binding.supported)errors.push')
 });
});
