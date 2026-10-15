import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

describe('HERMES 2.0 release safety contracts',()=>{
 it('ships parseable browser scripts',()=>{
  for(const path of ['features/combat/hermes2.js','features/combat/admin-symbols.js','features/combat/spell-art.js','features/combat/runtime.js']){
   expect(()=>new Function(read(path)),path).not.toThrow();
  }
 });
 it('mounts versioned admin console without replacing prior editors',()=>{
  const index=read('index.html');
  expect(index).toContain('features/combat/hermes2.js?v=');
  expect(index).toContain('features/combat/admin-symbols.js?v=');
  expect(index).toContain('features/combat/spell-art.js?v=');
 });
 it('uses private original and public immutable WebP buckets with admin RLS',()=>{
  const migration=read('supabase/migrations/20261015170000_hermes_v2_job_queue_and_storage.sql');
  expect(migration).toContain("'alea-hermes-source','alea-hermes-source',false");
  expect(migration).toContain("'alea-hermes-public','alea-hermes-public',true");
  expect(migration).toContain('private.is_admin()');
  expect(migration).toContain('unique(kind,target_key,source_sha256)');
 });
 it('does not ship a browser-side GitHub token or service key',()=>{
  const ui=read('features/combat/hermes2.js');
  expect(ui).not.toMatch(/HERMES_GITHUB_TOKEN|SUPABASE_SERVICE_ROLE_KEY|ghp_/);
  expect(ui).toContain('freshSupabaseAccessToken');
 });
 it('only activates after bytes, archive, delivery, and target readback',()=>{
  const edge=read('supabase/functions/hermes-v2/index.ts');
  const checks=['pngInfo(src)','webpInfo(out)','await store(SOURCE','await store(PUBLIC','await archive(','await checkReadback(PUBLIC','await fetch(publicUrl','DATABASE_READBACK_MISMATCH'];
  for(const x of checks)expect(edge).toContain(x);
  expect(edge.indexOf('await fetch(publicUrl')).toBeLessThan(edge.indexOf('.update({icon_path:job.app_path})'));
  expect(edge).toContain('GITHUB_TOKEN_NOT_CONFIGURED');
 });
 it('recognizes content-addressed HERMES icon paths in both admin and combat',()=>{
  const art=read('features/combat/spell-art.js'),runtime=read('features/combat/runtime.js'),symbols=read('features/combat/admin-symbols.js');
  expect(art).toContain('HERMES_ICON');
  expect(runtime).toContain('hermes\\/spell');
  expect(symbols).toContain('hermes\\/symbol');
  expect(symbols).toContain("img.addEventListener('load',success");
 });
});
