import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('function combatEffectAttributeDelta('),end=runtime.indexOf('function combatEffectLabel(',start);
if(start<0||end<start)throw new Error('Missing PUMA functions');
function setup(rows=[],definitions=[]){
 const env={combatActiveEffects:rows,combatEffectRegistry:definitions,combatEffectDefinition:r=>definitions.find(d=>d.id===r.effect_id),combatEffectIsActive:r=>r.status==='active',combatCharacterSource:()=>null,combatNumber:(v,backup=null)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):backup};
 runInNewContext("const COMBAT_EFFECT_ATTRIBUTES=['STY','FYS','STO','SMI','INT','PSY','KAR'];"+runtime.slice(start,end)+"this.api={combatEffectAttributeDelta,combatBaseAttribute,combatEffectiveAttribute};",env);
 return env.api;
}
const target={id:'hero',state:{attributes:{STY:15,FYS:12,STO:11,SMI:13,INT:16,PSY:17,KAR:9}}};
describe('PUMA effective characteristics',()=>{
 test('independent, explicit attribute effect magnitudes compose without modifying base values',()=>{
  const defs=[{id:'up',active:true,modifiers:{type:'attribute_delta',direction:1}},{id:'down',active:true,modifiers:{type:'attribute_delta',direction:-1}}];
  const rows=[{combatant_id:'hero',effect_id:'up',status:'active',strength:2,parameters:{attribute:'SMI',points_per_eg:2}},{combatant_id:'hero',effect_id:'down',status:'active',strength:1,parameters:{attribute:'SMI',points_per_eg:1}}];
  const x=setup(rows,defs);
  expect(x.combatEffectiveAttribute(target,'SMI')).toBe(16);
  expect(x.combatBaseAttribute(target,'SMI')).toBe(13);
  expect(target.state.attributes.SMI).toBe(13);
 });
 test('unconfigured magnitude never invents an Expert rule',()=>{
  const x=setup([{combatant_id:'hero',effect_id:'up',status:'active',strength:2,parameters:{attribute:'FYS'}}],[{id:'up',active:true,modifiers:{type:'attribute_delta',direction:1}}]);
  expect(x.combatEffectiveAttribute(target,'FYS')).toBe(12);
 });
 test('foreign and removed effects are not counted',()=>{
  const x=setup([{combatant_id:'other',effect_id:'up',status:'active',strength:2,parameters:{attribute:'STY',points_per_eg:1}},{combatant_id:'hero',effect_id:'up',status:'removed',strength:2,parameters:{attribute:'STY',points_per_eg:1}}],[{id:'up',active:true,modifiers:{type:'attribute_delta',direction:1}}]);
  expect(x.combatEffectiveAttribute(target,'STY')).toBe(15);
 });
 test('combat initiative and attack profile read effective values',()=>{
  expect(runtime).toContain("combatEffectiveAttribute(row,'SMI')");
  expect(runtime).toContain('attributes:stats.attributes');
  expect(runtime).toContain("combatEffectiveAttribute(combatant,'STY')");
  expect(runtime).toContain("combatEffectiveAttribute(combatant,'STO')");
 });
});
