import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../features/combat/duel-frames.css',import.meta.url),'utf8');
const layoutCss=readFileSync(new URL('../features/combat/attack-participants.css',import.meta.url),'utf8');
const start=rt.indexOf('function combatPrimaryHandWeapon(');
const end=rt.indexOf('function combatMeleeReachHexesForWeapon(',start);
if(start<0||end<start)throw Error('Primary hand combat helpers missing');
const helpers=rt.slice(start,end);
const right={equipId:'right-weapon',name:'Kastspjut',image_path:'right.png'};
const left={equipId:'left-weapon',name:'Kortsvärd',image_path:'left.png'};
const actor={id:'actor',state:{attributes:{}}};
function setup({ambidextrous=true,mainHand='right',sourceData={}}={}){
 const equipment={
  mainHand,
  rightHand:{kind:'weapon',itemId:'right-weapon'},
  leftHand:{kind:'weapon',itemId:'left-weapon'}
 };
 const profile={currentEquipment:equipment,weapons:[left,right],ambidextrous};
 const action={status:'planned',source_data:sourceData};
 const calls=[];
 const ctx={
  combatAttackProfile:()=>profile,
  combatAttackWeaponOptions:()=>[left,right],
  combatWeaponKey:weapon=>String(weapon?.equipId||weapon?.name||''),
  combatants:[actor],combatChosenAction:()=>action,
  combatActionDefinition:()=>({type:'attack',mode:'auto'}),
  combatCanChoosePrimaryAction:()=>true,
  chooseCombatAttackWeapon:async(id,key)=>calls.push([id,key])
 };
 runInNewContext(helpers+'\nthis.primary=combatPrimaryHandWeapon;this.weapon=combatActionWeapon;this.hands=combatAmbidextrousDuelWeapons;this.cycle=combatCycleDuelWeapon;',ctx);
 return {ctx,action,calls,profile}
}
const escapeHtml=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function center({switchable=true,spell=false,quadrant='top-right'}={}){
 const begin=rt.indexOf('function combatDuelCenterHtml(');
 const finish=rt.indexOf('// Spell feedback is presentation-only',begin);
 const src=rt.slice(begin,finish);
 const action={status:'planned',source_data:{}};
 const ctx={
  escAttr:escapeHtml,window:{aleaEquipmentArt:{src:path=>path}},
  ruleWeaponForItem:()=>null,
  combatActionDefinition:()=>({type:'attack',mode:'auto'}),
  combatAmbidextrousDuelWeapons:()=>switchable?[right,left]:[],
  combatWeaponKey:weapon=>weapon?.equipId||''
 };
 runInNewContext(src+'\nthis.center=combatDuelCenterHtml;',ctx);
 return ctx.center(spell?'spell':'weapon',spell?'Eld':'Kastspjut',spell?null:{...right,combat_crop_quadrant:quadrant},actor,action)
}
describe('Huvudhand och stort attackvapen',()=>{
 it('väljer utrustad huvudhand som standard även med två vapen',()=>{
  const {ctx,action}=setup();
  expect(ctx.primary(actor).equipId).toBe('right-weapon');
  expect(ctx.weapon(actor,action).equipId).toBe('right-weapon');
  const leftDominant=setup({mainHand:'left'});
  expect(leftDominant.ctx.weapon(actor,leftDominant.action).equipId).toBe('left-weapon');
 });
 it('respekterar ett uttryckligt valt vapen över huvudhandens standard',()=>{
  const {ctx,action}=setup({sourceData:{weapon_key:'left-weapon'}});
  expect(ctx.weapon(actor,action).equipId).toBe('left-weapon');
 });
 it('byter från huvudhand till andra handen endast för ambidextriösa',async()=>{
  const {ctx,calls}=setup();
  expect(ctx.hands(actor,{status:'planned'})).toHaveLength(2);
  await ctx.cycle('actor');
  expect(calls).toEqual([['actor','left-weapon']]);
  const other=setup({ambidextrous:false});
  expect(other.ctx.hands(actor,other.action)).toHaveLength(0);
  await other.ctx.cycle('actor');
  expect(other.calls).toHaveLength(0);
 });
 it('renderar klickbart vapen utan VAPEN-rubrik',()=>{
  const html=center();
  expect(html).toContain('combat-weapon-switch');
  expect(html).toContain('combatCycleDuelWeapon(&quot;actor&quot;)');
  expect(html).toContain('combat-weapon-switch-mark');
  expect(html).toContain('src="right.png"');
  expect(html).not.toContain('>VAPEN</span>');
  const normal=center({switchable:false});
  expect(normal).not.toContain('combat-weapon-switch-mark');
  expect(normal).toContain('<div class="combat-duel-center is-weapon"');
 });
 it('håller magirubrik och magirutans ordinarie geometri orörda',()=>{
  expect(center({spell:true,switchable:false})).toContain('>BESVÄRJELSE</span>');
  expect(css).toContain('.combat-duel-center.is-weapon .combat-duel-weapon-art');
  expect(css).toContain('top:-41%;left:56%;width:125%');
  expect(css).toContain('width:200%!important;height:200%!important');
  expect(css).toContain('overflow:visible');
 });
 it('mobilens extra action-wrapper sorteras efter Runda',()=>{
  expect(rt).toContain("combatTurnPanelHtml()+'<div id=\"combatActionPanel\">'+combatAttackPanelHtml()");
  expect(layoutCss).toContain('.combat-left-column > #combatActionPanel > *');
  expect(layoutCss).toContain('order:2;width:100%;min-width:0');
  expect(layoutCss).toContain('.combat-left-column > .combat-turn-panel');
  expect(layoutCss).toContain('order:1;width:100%');
  expect(layoutCss).toContain('@media(max-width:1023px)');
 });
 it('visar vald registerkvadrant som stor beskuren vapenbild, inte helbild',()=>{
  for(const quadrant of ['top-right','top-left','bottom-left','bottom-right','full']){
   expect(center({quadrant})).toContain('data-combat-crop="'+quadrant+'"');
  }
  expect(css).toContain('aspect-ratio:1 / 1');
  expect(css).toContain('overflow:hidden;pointer-events:none');
  expect(css).toContain('clip-path:inset(0 0 15.4% 0)');
  expect(css).toContain('clip-path:inset(0 0 12.5% 0)');
  expect(css).toContain('.combat-duel-center.is-weapon .combat-duel-center-viewport::before');
  expect(css).toContain('clip-path:inset(89% 0 0 0)');
  for(const quadrant of ['top-left','bottom-right','bottom-left','full']){
   expect(css).toContain('[data-combat-crop="'+quadrant+'"] .combat-duel-weapon-art img');
  }
  expect(css).toContain('top:-40%;left:57%;width:120%;height:auto');
 });

});
