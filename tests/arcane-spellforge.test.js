import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const snapshot=JSON.parse(readFileSync(new URL('./fixtures/arcane-spell-registry.snapshot.json',import.meta.url),'utf8'));
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');

function portion(name,next){
 const a=runtime.indexOf('function '+name+'(');
 const b=runtime.indexOf(next,a);
 if(a<0||b<0)throw Error('Missing runtime function '+name);
 return runtime.slice(a,b);
}
const effectProfileSource=runtime.slice(runtime.indexOf('const COMBAT_SPELL_EFFECTS='),runtime.indexOf('\n// Reusable summon profiles'));
const magicFunctions=[
 portion('combatSpellEffectProfile','\n// Reusable summon profiles'),
 portion('combatIsSummoningSpell','\nfunction combatMagicRuleProfile'),
 portion('combatMagicRuleProfile','\n// Expert Magiboken'),
 portion('combatMagicCastingRules','\nfunction combatMagicCastPreflight'),
 portion('combatMagicCastPreflight','\n// Casting mechanics'),
 portion('combatMagicBinding','\nfunction combatMagicDamageFormula'),
 portion('combatMagicDamageFormula','\n\n/* FALK:'),
 portion('combatMagicPsyCost','\nfunction combatSpellActualPsyCost'),
 portion('combatSpendMagicPsy','\nfunction combatItemSpellSources')
];
const scope={activeCombat:{id:'isolated-combat'},dbJson:async(_path,options)=>[{current_psy:JSON.parse(options.body).current_psy}]};
runInNewContext(effectProfileSource+'\n'+magicFunctions.join('\n')+
 '\nthis.api={profile:combatSpellEffectProfile,rule:combatMagicRuleProfile,'+
 'casting:combatMagicCastingRules,preflight:combatMagicCastPreflight,'+
 'binding:combatMagicBinding,damage:combatMagicDamageFormula,summon:combatIsSummoningSpell,'+
 'psyCost:combatMagicPsyCost,payPsy:combatSpendMagicPsy};',scope);
const api=scope.api;

describe('Arcane Spellforge — isolated registry and casting simulations',()=>{
 it('uses a frozen read-only snapshot of all registered spell rows',()=>{
  expect(snapshot.source).toContain('public.rule_spells');
  expect(snapshot.read_only).toBe(true);
  expect(snapshot.spells).toHaveLength(snapshot.spell_count);
  expect(new Set(snapshot.spells.map(row=>row.spell_key)).size).toBe(snapshot.spell_count);
  expect(snapshot.spells.every(row=>row.id&&row.name&&row.school_id&&row.target_type)).toBe(true);
 });

 it('records current completeness gaps as an auditable snapshot baseline',()=>{
  const blank=field=>snapshot.spells.filter(row=>!String(row[field]||'').trim()).length;
  expect(blank('target_text')).toBe(84);
  expect(blank('effect_per_eg')).toBe(88);
  expect(blank('resistance_text')).toBe(90);
 });

 it.each(snapshot.spells)('$spell_key — profile and cast preflight',spell=>{
  const registered={...spell,fv:100,school_fv:100};
  const profile=api.profile(registered),rule=api.rule(registered);
  expect(['direct','indirect','support','summon','none']).toContain(profile.category);
  expect(rule.range_text).toBe(spell.range_text);
  expect(rule.duration_text).toBe(spell.duration_text);

  const pass=api.preflight({current_psy:100},registered,1);
  expect(pass.valid).toBe(true);
  expect(pass.psy_cost).toBe(1);

  const noPsy=api.preflight({current_psy:0},registered,1);
  expect(noPsy.valid).toBe(false);
  expect(noPsy.errors).toContain('Otillräcklig PSY');

  const invalidGrade=api.preflight({current_psy:100},registered,0);
  expect(invalidGrade.valid).toBe(false);
  expect(invalidGrade.errors).toContain('Ogiltig effektgrad');
 });

 it('charges 1 PSY for an ordinary failed spell',()=>{
  expect(api.psyCost('fail',3)).toBe(1);
 });

 it('rounds perfect spell cost in the magician\'s favor, with minimum 1',()=>{
  expect(api.psyCost('perfect',3)).toBe(1);
  expect(api.psyCost('perfect',5)).toBe(2);
  expect(api.psyCost('perfect',1)).toBe(1);
 });

 it('marks a magician dead after spending the last PSY point (Expert p. 5)',async()=>{
  const mage={id:'isolated-mage',current_psy:1,status:'active'};
  await api.payPsy(mage,1);
  expect(mage.current_psy).toBe(0);
  expect(mage.status).toBe('dead');
 });

 it('charges the full successful PSY cost after a fumbled spell',()=>{
  expect(api.psyCost('fumble',3)).toBe(3);
 });

 it('scales PSY, casting penalty, and normal versus quick resolution deterministically',()=>{
  const normal=api.casting({name:'ELD'},3),quick=api.casting({name:'BLIXT (F, K)'},3);
  expect(normal).toMatchObject({effect_grade:3,psy_cost:3,cl_modifier:-4,casting_rounds:1,quick:false,resolve_round_offset:1});
  expect(quick).toMatchObject({effect_grade:3,psy_cost:3,cl_modifier:-4,casting_rounds:1,quick:true,resolve_round_offset:0});
 });

 it('enforces the declared maximum school grade and rejects missing spell skill',()=>{
  const spell={name:'ELD',fv:25,school_fv:2};
  expect(api.preflight({current_psy:2},spell,2).valid).toBe(true);
  expect(api.preflight({current_psy:2},spell,3).errors).toContain('EG överstiger FV i magiskolan');
  expect(api.preflight({current_psy:2},{...spell,fv:null},1).errors).toContain('Besvärjelsen saknar giltigt FV');
 });

 it('expands explicit damage per EG without applying damage to any combatant',()=>{
  expect(api.damage({damage_text:'1T6 per EG'},1)).toBe('1T6');
  expect(api.damage({damage_text:'1T6 per EG'},4)).toBe('4T6');
  expect(api.damage({damage_text:'Gift (special)'},2)).toBeNull();
  expect(api.damage({damage_text:'Special'},2)).toBeNull();
 });

 it('keeps HELA manual pending-healing and antimagic as explicit effect bindings',()=>{
  expect(api.binding({name:'HELA'})).toMatchObject({kind:'heal',supported:true,manual_amount:true});
  expect(api.binding({name:'ANTIMAGI'})).toMatchObject({kind:'manual',supported:true});
  expect(api.binding({name:'BESKYDDARE'})).toMatchObject({kind:'area',cube:true});
 });

 it('does not invent a numeric effect for a spell without an explicit combat binding',()=>{
  const unknown=snapshot.spells.find(row=>!['HELA','BESKYDDARE','ÖKA','MINSKA','DIMMA','ELD (F)','ELD','BLIXT (F, K)','BLIXT','ENERGISTRÅLE (F)','ENERGISTRÅLE','FROST (F)','FROST'].includes(row.name));
  expect(unknown).toBeTruthy();
  expect(api.binding(unknown).kind).toBe('manual');
  expect(api.binding(unknown).supported).toBe(true);
 });
});
