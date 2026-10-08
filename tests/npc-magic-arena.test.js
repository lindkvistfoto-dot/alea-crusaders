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