import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the actual classic-script rule functions without loading the DOM,
// database connection, three-dimensional dice or unrelated UI modules.
const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function ruleSource(name,nextName){
 const start=source.indexOf('function '+name+'(');
 const end=source.indexOf('\nfunction '+nextName+'(',start);
 if(start<0||end<0)throw Error('Combat function boundary missing: '+name);
 return source.slice(start,end);
}
const rules={
 combatEffectiveSide:row=>row.side,
 combatMentalEffects:row=>(row.fearSources||[]).map(id=>({effect:{source_combatant_id:id}})),
 combatFootprintDistance:(actor,target)=>Math.abs(target.q-actor.q),
 combatHasLineOfSight:(_actor,target)=>target.lineOfSight!==false,
 combatAttackModeForTarget:()=> 'melee',
 combatIsFlying:()=>false,
 combatWeaponCategory:()=> 'melee',
 combatMeleeRangeHexes:()=>1,
 combatWeaponRangeHexes:()=>5
};
runInNewContext(
 ruleSource('combatCanTargetHostile','combatMentalMovementAllowed')+'\n'+
 ruleSource('combatAttackTargetInfo','combatPossibleAttackTargets')+'\n'+
 'this.canTarget=combatCanTargetHostile;this.attackInfo=combatAttackTargetInfo;',
 rules
);
const unit=(id,source_type,side,q=0)=>({id,source_type,side,q,r:0,status:'alive',visible_to_players:true});
const weapon={name:'Klor',category:'melee',damage:'1T6',fv:12};

describe('SLP targets in combat',()=>{
 it('lets a summoned elemental NPC attack another friendly-side NPC',()=>{
  const salamander=unit('salamander','npc','heroes');
  const undine=unit('undine','npc','heroes',1);
  expect(rules.canTarget(salamander,undine)).toBe(true);
  expect(rules.attackInfo(salamander,undine,weapon)).toMatchObject({mode:'melee',distance:1});
 });
 it('lets NPCs attack opponents and enemies even when on the same nominal side',()=>{
  const npc=unit('guard','npc','enemies');
  const rival=unit('rival','npc','enemies',1);
  const monster=unit('wolf','monster','enemies',1);
  const hero=unit('astrid','character','heroes',1);
  expect(rules.canTarget(npc,rival)).toBe(true);
  expect(rules.canTarget(npc,monster)).toBe(true);
  expect(rules.canTarget(npc,hero)).toBe(true);
 });
 it('preserves existing same-side restrictions for player and monster attackers',()=>{
  const hero=unit('astrid','character','heroes');
  const ally=unit('lyra','character','heroes',1);
  const monster=unit('wolf','monster','enemies');
  const otherMonster=unit('bear','monster','enemies',1);
  expect(rules.canTarget(hero,ally)).toBe(false);
  expect(rules.canTarget(monster,otherMonster)).toBe(false);
  expect(rules.canTarget(hero,monster)).toBe(true);
 });
 it('never allows the attacker to select itself, dead or hidden combatants',()=>{
  const npc=unit('undine','npc','heroes');
  const dead={...unit('fallen','npc','heroes',1),status:'dead'};
  const hidden={...unit('hidden','monster','enemies',1),visible_to_players:false};
  expect(rules.canTarget(npc,npc)).toBe(false);
  expect(rules.canTarget(npc,dead)).toBe(false);
  expect(rules.canTarget(npc,hidden)).toBe(false);
 });
 it('keeps fear restrictions, reach and line-of-sight checks',()=>{
  const npc={...unit('undine','npc','heroes'),fearSources:['source']};
  const feared=unit('source','npc','heroes',1);
  const outOfReach=unit('far','monster','enemies',2);
  const obscured={...unit('obscured','monster','enemies',1),lineOfSight:false};
  expect(rules.canTarget(npc,feared)).toBe(false);
  expect(rules.attackInfo(npc,outOfReach,weapon)).toBeNull();
  expect(rules.attackInfo(npc,obscured,weapon)).toBeNull();
 });
});
