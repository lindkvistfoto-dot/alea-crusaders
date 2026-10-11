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
  expect(binding({name:'GASMOLN (F)',damage_text:'Gift (special)',attack_magic:true})).toMatchObject({kind:'manual',supported:true});
  expect(formula({damage_text:'Gift (special)'},2)).toBeNull();
  expect(src).not.toContain("damage:action.source_data?.damage_text||'1T6'")
 });
 test('ritual marker takes priority even for otherwise known effects',()=>{
  expect(binding({name:'FROST (R)',ritual:true,damage_text:'1T6 per EG'})).toMatchObject({kind:'manual',supported:true,ritual:true});
  expect(binding({name:'VÄDERKONTROLL (R)'})).toMatchObject({kind:'manual',ritual:true})
 });
 test('unimplemented spell effects can cast but are explicitly delegated to SL',()=>{
  const x=binding({name:'FINNA VATTEN'});
  expect(x.supported).toBe(true);
  expect(x.kind).toBe('manual')
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
  expect(src).toContain('await combatPayForSpell(actor,result.psy_cost,action)');
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
 test('DIMMA uses HAJ persistent obscuring hex areas',()=>{
  expect(binding({name:'DIMMA'})).toMatchObject({kind:'area',code:'area_fog',supported:true});
  expect(src).toContain('async function combatCastAreaSpell(actor,action)');
  expect(src).toContain("await dbJson('combat_area_effects'");
  expect(src).toContain('combatSetMagicAreaCenter(');
  expect(src).toContain('combatSetMagicAreaRadius(');
 });
 test('spell reach scales SxN hexes by effect grade',()=>{
  expect(src).toContain('function combatSpellRangeHexes(actor,action)');
  expect(src).toContain('if(scaled)return eg*Number(scaled[1])');
  expect(src).toContain('combatAxialDistance(actor,center)>range');
 });
 test('spell damage never adds physical-strength SB',()=>{
  expect(src).toContain("weapon?._spell_damage?{qty:0,sides:0,modifier:0,formula:'Ingen'}");
  expect(src).toContain('_spell_damage:true');
 });
 test('area and status casts keep manually specified SR duration',()=>{
  expect(src).toContain('async function combatSetMagicDuration(actorId,delta)');
  expect(src).toContain('effect_duration_rounds:duration||null');
  expect(src).toContain('expires_round:data.magic_binding?.cube?null:Number.isSafeInteger(duration)&&duration>0?round+duration-1:null');
 });
 test('spell casts award Expert ERF through the existing once-per-rest rule engine',()=>{
  expect(src).toContain('async function combatAwardSpellErf(actor,action,outcome)');
  expect(src).toContain("awardCharacterErfItem(actor.source_id,'spells',itemKey,outcome,{amount})");
  expect(src).toContain('combatSpellErfTarget(actor,action)');
  expect(src).toContain("combatRollDice([{qty:1,sides:3}]");
  expect((src.match(/await combatAwardSpellErf\(actor,action,rolled.outcome\)/g)||[]).length).toBe(4);
 });
 test('area casting repeats range and blocked-sight validation immediately before the roll',()=>{
  const start=src.indexOf('async function combatCastAreaSpell('),end=src.indexOf('async function combatResolveTestFireball(',start);
  const area=src.slice(start,end);
  expect(area).toContain('combatFootprintDistance(actor,center)>combatSpellRangeHexes(actor,action)');
  expect(area).toContain('!combatHasLineOfSight(actor,center)');
  expect(area.indexOf('combatAxialDistance(actor,center)>combatSpellRangeHexes')).toBeLessThan(area.indexOf('await combatExpertRoll('));
 });

});
