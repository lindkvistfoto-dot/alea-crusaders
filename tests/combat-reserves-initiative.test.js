import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const initiative=source.slice(source.indexOf('function combatIsOnBattlefield('),source.indexOf('function combatInitiativeDiceMap('));
const turn=source.slice(source.indexOf('function combatTurnOrderIds('),source.indexOf('function combatCanEndTurn('));
const combatant=(id,options={})=>({id,name_snapshot:id,q:0,r:0,sort_order:0,status:'active',visible_to_players:true,
 source_instance_key:'character:'+id+':1',state:{smi:12},...options});
function setup(rows){
 const env={combatants:rows,activeCombat:{initiative:{status:'resolved',order:[]}},
  COMBAT_INITIATIVE_COLORS:['red','blue','gold'],combatRollD10:()=>5,
  combatNumber:(value,fallback=null)=>value==null?fallback:Number(value),
  combatEffectiveAttribute:(row,key)=>row.state?.smi,
  Map,Date,Number,Math,String};
 runInNewContext(initiative+turn+'\nthis.api={deployed:combatIsOnBattlefield,eligible:combatInitiativeEligible,entries:combatInitiativeEntries,build:combatBuildInitiative,turns:combatTurnOrderIds};',env);
 return env;
}
describe('Reserves do not participate in combat rounds v0.35.29',()=>{
 it('initiative only rolls for deployed active combatants; origin hex 0,0 is valid',()=>{
  const on=combatant('on'),reserve=combatant('reserve',{state:{smi:18,in_reserve:true}}),
   removed=combatant('removed',{status:'removed'}),dead=combatant('dead',{status:'dead'}),
   noCoords=combatant('unplaced',{q:null}),hidden=combatant('hidden',{visible_to_players:false});
  const env=setup([on,reserve,removed,dead,noCoords,hidden]);
  expect(env.api.deployed(on)).toBe(true);
  for(const row of [reserve,removed,dead,noCoords])expect(env.api.deployed(row)).toBe(false);
  expect(Array.from(env.api.entries(env.combatants),x=>x.combatant_id)).toEqual(['on']);
 });
 it('initiative ignores active-status reserves and removes old initiative data',()=>{
  const on=combatant('on',{state:{smi:10}}),reserve=combatant('reserve',{state:{smi:20,in_reserve:true,initiative_rank:1,initiative_roll:9,initiative_total:29}});
  const env=setup([reserve,on]);
  const output=env.api.build(env.combatants,new Map([['on',4],['reserve',10]]));
  expect(Array.from(output.order)).toEqual(['on']);
  expect(output.results).toHaveLength(1);
  expect(on.state.initiative_rank).toBe(1);
  for(const k of ['initiative_rank','initiative_roll','initiative_total'])expect(reserve.state[k]).toBeUndefined();
 });
 it('new reinforcements placed after initiative are only eligible next SR',()=>{
  const a=combatant('a',{state:{smi:12,initiative_rank:1}}),
   b=combatant('b',{state:{smi:12,initiative_rank:2}}),
   reserve=combatant('reserve',{state:{smi:10,in_reserve:true}});
  const env=setup([a,b,reserve]);
  env.activeCombat.initiative={status:'resolved',order:['reserve','a','b']};
  expect(Array.from(env.api.turns())).toEqual(['a','b']);
  reserve.state.in_reserve=false;
  expect(Array.from(env.api.turns())).toEqual(['a','b']);
  a.status='dead';b.status='dead';
  expect(Array.from(env.api.turns())).toEqual([]);
  reserve.state.initiative_rank=1; // next SR initiative has now been rolled
  env.activeCombat.initiative={status:'resolved',order:['reserve']};
  expect(Array.from(env.api.turns())).toEqual(['reserve']);
 });
 it('setup Play, reset, new-round movement and active actor exclude reserves',()=>{
  expect(source).toContain('combatants.some(combatInitiativeEligible)');
  expect(source).toContain('filter(combatInitiativeEligible).map(row=>dbJson(');
  expect(source).toContain('const entries=(combatants||[]).filter(combatInitiativeEligible).map');
  expect(source).toContain('if(!combatInitiativeEligible(row))return;');
  expect(source).toContain('combatIsOnBattlefield(row)&&String(row.id)');
  expect(source).toContain("delete state.initiative_rank");
  expect(source).toContain("let displayedCombatants=combatants.filter(c=>c.state?.in_reserve!==true&&c.status!=='removed')");
 });
});
