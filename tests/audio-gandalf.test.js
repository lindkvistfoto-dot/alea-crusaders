import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('Gandalf sound inventory v0.35.26',()=>{
 it('records 52 sounds with 25 planned future cues without publishing recordings',()=>{
  const sql=read('supabase/migrations/20261009141000_gandalf_inventory_v03526.sql');
  const cat=read('supabase/migrations/20261009140000_gandalf_categories_v03526.sql');
  expect(sql).toContain("'creature.skeleton'");
  expect(sql).toContain("'ranged.bow_release'");
  expect(sql).toContain("'event.whisper'");
  expect(sql).toContain("'ambience.village'");
  expect(cat).toContain("'ranged','magic','ambience','creature','event'");
  expect((sql.match(/'planned'/g)||[]).length).toBeGreaterThanOrEqual(25);
  expect(sql).not.toContain('INSERT INTO storage.objects');
 });
 it('shows filters and preserves game-start safety',()=>{
  const audio=read('features/audio/engine.js'),html=read('index.html');
  for(const id of ['adminSoundPriorityFilter','adminSoundIntegrationFilter','adminSoundSourceFilter','adminSoundInventoryStats'])expect(html).toContain(id);
  for(const key of ['priority','sound_kind','usage_hint','search_terms','target_variants','source_status'])expect(audio).toContain(key);
  expect(audio).toContain('legacyCueKeys.has(row.cue_key)');
  expect(audio).toContain('Ladda upp en ljudfil först');
  expect(audio).toContain('function gameSoundAllowed()');
  expect(read('legacy/app.js')).toContain("(c.integration_status!=='planned'||!!c.asset_path)");
 });
});
