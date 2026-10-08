import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261008093000_tiger_mental_conditions.sql',import.meta.url),'utf8');
const from=src.indexOf('function combatMentalEffects('),to=src.indexOf('const COMBAT_EFFECT_ATTRIBUTES=',from);
const a=src.indexOf('function combatRestrictionFlags('),b=src.indexOf('function combatEffectAttributeDelta(',a);
if(from<0||to<=from||a<0||b<=a)throw Error('Missing TIGER runtime functions');
const hero={id:'hero',q:2,r:0,side:'heroes',status:'active',visible_to_players:true};
const enemy={id:'enemy',q:0,r:0,side:'enemies',status:'active',visible_to_players:true};
const ally={id:'ally',q:3,r:0,side:'heroes',status:'active',visible_to_players:true};
const defs=[
 {id:'fear',active:true,modifiers:{type:'fear'}},
 {id:'panic',active:true,modifiers:{type:'panic',disable_actions:true,disable_reactions:true}},
 {id:'confusion',active:true,modifiers:{type:'confusion',disable_actions:true,disable_reactions:true}},
 {id:'control',active:true,modifiers:{type:'control'}}
];
const row=(type,target='hero',source='enemy',extra={})=>({effect_id:type,combatant_id:target,source_combatant_id:source,status:'active',applied_round:2,expires_round:null,...extra});
function setup(effects=[],round=2,registry=defs){
 const context={
  activeCombat:{round_number:round},combatants:[hero,enemy,ally],combatActiveEffects:effects,combatEffectRegistry:registry,
  combatEffectDefinition:r=>registry.find(d=>d.id===r.effect_id),
  combatEffectIsActive:(r,n=round)=>r.status==='active'&&r.applied_round<=n&&(r.expires_round==null||n<=r.expires_round),
  combatAxialDistance:(a,b)=>{const q=a.q-b.q,r=a.r-b.r;return (Math.abs(q)+Math.abs(r)+Math.abs(q+r))/2}
 };
 runInNewContext(src.slice(from,to)+'\n'+src.slice(a,b)+
 '\nthis.api={combatMentalEffects,combatMentalSource,combatControlSource,combatEffectiveSide,combatCanTargetHostile,combatMentalMovementAllowed,combatMentalStatusLabel,combatCannotAct,combatCannotMove,combatCannotReact};',context);
 return context.api
}
describe('TIGER mental conditions',()=>{
 test('fear bars moving closer to and attacking source while retreat remains possible',()=>{
  const x=setup([row('fear')]);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(false);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:3,r:0})).toBe(true);
  expect(x.combatCanTargetHostile(hero,enemy)).toBe(false);
  expect(x.combatCannotAct(hero)).toBe(false)
 });
 test('panic requires retreat and blocks actions and reactions but leaves movement available',()=>{
  const x=setup([row('panic')]);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(false);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:2,r:-1})).toBe(false);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:3,r:0})).toBe(true);
  expect(x.combatCannotAct(hero)).toBe(true);
  expect(x.combatCannotReact(hero)).toBe(true);
  expect(x.combatCannotMove(hero)).toBe(false)
 });
 test('confusion blocks actions and parry without preventing movement',()=>{
  const x=setup([row('confusion','hero',null)]);
  expect(x.combatCannotAct(hero)).toBe(true);
  expect(x.combatCannotReact(hero)).toBe(true);
  expect(x.combatCannotMove(hero)).toBe(false);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(true)
 });
 test('control uses temporary controller side in both attack directions',()=>{
  const x=setup([row('control')]);
  expect(x.combatControlSource(hero)?.id).toBe('enemy');
  expect(x.combatEffectiveSide(hero)).toBe('enemies');
  expect(x.combatCanTargetHostile(hero,enemy)).toBe(false);
  expect(x.combatCanTargetHostile(hero,ally)).toBe(true);
  expect(x.combatCanTargetHostile(ally,hero)).toBe(true);
  expect(hero.side).toBe('heroes')
 });
 test('expired or removed control and fear have no effect',()=>{
  const x=setup([row('control','hero','enemy',{expires_round:2}),row('fear','hero','enemy',{expires_round:2})],3);
  expect(x.combatEffectiveSide(hero)).toBe('heroes');
  expect(x.combatCanTargetHostile(hero,enemy)).toBe(true);
  expect(x.combatMentalStatusLabel(hero)).toBe('')
 });
 test('inactive definitions cannot alter the outcome',()=>{
  const altered=defs.map(d=>d.id==='fear'?{...d,active:false}:d);
  const x=setup([row('fear')],2,altered);
  expect(x.combatCanTargetHostile(hero,enemy)).toBe(true);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(true)
 });
 test('source references require a live combatant before restricting movement',()=>{
  const x=setup([row('fear','hero','missing')]);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(true)
 });
 test('multiple opposing mental sources both constrain the chosen route',()=>{
  const x=setup([row('fear'),row('panic','hero','ally')]);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:1,r:0})).toBe(false);
  expect(x.combatMentalMovementAllowed(hero,{q:2,r:0},{q:3,r:0})).toBe(false)
 });
 test('cyclic control terminates and keeps base factions intact',()=>{
  const x=setup([row('control'),row('control','enemy','hero')]);
  expect(['heroes','enemies']).toContain(x.combatEffectiveSide(hero));
  expect(hero.side).toBe('heroes');expect(enemy.side).toBe('enemies')
 });
 test('roster text describes fear and active controller',()=>{
  const x=setup([row('fear'),row('control')]);
  expect(x.combatMentalStatusLabel(hero)).toContain('källa');
  expect(x.combatMentalStatusLabel(hero)).toContain('styrd av')
 });
 test('target and movement integrations use state engine',()=>{
  expect(src).toContain('if(!combatCanTargetHostile(actor,target))return null;');
  expect(src).toContain('if(!combatCanTargetHostile(actor,target))continue;');
  expect(src).toContain('if(!combatMentalMovementAllowed(combatant,{q,r},{q:nq,r:nr}))continue;');
  expect(src).toContain('source_combatant_id:needsSource?sourceId:null')
 });
 test('GM can configure a source and SR duration, seeded statuses have no invented spell resistance',()=>{
  expect(src).toContain("combatEffectRounds");
  expect(src).toContain("combatEffectSource");
  expect(src).toContain("durationRaw?{expires_round:round+Number(durationRaw)-1");
  for(const name of ['condition_fear','condition_panic','condition_confusion','condition_control'])expect(migration).toContain("'"+name+"'");
  expect(migration).toContain("'manual'")
 });
});
