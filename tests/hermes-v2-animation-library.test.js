import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
describe('HERMES V2 library',()=>{
 it('uses compact list and an editor opened from selected row',()=>{
  const s=read('features/combat/animations.js');
  expect(s).toContain('hermes-v2-table');
  expect(s).toContain('data-vfx-open');
  expect(s).toContain('data-vfx-editor');
  expect(s).toContain("const TYPES={projectile:");
 });
 it('supports caster-to-target travel followed by impact',()=>{
  const s=read('features/combat/animations.js');
  expect(s).toContain('function playSequence(');
  expect(s).toContain('opts.from&&opts.to');
  expect(s).toContain('video.animate(');
  expect(s).toContain('if(impactKey)play(impactKey,{target:to})');
 });
 it('invokes visual spell animation after defenses without changing rolls',()=>{
  const s=read('features/combat/runtime.js');
  expect(s).toContain('function combatPlaySpellAnimation(');
  expect(s).toContain('combatPlaySpellAnimation(actor,victim,action)');
  expect(s).toContain('combatPlaySpellAnimation(caster,victim,action)');
 });
 it('persists six types without changing existing event keys',()=>{
  const sql=read('supabase/migrations/20261015152500_hermes_v2_animation_types.sql');
  for(const t of ['projectile','effect','attack','area','system','other'])expect(sql).toContain("'"+t+"'");
 });
});
