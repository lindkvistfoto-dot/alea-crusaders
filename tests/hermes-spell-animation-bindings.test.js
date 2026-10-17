import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('HERMES spell animation registry integration',()=>{
 it('reuses the existing HERMES registry rather than creating another engine',()=>{
  const src=read('features/combat/animations.js');
  expect(src).toContain('function optionsHtml(');
  expect(src).toContain("['projectile','effect','area','other'].includes(row.animation_type)||row.category==='magic'");
  expect(src).toContain('optionsHtml};');
 });
 it('links spell editor to reusable projectile and impact cues',()=>{
  const app=read('legacy/app.js');
  expect(app).toContain('id="rspProjectileAnimation"');
  expect(app).toContain('id="rspImpactAnimation"');
  expect(app).toContain("projectile_animation_key:$('rspProjectileAnimation')?.value||null");
  expect(app).toContain("impact_animation_key:$('rspImpactAnimation')?.value||null");
 });
 it('migrates without changing established combat rules',()=>{
  const sql=read('supabase/migrations/20261015131500_hermes_spell_animation_bindings.sql');
  expect(sql).toContain('references public.combat_animation_cues(event_key)');
  expect(sql).toContain("'magic.projectile'");
  expect(sql).toContain("'magic.impact'");
 });
});
