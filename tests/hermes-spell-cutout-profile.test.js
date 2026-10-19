import {describe,it,expect} from 'vitest';
import {assertSpellCutoutWritable} from '../scripts/hermes2_asset_profiles.ts';

describe('HERMES spell-cutout write guard',()=>{
 it('accepts an empty slot and an idempotent retry for the same immutable asset',()=>{
  const path='spell/00000000-0000-0000-0000-000000000001/00000000-0000-4000-8000-000000000002.webp';
  expect(()=>assertSpellCutoutWritable(null,path)).not.toThrow();
  expect(()=>assertSpellCutoutWritable(path,path)).not.toThrow();
 });
 it('refuses to replace any other existing cutout',()=>{
  const current='spell/00000000-0000-0000-0000-000000000001/00000000-0000-4000-8000-000000000003.webp';
  const candidate='spell/00000000-0000-0000-0000-000000000001/00000000-0000-4000-8000-000000000002.webp';
  expect(()=>assertSpellCutoutWritable(current,candidate)).toThrow('EXISTING_CUTOUT_PROTECTED');
 });
});
