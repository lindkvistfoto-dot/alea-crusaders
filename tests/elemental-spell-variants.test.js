import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261008235700_elementar_four_master_spells.sql');
const runtime=read('features/combat/runtime.js');
const original=read('tests/character-spell-master.test.js');
describe('four independent elemental summoning spells',()=>{
 const elements=[['eld','ELD','salamander'],['luft','LUFT','sylf'],['jord','JORD','gnom'],['vatten','VATTEN','undin']];
 it('offers four distinct master spells, not the old generic one',()=>{
  for(const [key,name,creature] of elements){
   expect(migration).toContain('frammana-skicka-bort-elementar-'+key);
   expect(migration).toContain('FRAMMANA/SKICKA BORT ELEMENTAR – '+name+' (F)');
   expect(migration).toContain(creature);
  }
  expect(migration).toContain("where spell_key in ('frammana-skicka-bort-elementar','frammana-skicka-bort-elementar-eld')");
  expect(migration).toContain('on conflict (spell_key) do nothing');
 });
 it('retains fire master UUID, FV, ERF and updates character/NPC snapshots',()=>{
  expect(migration).toContain("where elem->>'rule_id'=fire.id::text");
  expect(migration).toContain("'{name}',to_jsonb(fire.name),true");
  expect(migration).toContain("'fv',15,'erf',0,'school_fv',15");
  expect(migration).toContain("where n.npc_key in ('magic-test-eldra','magic-test-nox')");
  expect(original).toContain('rule_id:rule.id,name:rule.name');
 });
 it('summons Eldsalamander only for fire, with backwards-compatible old casts',()=>{
  const start=runtime.indexOf('const ELEMENTAL_SUMMON_TEMPLATES=');
  const end=runtime.indexOf('let combatSummonBusy=false;',start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const env={};
  runInNewContext(runtime.slice(start,end)+'this.isFire=combatIsFireElementalSummonName;',env);
  expect(env.isFire('FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)')).toBe(true);
  expect(env.isFire('FRAMMANA/SKICKA BORT ELEMENTAR (F)')).toBe(true);
  for(const name of ['LUFT','JORD','VATTEN'])
   expect(env.isFire('FRAMMANA/SKICKA BORT ELEMENTAR – '+name+' (F)')).toBe(false);
  expect(env.isFire('TILLKALLA VARELSE')).toBe(false);
 });
});
