import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
function section(start,end){
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a);
 if(a<0||b<a)throw new Error('Spell renderer missing: '+start);
 return runtime.slice(a,b);
}
const htmlHeader=section('function combatMagicHeaderHtml(','function combatMagicTargetIsReady(');
const centerSource=section('function combatDuelCenterHtml(','// Spell feedback is presentation-only');
const panel=section('function combatSpellCastPanelHtml(){','/* Compact reaction renderer');
const actor={id:'lyra',name_snapshot:'Lyra Gråväv'};
const foe={id:'enemy',name_snapshot:'Skelett'};
const spellData={
 spell_prepared:true,spell_name:'ELD',effect_grade:2,casting_spell:true,
 magic_casting:{quick:false},magic_binding:{kind:'damage'},ready_round:2
};
const esc=x=>String(x);
function header(target=null,preparing=true,kind='damage',overrides={}){
 const ctx={
  window:{matchMedia:()=>({matches:false})},escAttr:esc,
  combatSpellArtPath:path=>path||'',
  combatSpellArtNumber:(n,fallback)=>n??fallback,
  combatMiniParticipantHtml:(label,unit)=>'<div data-unit="'+label+'">'+unit.name_snapshot+'</div>'
 };
 runInNewContext(centerSource+'\n'+htmlHeader+'\nthis.header=combatMagicHeaderHtml;',ctx);
 return ctx.header(actor,target,{...spellData,...overrides,magic_binding:{kind}},false,null,preparing);
}
function render(round,{quick=false,casting=true}={}){
 const data={...spellData,casting_spell:casting,magic_casting:{quick},ready_round:quick?1:2};
 const action={id:'spell',combatant_id:'lyra',status:'planned',source_data:data};
 const ctx={
  activeCombat:{round_number:round},combatants:[actor,foe],combatSelectedTargetId:'enemy',
  combatActiveActor:()=>actor,combatChosenAction:()=>action,combatActionDefinition:()=>({key:'spell_cast'}),
  combatSpellArtworkForAction:()=>({path:'',x:50,y:50,zoom:100}),
  combatSpellArtPath:path=>path||'',combatMagicTargetIsReady:()=>true,
  combatMagicHeaderHtml:(_a,target,_data,_can,_art,preparing)=>
   '<div data-phase="'+(preparing?'preparation':'casting')+'" data-target="'+(target?.id||'none')+'"></div>',
  combatMagicTargetPickerHtml:()=>'<div data-target-picker></div>',
  combatMagicStatusHtml:label=>'<span>'+label+'</span>',
  combatMagicConfirmHtml:()=>'<button data-magic-confirm></button>',
  combatSpellResultHtml:()=>'',combatLatestResolvedSpellAction:()=>null,escAttr:esc
 };
 runInNewContext(panel+'\nthis.renderSpell=combatSpellCastPanelHtml;',ctx);
 return ctx.renderSpell();
}
describe('Besvärjelser: mål först i kast-SR',()=>{
 it('visar en förberedelseruta i stället för mål under SR1',()=>{
  const html=header(foe,true);
  expect(html).toContain('combat-magic-preparation');
  expect(html).toContain('>FÖRBERED <small>· 2:a SR</small></span>');
  expect(html).not.toContain('<span>Förbereder</span>');
  expect(html).toContain('combat-magic-spell-heading');
  expect(html).toContain('>2</strong><small>EG</small>');
  expect(html).toContain('combat-magic-duel combat-illustrated-duel is-preparing');
  expect(html).toContain('FÖRBERED <small>· 2:a SR</small>');
  expect(html).toContain('preparation-hourglass-1sr.webp');
  expect(html).not.toContain('combat-preparation-round');
  expect(html).not.toContain('combat-preparation-art');
  expect(html).not.toContain('KP ');
  expect(html).not.toContain('data-unit="MÅL"');
  expect(html).not.toContain('>MÅL<');
 });
 it('visar kommande rundas nummer i ramen och EG som en cirkel',()=>{
  const html=header(null,true);
  expect(html).toContain('FÖRBERED <small>· 2:a SR</small>');
  expect(html).toContain('preparation-hourglass-1sr.webp');
  expect(html).not.toContain('combat-preparation-round');
  expect(html).toContain('aria-label="2 effektgrader"');
  expect(html).toContain('combat-magic-spell-heading');
 });
 it('låter adminbilden vara kvar och placerar dynamisk besvärjelse, EG och SR över ramen',()=>{
  const html=header(null,true,'damage',{spell_name:'ELD (F)',effect_grade:5,ready_round:7});
  expect(html).toContain('FÖRBERED <small>· 7:e SR</small>');
  expect(html).toContain('combat-magic-spell-heading');
  expect(html).toContain('<span class="combat-magic-spell-heading-name">Eld</span>');
  expect(html).toContain('>5</strong><small>EG</small>');
  expect(html).not.toContain('combat-preparation-caption');
  expect(html).not.toContain('>BESVÄRJELSE</span>');
  expect(html).toContain('combat-duel-center is-spell');
 });
 it('döljer dubbla status- och instruktionsrader i förberedelseläget, inte kastläget',()=>{
  const preparation=render(1);
  expect(preparation).not.toContain('combat-magic-status');
  expect(preparation).not.toContain('combat-mini-instruction');
  expect(preparation).toContain('data-magic-confirm');
  const casting=render(2);
  expect(casting).toContain('data-magic-confirm');
  expect(casting).toContain('data-target-picker');
 });
 it('visar riktigt mål i SR2',()=>{
  const html=header(foe,false);
  expect(html).toContain('data-unit="MÅL"');
  expect(html).not.toContain('combat-magic-preparation');
 });
 it('SR1 visar varken mål eller målval för icke-kvick',()=>{
  const html=render(1);
  expect(html).toContain('data-phase="preparation"');
  expect(html).toContain('data-target="none"');
  expect(html).not.toContain('data-target-picker');
 });
 it('SR2 visar målval när besvärjelsen är klar',()=>{
  const html=render(2);
  expect(html).toContain('data-phase="casting"');
  expect(html).toContain('data-target="enemy"');
  expect(html).toContain('data-target-picker');
 });
 it('kvick besvärjelse väljer mål redan i SR1',()=>{
  const html=render(1,{quick:true});
  expect(html).toContain('data-phase="casting"');
  expect(html).toContain('data-target-picker');
 });
 it('även en ännu inte aktiverad vanlig besvärjelse visar förberedelse',()=>{
  expect(render(1,{casting:false})).toContain('data-phase="preparation"');
 });
});
