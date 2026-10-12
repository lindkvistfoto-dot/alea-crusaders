import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const uiCss=read('features/combat/spell-chooser.css');
const chooserSource=runtime.slice(runtime.indexOf('function combatSpellChooserHtml('),runtime.indexOf('async function combatMagicButton('));
function render(options,spell_key){
 const scope={
  combatSpellOptions:()=>options,
  combatSpellKey:x=>x.rule_id,
  combatMagicBinding:()=>({kind:'manual',reason:'SL avgör effekten',supported:true}),
  escAttr:x=>String(x??'')
 };
 runInNewContext(chooserSource+'\nthis.show=combatSpellChooserHtml;',scope);
 return scope.show({id:'caster'}, {source_data:{spell_key,effect_grade:2}});
}
describe('Magi i strid – mobilvänligt besvärjelseval',()=>{
 it('is a flow panel after actions and before equipment, never an anchored dropdown over map',()=>{
  const start=runtime.indexOf('function combatTurnPanelHtml(');
  const end=runtime.indexOf('// KROKODIL: strongest matching ward',start);
  expect(start).toBeGreaterThan(0);
  const block=runtime.slice(start,end);
  expect(block).toContain('class="combat-turn-magic-host"');
  expect(block).toContain("combatRowMagicMenuHtml(actor)+'</div>':'')+");
  expect(block.indexOf('combat-turn-magic-host')).toBeGreaterThan(block.indexOf("'<div class=\"combat-turn-actions\">'"));
  expect(block.indexOf('combat-turn-magic-host')).toBeLessThan(block.indexOf("'<div class=\"combat-turn-stats\">'"));
  const toolbar=block.slice(block.indexOf('magic-tool'),block.indexOf('action-tool',block.indexOf('magic-tool')));
  expect(toolbar).not.toContain('combatRowMagicMenuHtml(actor)');
 });
 it('uses scrollable, compact cards and keeps underlying combat content visible',()=>{
  expect(uiCss).toContain('position:static');
  expect(uiCss).toContain('transform:none');
  expect(uiCss).toContain('.combat-spell-catalog{');
  expect(uiCss).toContain('overflow-y:auto');
  expect(uiCss).toContain('grid-template-columns:1fr');
  expect(uiCss).toContain('max-height:min(30dvh,260px)');
  expect(read('index.html')).toContain('features/combat/spell-chooser.css?v=0.35.132');
 });
 it('shows selected spell and effect grade before the scrollable list',()=>{
  const html=render([{name:'ELD (F)',rule_id:'eld',fv:10,range_text:'Sx10 rutor'}],'eld');
  expect(html).toContain('Välj besvärjelse');
  expect(html).toContain('VALD BESVÄRJELSE');
  expect(html).toContain('ELD (F)');
  expect(html).toContain('Effektgrad');
  expect(html.indexOf('combat-spell-effect')).toBeLessThan(html.indexOf('combat-spell-catalog'));
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain('FV 10');
  expect(html).toContain('Sx10 rutor');
  expect(html).not.toContain('<span>Förbered besvärjelse</span>');
 });
 it('keeps effect buttons disabled until a spell is chosen',()=>{
  const html=render([{name:'ELD (F)',rule_id:'eld',fv:10}],'');
  expect(html).toContain('aria-label="Minska effektgrad"');
  expect(html).toContain('aria-label="Öka effektgrad"');
  expect(html).toMatch(/onclick="stepCombatSpellEffect\([^"]+\)" disabled/g);
  expect(html).toContain('aria-pressed="false"');
 });
 it('keeps casting mechanics unchanged and shows a close action',()=>{
  const menu=runtime.slice(runtime.indexOf('function combatRowMagicMenuHtml('),runtime.indexOf('function combatActionChooserHtml('));
  expect(menu).toContain('role="region"');
  expect(menu).toContain('combatCloseMagicChooser()');
  expect(menu).toContain('combatMagicTargetChooserHtml(combatant,action)');
  expect(runtime).toContain('combatMagicCastPreflight(combatant,spell,grade)');
  expect(runtime).toContain('const currentRound=Number(activeCombat?.round_number)||1;');
  expect(runtime).toContain('ready_round:currentRound+(castRules.quick?0:1)');
  expect(runtime).toContain("body.querySelector('.combat-spell-catalog')?.scrollTop||0");
 });
});
