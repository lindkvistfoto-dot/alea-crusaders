import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function extract(from,to){
 const start=runtime.indexOf(from),end=runtime.indexOf(to,start);
 if(start<0||end<=start)throw new Error('Missing runtime section '+from);
 return runtime.slice(start,end);
}
function harness(definitions=[],effects=[],round=3){
 const byId=new Map(definitions.map(d=>[d.id,d]));
 const context={
  activeCombat:{round_number:round},
  combatEffectRegistry:definitions,
  combatActiveEffects:effects,
  combatEffectDefinition:row=>byId.get(row.effect_id),
  combatEffectIsActive:(row,r=round)=>row.status==='active'&&row.applied_round<=r&&(row.expires_round==null||r<=row.expires_round),
  combatHasUnusedAction:()=>true,
  combatParryOptions:()=>[{key:'shield'}],
 };
 runInNewContext(extract('function combatRestrictionFlags(','function combatEffectAttributeDelta(')+
  extract('function combatCanParryAttack(','async function combatExpertRoll(')+
  'this.api={combatRestrictionFlags,combatIncapacitation,combatCannotAct,combatCannotMove,combatCannotReact,combatMustSkipTurn,combatCanParryAttack};',context);
 return context.api;
}
const unit=(type,extra={})=>({id:'effect-1',active:true,modifiers:{type,...extra}});
const row=(overrides={})=>({effect_id:'effect-1',combatant_id:'hero',status:'active',applied_round:3,expires_round:null,...overrides});
const hero={id:'hero'};

describe('BJÖRN: executable condition guards',()=>{
 test.each(['sleep','paralysis','unconscious'])('%s blocks acting, moving, reacting and parrying',(state)=>{
  const api=harness([unit('incapacitated',{state})],[row()]);
  expect(api.combatIncapacitation(hero)?.state).toBe(state);
  expect(api.combatCannotAct(hero)).toBe(true);
  expect(api.combatCannotMove(hero)).toBe(true);
  expect(api.combatCannotReact(hero)).toBe(true);
  expect(api.combatCanParryAttack(hero)).toBe(false);
 });
 test('STÅ ÖVER lasts the configured SR and does not automatically prevent reactions',()=>{
  const def=unit('skip_turns',{disable_actions:true,disable_movement:true});
  const active=row({expires_round:4});
  const during=harness([def],[active],3);
  expect(during.combatMustSkipTurn(hero)).toBe(true);
  expect(during.combatCanParryAttack(hero)).toBe(true);
  const after=harness([def],[active],5);
  expect(after.combatMustSkipTurn(hero)).toBe(false);
  expect(after.combatCanParryAttack(hero)).toBe(true);
 });
 test('action restriction and movement restriction remain independent',()=>{
  const act=harness([unit('custom',{disable_actions:true})],[row()]);
  expect(act.combatCannotAct(hero)).toBe(true);
  expect(act.combatCannotMove(hero)).toBe(false);
  const move=harness([unit('custom',{disable_movement:true})],[row()]);
  expect(move.combatCannotAct(hero)).toBe(false);
  expect(move.combatCannotMove(hero)).toBe(true);
 });
 test('inactive effects, other combatants and removed effects do not constrain',()=>{
  const api=harness([unit('incapacitated')],[row({status:'removed'}),row({combatant_id:'other'})]);
  expect(api.combatMustSkipTurn(hero)).toBe(false);
  expect(api.combatCanParryAttack(hero)).toBe(true);
 });
 test('duration and condition termination remain separately defined',()=>{
  const context={};runInNewContext(extract('function combatEffectExpiry(','async function combatExpireElapsedEffects(')+
   'this.calc=combatEffectExpiry',context);
  expect(context.calc({duration_unit:'round',modifiers:{type:'skip_turns'}},3,2).expires_round).toBe(4);
  expect(runtime).toContain("def.expiration_condition!==condition");
  expect(runtime).toContain("status:'expired'");
  expect(runtime).toContain("status:'removed'");
 });
 test('direct execution paths recheck restrictions, not only disabled buttons',()=>{
  expect(runtime).toContain("if(!actor||!target||!action||combatCannotAct(actor)||def?.type!=='attack'");
  expect(runtime).toContain("if(!actor||!target||combatCannotAct(actor)||action?.source_data?.casting_spell!==true");
  expect(runtime).toContain("if(combatCannotAct(actor))throw new Error(");
  expect(runtime).toContain("!combatCannotMove(combatant)&&combatMovementBudget(combatant)>0");
  expect(runtime).toContain("combatCannotAct(combatant)||action.status!=='planned'");
  expect(runtime).toContain("def.stacking==='refresh'");
 });
});
