import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20261012062000_character_round_live_sync.sql');
const feature=read('features/character/round-background.js');
const runtime=read('features/combat/runtime.js');
describe('live character round backgrounds override saved library fallback',()=>{
 it('adds an authorized, scoped after-update trigger for live combatants',()=>{
  expect(migration).toContain('CREATE TRIGGER characters_round_art_live_sync');
  expect(migration).toContain('AFTER UPDATE OF round_background_path ON public.characters');
  expect(migration).toContain("cb.source_type='character'");
  expect(migration).toContain('cb.source_id=NEW.id');
  expect(migration).toContain('cb.campaign_id=NEW.campaign_id');
  expect(migration).toContain("ci.status IN ('active','setup','paused')");
  expect(migration).toContain('SECURITY DEFINER SET search_path');
  expect(migration).toContain('REVOKE ALL ON FUNCTION');
 });
 it('never discards unrelated combat state and retains the preexisting library choice',()=>{
  expect(migration).toContain("coalesce(cb.state,'{}'::jsonb)||jsonb_build_object");
  expect(migration).toContain("participant.state->>'round_background_id'");
  expect(migration).toContain('fallback_id');
  expect(migration).toContain("next_source:=CASE WHEN NEW.round_background_path IS NULL THEN 'library' ELSE 'character' END");
  expect(migration).toContain('cb.state->>\'round_background_path\' IS DISTINCT FROM next_path');
 });
 it('notifies polling clients and repairs already-running encounters without restarting',()=>{
  expect(migration).toContain('UPDATE public.combat_instances ci');
  expect(migration).toContain('SET updated_at=clock_timestamp()');
  expect(migration).toContain('UPDATE public.characters c');
  expect(migration).toContain('SET round_background_path=c.round_background_path');
  expect(runtime).toContain('activeCombat?.updated_at');
 });
 it('refreshes the local combat model after updating or removing a personal image',()=>{
  expect(feature).toContain('await refreshLiveCombat(character);');
  expect(feature).toContain('await loadActiveCombat(activeCombat.id,{preserveSelectedTarget:true})');
  expect(feature).toContain('även i pågående strider');
 });
});
