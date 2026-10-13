import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../features/combat/attack-participants.css',import.meta.url),'utf8');
function part(a,b){const start=rt.indexOf(a),end=rt.indexOf(b,start);if(start<0||end<0)throw Error('Missing panel: '+a);return rt.slice(start,end)}
const actor={id:'lyra',name_snapshot:'Lyra Gråväv'};
const move=part('function combatMovementPanelHtml(){','function combatAttackPanelHtml(){');
const magic=part('function combatMagicConfirmHtml(','function combatSpellCastPanelHtml(){');
function moveUi(cost=0){
 const ctx={
  combatMovementPlan:{combatantId:'lyra',q:2,r:3,cost},
  combatMovementPlanningActor:()=>actor,
  combatMovementAllowance:()=>5,
  combatActiveActor:()=>actor,
  combatChosenAction:()=>null,
  combatActionDefinition:()=>null,
  combatActionMenuId:'lyra',combatActionMenuKind:'other',
  combatIsMovementPlanning:()=>false,
  escAttr:String,renderCombat:()=>{}
 };
 runInNewContext(move+'\nthis.moveUi=combatMovementPanelHtml;this.otherUi=combatOtherPanelHtml;',ctx);
 return ctx.moveUi();
}
function castUi({casting=true,round=2,readyRound=2,kind='damage',selected='',quick=false}={}){
 const data={magic_binding:{kind},magic_casting:{quick},area_center:{q:2,r:3}};
 const action={status:'planned',source_data:data};
 const ctx={
  combatSelectedTargetId:selected,combatIsActiveTurn:()=>true,escAttr:String,
  combatMagicTargetCandidates:()=>new Map([['enemy',{}]])
 };
 runInNewContext(magic+'\nthis.cast=combatMagicConfirmHtml;',ctx);
 return ctx.cast(actor,action,casting,readyRound,round);
}
describe('Kompakta handlingspaneler under Runda',()=>{
 it('erbjuder att bekräfta vald förflyttning men inte nollsteg',()=>{
  expect(moveUi()).toContain('Förflyttning');
  expect(moveUi()).toContain('Välj destination på kartan');
  expect(moveUi()).toMatch(/combat-confirm-movement[^>]*disabled/);
  expect(moveUi(3)).toContain('Hex 2, 3 · 3 steg');
  expect(moveUi(3)).toContain('Bekräfta förflyttning');
  expect(moveUi(3)).not.toMatch(/combat-confirm-movement[^>]*disabled/);
 });
 it('annan handling öppnar en egen enkel panel',()=>{
  const ctx={
   combatActiveActor:()=>actor,combatChosenAction:()=>null,
   combatActionDefinition:()=>null,combatActionMenuId:'lyra',combatActionMenuKind:'other',
   combatIsMovementPlanning:()=>false,escAttr:String
  };
  runInNewContext(move+'\nthis.other=combatOtherPanelHtml;',ctx);
  const html=ctx.other();
  expect(html).toContain('combat-other-panel');
  expect(html).toContain('Välj annan handling');
  expect(html).toContain("chooseCombatPrimaryAction('lyra','other')");
 });
 it('bekräftelse av magi är aktiv först när ett giltigt mål är valt',()=>{
  expect(castUi()).toMatch(/combat-confirm-magic[^>]*disabled/);
  expect(castUi({selected:'enemy'})).toContain('✦ Bekräfta kast');
  expect(castUi({selected:'enemy'})).not.toMatch(/combat-confirm-magic[^>]*disabled/);
  expect(castUi({selected:'enemy',round:1})).toMatch(/combat-confirm-magic[^>]*disabled/);
 });
 it('förberedelse och kvicka besvärjelser behåller ett tydligt eget första steg',()=>{
  expect(castUi({casting:false})).toContain('Förbered besvärjelse');
  expect(castUi({casting:false,quick:true})).toContain('Starta kvick besvärjelse');
 });
 it('attack bekräftas från samma panel utan rubriken ANFALL',()=>{
  const attack=part('function combatAttackPanelHtml(){','function combatTurnPortraitHtml(');
  expect(attack).toContain('combat-confirm-attack');
  expect(attack).toContain('combatAttackButton(event,');
  expect(attack).not.toContain('<span>ANFALL</span>');
  expect(attack).not.toContain('combat-mobile-attack-execute');
  expect(style).toContain('.combat-action-confirm');
 });
 it('porträtt visar namn utan extra KP-rad',()=>{
  const participants=part('function combatMiniParticipantHtml(','/* v0.35.173');
  expect(participants).not.toContain('<small class="combat-duelist-meta">KP ');
  expect(participants).toContain('combat-portrait-target-button');
 });
 it('alla paneler monteras under den gemensamma rundpanelen',()=>{
  expect(rt).toContain("combatTurnPanelHtml()+'<div id=\"combatActionPanel\">'+combatAttackPanelHtml()");
  expect(rt).toContain('combat-movement-panel');
  expect(rt).toContain('combat-other-panel');
  expect(rt).toContain('combat-magic-select-panel');
 });
});
