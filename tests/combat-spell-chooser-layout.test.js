import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const runtime=read('features/combat/runtime.js');
const uiCss=read('features/combat/spell-chooser.css');
const chooserSource=runtime.slice(runtime.indexOf('function combatSpellArtPath('),runtime.indexOf('async function combatMagicButton('));
function render(options,spell_key=''){
 const scope={
  combatSpellOptions:()=>options,
  combatSpellKey:x=>x.item_spell?.key||x.rule_id,
  combatMagicBinding:()=>({kind:'damage',supported:true}),
  escAttr:x=>String(x??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
 };
 runInNewContext(chooserSource+'\nthis.show=combatSpellChooserHtml;',scope);
 return scope.show({id:'caster'}, {source_data:{spell_key,effect_grade:2}});
}
function optionLabels(html){
 return [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)]
  .filter(match=>match[1]).map(match=>match[2]);
}

describe('Magi i strid – kompakt besvärjelseval',()=>{
 it('opens its own panel below Runda without expanding the round panel',()=>{
  const start=runtime.indexOf('function combatTurnPanelHtml(');
  const end=runtime.indexOf('// KROKODIL: strongest matching ward',start);
  const block=runtime.slice(start,end);
  const actionPanel=runtime.slice(runtime.indexOf('function combatAttackPanelHtml('),
    runtime.indexOf('function combatTurnPortraitHtml('));
  expect(start).toBeGreaterThan(0);
  expect(block).not.toContain('combat-turn-magic-host');
  expect(block).toContain('aria-controls="combatActionPanel"');
  expect(actionPanel).toContain('combat-magic-select-panel');
  expect(actionPanel).toContain('combatSpellChooserHtml(actor,action)');
  expect(read('features/combat/attack-participants.css')).toContain('.combat-magic-select-panel');
  expect(read('index.html')).toContain('features/combat/spell-chooser.css?v=');
 });
 it('renders one alphabetically sorted single-row dropdown, not a grid of cards',()=>{
  const spells=[
   {name:'Öka',rule_id:'oka',fv:12},
   {name:'Frost',rule_id:'frost',fv:13},
   {name:'Åska',rule_id:'aska',fv:11},
   {name:'Eld',rule_id:'eld',fv:15},
   {name:'Ändra',rule_id:'andra',fv:9},
  ];
  const html=render(spells,'frost');
  expect(html).toContain('<select aria-label="Välj besvärjelse"');
  expect(html).toContain('onchange="selectCombatPreparedSpell(');
  expect(optionLabels(html)).toEqual(['Eld','Frost','Åska','Ändra','Öka']);
  expect(html).toContain('<option value="frost" selected>');
  expect(html).not.toContain('combat-spell-catalog');
  expect(html).not.toContain('combat-weapon-choice-grid');
  expect(html).not.toContain('VALD BESVÄRJELSE');
  expect(uiCss).toContain('.combat-spell-choice--compact');
  expect(uiCss).toContain('text-overflow:ellipsis');
 });
 it('remains compact with all 91 test spells',()=>{
  const spells=Array.from({length:91},(_,i)=>({name:'Besvärjelse '+String(91-i).padStart(2,'0'),rule_id:String(i)}));
  const html=render(spells);
  expect(optionLabels(html)).toHaveLength(91);
  expect(optionLabels(html)[0]).toBe('Besvärjelse 01');
  expect(optionLabels(html)[90]).toBe('Besvärjelse 91');
  expect(html.match(/<select/g)).toHaveLength(1);
 });
 it('shows only the chosen spell details and effect grade below the selector',()=>{
  const html=render([{name:'ELD (F)',rule_id:'eld',fv:10,range_text:'Sx10 rutor'}],'eld');
  expect(html).toContain('FV 10 · Sx10 rutor');
  expect(html).toContain('<span>Effektgrad</span>');
  expect(html).toContain('aria-label="Minska effektgrad"');
  expect(html).toContain('aria-label="Öka effektgrad"');
  expect(html).toContain('>2</b>');
  expect(html).not.toContain('Föremålsbesvärjelser använder');
 });
 it('keeps effect buttons disabled until a spell is chosen',()=>{
  const html=render([{name:'Eld',rule_id:'eld',fv:10}]);
  expect(html).toContain('<option value="" selected disabled>');
  expect(html).toMatch(/aria-label="Minska effektgrad"[^>]* disabled/g);
  expect(html).toMatch(/aria-label="Öka effektgrad"[^>]* disabled/g);
 });
 it('mixes magic items into alphabetic order but keeps item-specific rules and disabled states',()=>{
  const item={name:'Eld',rule_id:'eld',spell_source:'item',fv:12,
   item_spell:{key:'item-eld',item_name:'Flammande stav',ready:true,fv:12,effect_grade:3,effect_multiplier:2,battery:false}};
  const blocked={name:'Blixt',rule_id:'blixt',spell_source:'item',fv:12,
   item_spell:{key:'item-blixt',item_name:'Tom stav',ready:false,effect_grade:1,effect_multiplier:1}};
  const html=render([{name:'Frost',rule_id:'frost',fv:11},item,blocked],'item-eld');
  expect(optionLabels(html)).toEqual(['Blixt · Tom stav (föremål)','Eld · Flammande stav (föremål)','Frost']);
  expect(html).toContain('<option value="item-blixt" disabled>');
  expect(html).toContain('<option value="item-eld" selected>');
  expect(html).toContain('Föremål: Flammande stav · FV 12 · Fast EG 3 ×2');
  expect(html).not.toContain('aria-label="Öka effektgrad"');
 });
 it('preserves spell preparation timing and casting rules',()=>{
  const menu=runtime.slice(runtime.indexOf('function combatRowMagicMenuHtml('),runtime.indexOf('function combatActionChooserHtml('));
  expect(menu).toContain('role="region"');
  expect(menu).toContain('combatCloseMagicChooser()');
  expect(menu).toContain('combatMagicTargetChooserHtml(combatant,action)');
  expect(runtime).toContain('combatMagicCastPreflight(combatant,spell,grade)');
  expect(runtime).toContain('const currentRound=Number(activeCombat?.round_number)||1;');
  expect(runtime).toContain('ready_round:currentRound+(castRules.quick?0:1)');
  expect(runtime).toContain('async function selectCombatPreparedSpell(combatantId,spellKey)');
 });
});
