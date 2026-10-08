import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rt=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const adm=readFileSync(new URL('../legacy/app.js',import.meta.url),'utf8');
const start=rt.indexOf('function combatNumber('),end=rt.indexOf('async function combatLoadSceneRuntimeData(',start);
if(start<0||end<start)throw Error('Combat source stats missing');
const ctx={ruleSpells:[{id:'fire',name:'ELD',attack_magic:true,damage_text:'1T6 per EG',school_id:'elementarmagi'},{id:'fly',name:'FLYGA',attack_magic:false,school_id:'elementarmagi'}]};
runInNewContext(rt.slice(start,end)+'this.getStats=combatSourceStats;',ctx);
describe('SLP magiarena',()=>{
 test('kampanj-SLP:s alla kända besvärjelser blir valbara stridsbesvärjelser',()=>{
  const npc={attributes:{STY:10,FYS:18,STO:20,SMI:15,PSY:99},weapons:[],spells:[{rule_id:'fire',name:'ELD',fv:15,school_fv:15},{rule_id:'fly',name:'FLYGA',fv:15,school_fv:15}]};
  const result=ctx.getStats({source_type:'npc',source_id:'npc1',state:{}},{characters:new Map(),npcs:new Map([['npc1',npc]]),monsters:new Map()});
  expect(result.current_psy).toBe(99);expect(result.max_kp).toBe(19);
  expect(result.attack_profile.spells).toHaveLength(2);
  expect(result.attack_profile.spells[0]).toMatchObject({rule_id:'fire',fv:15,school_fv:15,damage_text:'1T6 per EG'});
  expect(result.attack_profile.spells[1]).toMatchObject({rule_id:'fly',fv:15})
 });
 test('SLP-hämtningen inkluderar besvärjelser',()=>expect(rt).toContain('&select=id,name,attributes,weapons,shield,armor,spells'));
 test('SLP-administration kan tilldela, ändra och spara FV',()=>{
  for(const marker of ['function renderAdminNpcSpells()', 'function addAllAdminNpcSpells()', 'function sanitizeNpcSpells(list)', 'spells:sanitizeNpcSpells(adminNpcDraft?.spells)'])expect(adm).toContain(marker)
 })
});

describe('SLP magier i den pågående stridsvyn',()=>{
 const spellStart=rt.indexOf('function combatSpellOptions(');
 const spellEnd=rt.indexOf('async function combatMagicButton(',spellStart);
 test('magimenyn hämtar 91 FV 15-besvärjelser från sparad state.attack_profile',()=>{
  expect(spellStart).toBeGreaterThan(-1);
  expect(spellEnd).toBeGreaterThan(spellStart);
  const rules=Array.from({length:91},(_,i)=>({
   id:'rule-'+i,name:i===0?'ELD (F)':'TESTBESVÄRJELSE '+i,
   attack_magic:i===0,damage_text:i===0?'1T6 per EG':'',school_id:'elementarmagi'
  }));
  const npc={attributes:{STY:10,FYS:18,STO:20,SMI:15,PSY:99},weapons:[],spells:rules.map(rule=>({
   rule_id:rule.id,name:rule.name,fv:15,school_fv:15
  }))};
  ctx.ruleSpells=rules;
  const stats=ctx.getStats({source_type:'npc',source_id:'npc-test',state:{}},{
   characters:new Map(),npcs:new Map([['npc-test',npc]]),monsters:new Map()
  });
  const battleCombatant={id:'combatant-test',source_type:'npc',state:{attack_profile:stats.attack_profile}};
  const ui={ruleSpells:rules,escAttr:value=>String(value),
   combatMagicRuleProfile:()=>({category:'direct'}),
   combatMagicBinding:()=>({supported:true})};
  runInNewContext(rt.slice(spellStart,spellEnd)+'this.spellOptions=combatSpellOptions;this.spellChooser=combatSpellChooserHtml;',ui);
  const options=ui.spellOptions(battleCombatant);
  expect(options).toHaveLength(91);
  expect(options.every(spell=>spell.fv===15&&spell.school_fv===15)).toBe(true);
  const html=ui.spellChooser(battleCombatant,null);
  expect((html.match(/combat-weapon-choice-btn/g)||[])).toHaveLength(91);
  expect(html).toContain('ELD (F)');
  expect(html).not.toContain('Rollfiguren har inga besvärjelser.');
 });
 test('utan besvärjelser visas ett begripligt tomläge',()=>{
  const ui={ruleSpells:[],escAttr:value=>String(value),
   combatMagicRuleProfile:()=>({category:'none'}),combatMagicBinding:()=>({supported:false,reason:'Ej implementerad'})};
  runInNewContext(rt.slice(spellStart,spellEnd)+'this.spellOptions=combatSpellOptions;this.spellChooser=combatSpellChooserHtml;',ui);
  expect(ui.spellOptions({state:{attack_profile:{spells:[]}}})).toHaveLength(0);
  expect(ui.spellChooser({state:{attack_profile:{spells:[]}}},null)).toContain('Rollfiguren har inga besvärjelser.');
 });
});
