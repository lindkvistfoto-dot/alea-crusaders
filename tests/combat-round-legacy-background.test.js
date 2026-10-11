import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
describe('round background repair for preexisting encounters',()=>{
 it('keeps a CSS fallback visible even without an actor image',()=>{
  const css=read('features/combat/round-gallery.css');
  expect(css).toContain("var(--alea-round-illustration,url('../../assets/combat/round-hero-battle-pilot.avif'))");
  expect(css).toContain('background-position:center,center,right 25%');
 });
 it('backfills only ongoing combats with missing metadata, preserving history',()=>{
  const sql=read('supabase/migrations/20261012023000_restore_legacy_combat_round_images.sql');
  expect(sql).toContain("ci.status in ('active','paused','setup')");
  expect(sql).toContain("cb.state->>'round_background_source') is null");
  expect(sql).toContain('public.characters ch');
  expect(sql).toContain('ch.round_background_path');
  expect(sql).toContain('public.rule_combat_round_backgrounds');
  expect(sql).toContain('md5(cb.id::text || b.id::text)');
  expect(sql).toContain('jsonb_build_object');
 });
 it('renders a personal image if present and falls back to library for other combatants',()=>{
  const js=read('features/combat/runtime.js');
  const gallery=read('features/combat/round-gallery.js');
  expect(js).toContain("const customPath=sourceType==='character'?stats.round_background_path:null");
  expect(js).toContain("const roundArtSource=customPath?'character':'library'");
  expect(gallery).toContain("window.aleaCharacterRoundBackground?.resolveUrl?.(path)");
  expect(gallery).toContain("chosenUrl='./'+BUILTIN");
 });
});
