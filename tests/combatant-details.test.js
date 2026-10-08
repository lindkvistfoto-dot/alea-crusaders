import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=code.indexOf('function combatantCard('),end=code.indexOf('function combatAttackTargetSummaryHtml(',start);
if(start<0||end<start)throw Error('Combatant details not found');
const isolated=code.slice(start,end);
function create({action=null,gm=true,effects=[],override={}}={}){
 const row={id:'hero1',name_snapshot:'Astrid Eldhjärta',source_type:'character',side:'heroes',q:2,r:1,status:'active',
  current_kp:18,max_kp:22,current_psy:8,max_psy:12,movement_remaining:6,movement_max:8,
  state:{attributes:{STY:13,SMI:14},initiative_rank:2,initiative_total:19,initiative_roll:5,smi:14},...override};
 const other={...row,id:'enemy1',name_snapshot:'Skelett',source_type:'monster',side:'enemies'};
 let selects=0,renders=0,focused=0;
 const ctx={
  combatants:[row,other],activeCombat:{id:'fight',round_number:3},combatActiveEffects:effects,
  combatSelectedTargetId:null,
  combatRowPortraitHtml:()=>'<span class="combat-row-portrait">AE</span>',
  combatTurnEquipmentHtml:()=>'<div>Svärd i höger hand</div>',
  combatAttackProfile:()=>({weapons:[{name:'Svärd'}],spells:[{name:'ELD'}],sty:13,smi:14}),
  combatantEffectsHtml:()=>'<div class="combat-effect-tags">Flyga · 2 SR</div>',
  combatEffectAttributeHtml:()=>'',combatSideLabel:()=> 'Hjältar',
  combatCanManage:()=>gm,combatIsFlying:()=>false,combatMentalStatusLabel:()=>'',combatIsMovementPlanning:()=>false,
  combatActiveActor:()=>row,combatChosenAction:()=>action,combatActionDefinition:()=>action?.action_type==='attack'?{type:'attack'}:{type:'spell'},
  combatNumber:(v,d=null)=>v==null?d:Number(v),combatMovementBudget:c=>c.movement_remaining,
  combatMovementMaximum:c=>c.movement_max,combatIsActiveTurn:()=>false,combatCurrentAttackTargets:()=>new Map(),
  combatEffectIsActive:e=>e.status==='active'&&(e.expires_round==null||e.expires_round>=3),
  escAttr:x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  selectCombatTarget:()=>{selects++},renderCombat:()=>{renders++},requestAnimationFrame:fn=>fn(),
  $:()=>({focus:()=>{focused++}}),
  document:{querySelectorAll:()=>[]}
 };
 runInNewContext(isolated+'\nthis.api={combatantCard,combatRowIsSelectingTarget,combatantRowClick,combatCloseCombatantDetails,combatantDetailsPopupHtml};',ctx);
 return {ctx,row,other,api:ctx.api,counters:()=>({selects,renders,focused})}
}
describe('Kombatantdetaljer – popup utan radträngsel',()=>{
 test('rad visar kort sammanfattning i stället för knappar för effekter',()=>{
  const t=create({effects:[{id:'1',combatant_id:'hero1',status:'active'}]});
  const html=t.api.combatantCard(t.row);
  expect(html).toContain('combatantRowClick(event,');
  expect(html).toContain('1 effekter');
  expect(html).toContain('onkeydown=');
  expect(html).not.toContain('Flyga · 2 SR');
  expect(html).not.toContain('combatRemoveEffect(');
 });
 test('normalt klick öppnar popup och uppdaterar markerat mål',()=>{
  const t=create();
  t.api.combatantRowClick({stopPropagation(){}},'hero1');
  expect(t.counters()).toEqual({selects:0,renders:1,focused:1});
  expect(t.ctx.combatSelectedTargetId).toBe('hero1');
  expect(t.api.combatantDetailsPopupHtml()).toContain('Astrid Eldhjärta');
 });
 test('attackmål väljs utan popup',()=>{
  const t=create({action:{status:'planned',action_type:'attack',source_data:{}}});
  t.api.combatantRowClick({stopPropagation(){}},'enemy1');
  expect(t.counters()).toEqual({selects:1,renders:0,focused:0});
  expect(t.api.combatantDetailsPopupHtml()).toBe('');
 });
 test.each(['damage','status'])('målval vid %s-magi öppnar inte popup',kind=>{
  const t=create({action:{status:'planned',source_data:{casting_spell:true,magic_binding:{kind}}}});
  t.api.combatantRowClick({stopPropagation(){}},'enemy1');
  expect(t.counters().selects).toBe(1);
  expect(t.counters().renders).toBe(0);
 });
 test('popup innehåller värden, utrustning och pågående effekter',()=>{
  const t=create({effects:[{id:'e1',status:'active',combatant_id:'hero1',expires_round:4}]});
  t.api.combatantRowClick({stopPropagation(){}},'hero1');
  const html=t.api.combatantDetailsPopupHtml();
  for(const content of ['role="dialog"','aria-modal="true"','18 / 22','8 / 12','Hex 2, 1','Flyga · 2 SR','Svärd','ELD','Grundegenskaper','Aktiva effekter'])
   expect(html).toContain(content);
 });
 test('dold kombatant visas inte för vanlig spelare',()=>{
  const t=create({gm:false,override:{source_type:'npc',visible_to_players:false}});
  t.api.combatantRowClick({stopPropagation(){}},'hero1');
  expect(t.counters().renders).toBe(0);
  expect(t.api.combatantDetailsPopupHtml()).toBe('');
 });
 test('popup kan stängas utan att påverka stridstillstånd',()=>{
  const t=create();t.api.combatantRowClick({stopPropagation(){}},'hero1');
  t.api.combatCloseCombatantDetails({stopPropagation(){}});
  expect(t.api.combatantDetailsPopupHtml()).toBe('');
  expect(t.counters().renders).toBe(2);
 });
 test('integrationen bevarar popupen vid omrendering och stödjer Escape',()=>{
  expect(code).toContain("'+combatantDetailsPopupHtml();");
  expect(code).toContain("event.key==='Escape'&&combatantDetailCombatantId");
  expect(code).toContain("combatantDetailCombatantId=null;");
 });
});
