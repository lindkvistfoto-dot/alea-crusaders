import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const code=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
function section(a,b){const s=code.indexOf(a),e=code.indexOf(b,s);if(s<0||e<0)throw Error('Missing '+a);return code.slice(s,e)}
const registry=section('function spellRegistryKey(', 'function renderMagic()');
const magic=section('function renderMagic()', 'let armorPickerMaterialKey=');
function context(spells,characters){
 const c={ruleSpells:spells,ruleSpellsLoaded:true,chars:characters,scheduleCentralSave:()=>{c.saved++},saved:0,
 localStorage:{setItem:(key,value)=>{c.cache=value}},isRetiredSpellName:s=>['ÖKA','MINSKA'].includes(String(s||'').toUpperCase())};
 runInNewContext(registry+'this.findRuleSpell=findRuleSpell;this.link=linkCharacterSpellsToRegistry;',c);
 return c
}
describe('character spells use the single rule_spells master',()=>{
 const master=[{id:'eld-id',name:'ELD (F)',spell_key:'eld'}, {id:'jord-id',name:'JORDVÄG',spell_key:'jordvag'}, {id:'oppna-id',name:'ÖPPNA (F)',spell_key:'oppna'}];
 it('matches case, accent, flag suffix and UUID',()=>{
  const c=context(master,[]);
  expect(c.findRuleSpell({name:'eld'}).id).toBe('eld-id');
  expect(c.findRuleSpell({name:'Eld'}).id).toBe('eld-id');
  expect(c.findRuleSpell({name:'Öppna'}).id).toBe('oppna-id');
  expect(c.findRuleSpell({name:'Jordväg'}).id).toBe('jord-id');
  expect(c.findRuleSpell({rule_id:'jord-id',name:'Old name'}).name).toBe('JORDVÄG');
 });
 it('links existing spells, merges duplicates, preserves FV and ERF and unrecognized legacy spells',()=>{
  const character={spells:[{name:'Eld',fv:10,erf:2},{name:'eld',fv:6,erf:3},{name:'Jordväg',fv:7,erf:0},{name:'Eldsalamander',fv:12,erf:1},{name:'',fv:'',erf:0}]};
  const c=context(master,[character]);
  expect(c.link()).toBe(true);
  expect(character.spells.length).toBe(3);
  expect(character.spells[0].rule_id).toBe('eld-id');
  expect(character.spells[0].fv).toBe(10);
  expect(character.spells[0].erf).toBe(5);
  expect(character.spells[1].rule_id).toBe('jord-id');
  expect(character.spells[2].name).toBe('Eldsalamander');
  expect(character.spells[2].rule_id).toBeUndefined();
  expect(c.saved).toBe(1);
  expect(c.link()).toBe(false);
  expect(c.saved).toBe(1);
 });
 it('renders clickable names and uses the master for all choices',()=>{
  expect(magic).toContain('showSpellInfo(');
  expect(magic).toContain('changeSpellFromRegistry(');
  expect(magic).toContain('rule_id:rule.id,name:rule.name');
  expect(magic).toContain('spellSchoolLabel(rule)');
  expect(magic).toContain('rule.effect_per_eg');
  expect(magic).toContain('rule.resistance_text');
  expect(magic).not.toContain('onchange="setSpell(');
  expect(magic).toContain("if(k==='name'||k==='rule_id')return");
  expect(code).toContain('linkCharacterSpellsToRegistry();if(current');
  expect(code).toContain('if(!sp||!findRuleSpell(sp))return');
 });
 it('prevents duplicates and preserves FV and ERF while relinking a legacy spell',()=>{
  expect(magic).toContain('!used.has(r.id)');
  expect(magic).toContain('if((current.spells||[]).some(');
  expect(magic).toContain('current.spells[i]={...current.spells[i],rule_id:rule.id,name:rule.name}');
  expect(magic).toContain('await loadRuleMagicRegistry()');
 });
});
