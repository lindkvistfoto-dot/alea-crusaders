import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function portion(name,next){
 const a=source.indexOf('function '+name+'(');
 const b=source.indexOf('\nfunction '+next+'(',a);
 if(a<0||b<0)throw Error('Missing targeting function '+name);
 return source.slice(a,b);
}
function scenario(round){
 const caster={id:'eldra',source_type:'npc',side:'heroes',q:0,r:7,status:'active',visible_to_players:true,name_snapshot:'Eldra'};
 const ally={id:'nox',source_type:'npc',side:'heroes',q:3,r:5,status:'active',visible_to_players:true,name_snapshot:'Nox'};
 const action={status:'planned',source_data:{
  action_key:'spell_cast',casting_spell:true,spell_prepared:true,ready_round:2,
  spell_name:'ELD (F)',range_text:'Sx10 rutor',damage_text:'1T6 per EG',
  effect_grade:1,magic_binding:{kind:'damage'}
 }};
 let renders=0;
 const scope={
  activeCombat:{round_number:round,active_actor_id:'eldra'},
  combatants:[caster,ally],
  combatSelectedTargetId:null,
  combatMobileMagicTargetPickerOpen:false,
  combatActiveActor:()=>caster,
  combatChosenAction:()=>action,
  combatCannotAct:()=>false,
  combatIsActiveTurn:actor=>actor.id==='eldra',
  combatSpellRangeHexes:()=>10,
  combatFootprintDistance:(x,y)=>3,
  combatHasLineOfSight:()=>true,
  combatEffectiveSide:row=>row.side,
  combatCanTargetHostile:()=>false,
  combatCanManage:()=>true,
  combatSpellEffectTargets:()=>[],
  combatAxialDistance:()=>3,
  combatCloseRowActionMenu:()=>{},
  escAttr:x=>String(x),
  window:{matchMedia:()=>({matches:false})},
  renderCombat:()=>{renders++}
 };
 const pieces=[
  portion('combatFireballTargets','combatBeskyddareSideCells'),
  portion('combatMagicTargetIsReady','combatMagicTargetCandidates'),
  portion('combatMagicTargetCandidates','combatToggleMagicTargetPicker'),
  portion('combatToggleMagicTargetPicker','combatChooseMagicTarget'),
  portion('combatChooseMagicTarget','combatMagicTargetPickerHtml'),
  portion('combatMagicTargetPickerHtml','combatMagicStatusHtml')
 ];
 runInNewContext(pieces.join('\n')+
  '\nthis.api={targets:combatFireballTargets,ready:combatMagicTargetIsReady,candidates:combatMagicTargetCandidates,choose:combatChooseMagicTarget,html:combatMagicTargetPickerHtml};',scope);
 return{scope,action,caster,ally,get renders(){return renders}};
}
describe('Eld — SR1 preparation and SR2 targeting',()=>{
 it('keeps target selection locked during SR1 and states when it unlocks',()=>{
  const t=scenario(1);
  expect(t.scope.api.ready(t.caster,t.action)).toBe(false);
  expect(t.scope.api.candidates(t.caster,t.action).size).toBe(0);
  expect(t.scope.api.html(t.caster,t.action)).toBe('');
 });
 it('offers a valid same-side NPC target on the caster\'s SR2 turn',()=>{
  const t=scenario(2);
  expect(t.scope.api.ready(t.caster,t.action)).toBe(true);
  expect(t.scope.api.targets(t.caster,t.action).has('nox')).toBe(true);
  expect(t.scope.api.candidates(t.caster,t.action).has('nox')).toBe(true);
  // The picker now opens from the target portrait, rather than duplicating a hint below the frames.
  expect(t.scope.api.html(t.caster,t.action)).toBe('');
  t.scope.combatMobileMagicTargetPickerOpen=true;
  expect(t.scope.api.html(t.caster,t.action)).toContain('Nox');
 });
 it('selects and retains a valid spell target through the portrait picker',()=>{
  const t=scenario(2);
  t.scope.api.choose('nox');
  expect(t.scope.combatSelectedTargetId).toBe('nox');
  expect(t.renders).toBe(1);
 });
 it('rejects illegal self-targeting and does not overwrite the current selection',()=>{
  const t=scenario(2);
  t.scope.api.choose('eldra');
  expect(t.scope.combatSelectedTargetId).toBeNull();
  expect(t.renders).toBe(0);
 });
 it('keeps the picker closed until the caster takes their turn',()=>{
  const t=scenario(2);
  t.scope.combatIsActiveTurn=()=>false;
  expect(t.scope.api.ready(t.caster,t.action)).toBe(false);
  expect(t.scope.api.html(t.caster,t.action)).toContain('står på tur');
 });
});
