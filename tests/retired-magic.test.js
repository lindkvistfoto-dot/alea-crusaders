import {describe,test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const load=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const combat=load('features/combat/runtime.js');
const app=load('legacy/app.js');
const retired=['Ö'+'KA','MIN'+'SKA'];

describe('restored Expert Animism spells stay available',()=>{
 test('status casting requires an explicitly configured effect',()=>{
  const start=combat.indexOf('function combatSupportedStatusSpell(');
  const end=combat.indexOf('function combatSpellEffectTargets(',start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const env={};
  runInNewContext(combat.slice(start,end)+'this.select=combatSupportedStatusSpell;',env);
  expect(env.select({source_data:{spell_name:'FLYGA',magic_binding:{kind:'status',code:'spell_flyga'}}})).toBe('FLYGA');
  for(const name of retired)expect(env.select({source_data:{spell_name:name}})).toBeNull();
 });
 test('restored effects have an attribute chooser and a registered cast branch',()=>{
  for(const name of retired)expect(combat).toContain(name);
  expect(combat).toContain('spell_'+'oka');
  expect(combat).toContain('spell_'+'minska');
  expect(combat).toContain('combatChooseSpellAttribute');
  expect(combat).toContain('const registry=Array.isArray(ruleSpells)?ruleSpells:[]');
  expect(combat).toContain('if(!known){');
  expect(combat).toContain('Den förberedda besvärjelsen finns inte längre i registret');
 });
 test('saved local characters and backup imports are filtered',()=>{
  const start=app.indexOf('function isRetiredSpellName(');
  const end=app.indexOf('function spellKeyFromName(',start);
  const env={};
  runInNewContext(app.slice(start,end)+'this.retired=isRetiredSpellName;',env);
  for(const name of retired)expect(env.retired(name)).toBe(false);
  expect(env.retired('FLYGA')).toBe(false);
  expect(env.retired(' MINSKA ')).toBe(false);
  expect(app.split('c.spells=(Array.isArray(c.spells)?c.spells:[]).filter').length-1).toBe(3);
  expect(app).toMatch(/function renderMagic\(\)\s*\{\s*current\.spells=\(current\.spells\|\|\[\]\)\.filter/);
  expect(app).toContain("if(k==='name'||k==='rule_id')return");
  expect(app).toContain("if(isRetiredSpellName(name)){alert(");
 });
 test('historical retirement is superseded by a restoration migration',()=>{
  const definitions=load('supabase/migrations/20261008070000_retire_oka_minska.sql');
  const snapshots=load('supabase/migrations/20261008070100_purge_retired_spells_from_snapshots.sql');
  expect(definitions).toContain('DELETE FROM public.rule_spells');
  expect(definitions).toContain('DELETE FROM public.rule_effects');
  expect(snapshots).toContain('UPDATE public.characters');
  expect(snapshots).toContain('UPDATE public.combatants');
  expect(load('supabase/migrations/20261015213500_restore_oka_minska_animism.sql')).toContain("('oka','ÖKA','animism',6");
 });
});
