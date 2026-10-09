import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('Ljud-Aragorn source shortlist v0.35.32',()=>{
 it('records 19 source URLs with individual creator and CC0 rights-notes',()=>{
  const sql=read('supabase/migrations/20261009164500_aragorn_sources_v03527.sql');
  expect(sql).toContain("'dice.roll'");
  expect(sql).toContain("'creature.skeleton'");
  expect(sql).toContain("'ranged.bow_release'");
  expect(sql).toContain("'magic.fire'");
  expect(sql).toContain("source_status='shortlisted'");
  expect(sql).toContain('cues.source_url IS NULL');
  expect(sql).not.toContain('INSERT INTO storage.objects');
  const count=(sql.match(/https:\/\/freesound.org\/people\//g)||[]).length;
  expect(count).toBe(19);
 });
 it('source administration protects links and separates candidate from uploaded playable asset',()=>{
  const engine=read('features/audio/engine.js');
  expect(engine).toContain('function safeSourceUrl(value)');
  expect(engine).toContain("url.protocol==='https:'");
  expect(engine).toContain('rel="noopener noreferrer"');
  for(const field of ['source_url','creator_credit','license_type','license_notes'])expect(engine).toContain("data-field=\""+field+"\"");
  expect(engine).toContain("Kandidat ≠ uppladdad fil");
  expect(engine).toContain("allowed.source_status==='verified'");
  expect(read('index.html')).toContain('Gandalf / Aragorn');
 });
 it('source metadata can be edited only through sound cue admin REST PATCH',()=>{
  const engine=read('features/audio/engine.js');
  expect(engine).toContain("await dbJson('rule_sound_cues?cue_key=eq.'");
  expect(engine).toContain('if(allowed.source_url&&!safeSourceUrl(allowed.source_url))');
 });
});
