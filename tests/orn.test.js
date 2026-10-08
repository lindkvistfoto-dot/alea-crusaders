import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const combat=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const admin=readFileSync(new URL('../features/combat/admin-scenes.js',import.meta.url),'utf8');

const flight={id:'flight',code:'spell_flyga',active:true,modifiers:{
 type:'flight',ignore_terrain:true,ignore_obscuring_intermediate:true
}};
const versionedEffect={combatant_id:'hero',effect_id:'flight',status:'active',strength:1};
const actor={id:'hero',q:0,r:0,flying:false,movement_remaining:3,movement_max:3};
const target={id:'enemy',q:2,r:0};
const hex=(q,r,movement_mode='free',sight_mode='clear',notes='')=>({q,r,key:q+','+r,movement_mode,sight_mode,notes});
const paths=(intermediate=hex(1,0))=>[hex(0,0),intermediate,hex(2,0)];
function harness({cells=paths(),effects=[],defs=[flight],character=actor}={}){
 const context={
  combatRuntimeHexCells:()=>cells,combatActiveEffects:effects,combatEffectRegistry:defs,
  combatEffectDefinition:effect=>defs.find(d=>d.id===effect.effect_id),
  combatEffectIsActive:effect=>effect.status==='active',
  combatNumber:(v,fallback=null)=>v==null||v===''?fallback:Number(v),
  combatCannotMove:()=>false,combatMentalMovementAllowed:()=>true,combatMovementAllowance:character=>character.movement_remaining,
  combatHexNeighbors:(q,r)=>[[q+1,r],[q-1,r]],activeCombat:{phase:'movement'}
 };
 const start=combat.indexOf('function combatAxialDistance('),stop=combat.indexOf('function combatAttackProfile(',start);
 const moveStart=combat.indexOf('function combatReachableHexes('),moveEnd=combat.indexOf('async function combatRecordFullMoveAction(',moveStart);
 if(start<0||stop<start||moveStart<0||moveEnd<moveStart)throw Error('Missing ÖRN runtime slice');
 runInNewContext(combat.slice(start,stop)+'\n'+combat.slice(moveStart,moveEnd)+
  '\nthis.rules={combatIsFlying,combatFlightCapabilities,combatTerrainIsWall,combatHasLineOfSight,combatReachableHexes,combatIgnoresSightObstacle};',context);
 return context.rules
}
describe('ÖRN flight movement, visibility and solid walls',()=>{
 test('explicit walls and masonry are recognized independently of movement and sight fields',()=>{
  const rules=harness();
  for(const name of ['wall','north wall','vägg','mur','vägg,stone','north;mur','east|wall']){
   expect(rules.combatTerrainIsWall({notes:name})).toBe(true);
  }
  for(const name of ['','forest','small','sval','stone'])expect(rules.combatTerrainIsWall({notes:name})).toBe(false);
 });
 test('ordinary LOS through open terrain is allowed',()=>{
  expect(harness().combatHasLineOfSight(actor,target)).toBe(true);
 });
 test('ground-level LOS is stopped by obscuring and fully blocked intermediate hexes',()=>{
  for(const mode of ['obscuring','blocked']){
   expect(harness({cells:paths(hex(1,0,'free',mode))}).combatHasLineOfSight(actor,target)).toBe(false)
  }
 });
 test('flight sees beyond non-wall obscuring and sight-blocked terrain',()=>{
  for(const mode of ['obscuring','blocked']){
   const r=harness({cells:paths(hex(1,0,'blocked',mode)),effects:[versionedEffect]});
   expect(r.combatIsFlying(actor)).toBe(true);
   expect(r.combatHasLineOfSight(actor,target)).toBe(true);
  }
 });
 test('wall never allows vision, even for flying combatants and even with clear sight tag',()=>{
  for(const sight of ['clear','obscuring','blocked']){
   const r=harness({cells:paths(hex(1,0,'free',sight,'wall')),effects:[versionedEffect]});
   expect(r.combatHasLineOfSight(actor,target)).toBe(false)
  }
 });
 test('inactive or expired spell effect does not grant flight',()=>{
  const inactive=harness({effects:[versionedEffect],defs:[{...flight,active:false}]});
  expect(inactive.combatIsFlying(actor)).toBe(false);
  const expired=harness({effects:[{...versionedEffect,status:'removed'}]});
  expect(expired.combatIsFlying(actor)).toBe(false)
 });
 test('innate flight handles terrain without persisted spell effect',()=>{
  const flying={...actor,flying:true};
  const r=harness({character:flying,cells:paths(hex(1,0,'blocked','obscuring'))});
  expect(r.combatHasLineOfSight(flying,target)).toBe(true);
  expect(r.combatReachableHexes(flying).has('2,0')).toBe(true)
 });
 test('flight effect can independently forbid terrain bypass while remaining airborne',()=>{
  const altered={...flight,modifiers:{type:'flight',ignore_terrain:false,ignore_obscuring_intermediate:true}};
  const r=harness({effects:[versionedEffect],defs:[altered],cells:paths(hex(1,0,'blocked','obscuring'))});
  expect(r.combatIsFlying(actor)).toBe(true);
  expect(r.combatHasLineOfSight(actor,target)).toBe(true);
  expect(r.combatReachableHexes(actor).has('2,0')).toBe(false)
 });
 test('ground cannot move through blocked terrain, flight can',()=>{
  const cells=paths(hex(1,0,'blocked'));
  expect(harness({cells}).combatReachableHexes(actor).has('2,0')).toBe(false);
  expect(harness({cells,effects:[versionedEffect]}).combatReachableHexes(actor).get('2,0')).toBe(2);
 });
 test('wall blocks flight movement even if movement mode is free',()=>{
  const cells=paths(hex(1,0,'free','clear','wall'));
  expect(harness({cells}).combatReachableHexes(actor).has('2,0')).toBe(false);
  expect(harness({cells,effects:[versionedEffect]}).combatReachableHexes(actor).has('2,0')).toBe(false)
 });
 test('ground suffers difficult terrain cost, flying does not',()=>{
  const cells=paths(hex(1,0,'difficult'));
  expect(harness({cells}).combatReachableHexes(actor).get('1,0')).toBe(2);
  expect(harness({cells,effects:[versionedEffect]}).combatReachableHexes(actor).get('1,0')).toBe(1)
 });
 test('vision properties for fog and darkness are independent, flight stays separate',()=>{
  const darkness={id:'dark',active:true,modifiers:{type:'vision',see_through_darkness:true}};
  const x={combatant_id:'hero',effect_id:'dark',status:'active'};
  expect(harness({cells:paths(hex(1,0,'free','obscuring','mörker')),effects:[x],defs:[darkness]}).combatHasLineOfSight(actor,target)).toBe(true);
  expect(harness({cells:paths(hex(1,0,'free','obscuring','dimma')),effects:[x],defs:[darkness]}).combatHasLineOfSight(actor,target)).toBe(false);
  const fog={id:'fog',active:true,modifiers:{type:'vision',see_through_fog:true}};
  expect(harness({cells:paths(hex(1,0,'free','obscuring','fog')),effects:[{...x,effect_id:'fog'}],defs:[fog]}).combatHasLineOfSight(actor,target)).toBe(true)
 });
 test('movement, attack and spell target selection share LOS and flight flags',()=>{
  expect(combat).toContain('if(mode===\'melee\'&&(combatIsFlying(actor)||combatIsFlying(target)))return null;');
  expect(combat).toContain('combatAxialDistance(actor,target)<=(touch?1:maxRange)&&combatHasLineOfSight(actor,target)');
  expect(combat).toContain('distance<=range&&combatHasLineOfSight(actor,target)');
  expect(combat).toContain('distance<1||!combatHasLineOfSight(actor,target)');
 });
 test('editor offers a permanent wall marker and persists it as notes',()=>{
  expect(admin).toContain('▥ Vägg / mur');
  expect(admin).toContain("notes:st.terrainWall?'wall':''");
  expect(admin).toContain("notes:t.notes");
  expect(admin).toContain("h.sight_mode!=='clear'||h.notes");
  expect(combat).toContain("if(combatTerrainIsWall(cell))return false");
 });
});
