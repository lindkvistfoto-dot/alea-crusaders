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
 it('preserves minimum server privileges and accepts HERMES icon paths in SQL schema',()=>{
  const grants=read('supabase/migrations/20261015180000_hermes_v2_server_permissions.sql');
  const paths=read('supabase/migrations/20261015180500_hermes_v2_spell_icon_constraint.sql');
  expect(grants).toContain('GRANT SELECT, UPDATE ON TABLE public.rule_magic_symbols TO service_role');
  expect(grants).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.hermes_jobs TO service_role');
  expect(grants).not.toContain('TO authenticated');
  expect(grants).not.toContain('TO anon');
  expect(paths).toContain('rule_spells_dual_art_paths');
  expect(paths).toContain('hermes/spell/');
  expect(paths).toContain('effect_image_path IS NULL');
 });
 it('authorizes a verified user against their own profile with the caller JWT',()=>{
  const edge=read('supabase/functions/hermes-v2/index.ts');
  expect(edge).toContain('const {data:{user},error:authError}=await client.auth.getUser(jwt)');
  expect(edge).toContain('global:{headers:{Authorization:"Bearer "+jwt}}');
  expect(edge).toContain('.eq("id",user.id).maybeSingle()');
  expect(edge).toContain('if(!profile?.is_admin)return fail(403,"ADMIN_REQUIRED"');
  expect(edge).toContain('ADMIN_LOOKUP_FAILED');
 });
 it('only activates after bytes, archive, delivery, and target readback',()=>{
  const edge=read('supabase/functions/hermes-v2/index.ts');
  const checks=['pngInfo(src)','webpInfo(out)','await store(SOURCE','await store(PUBLIC','await archive(','await checkReadback(PUBLIC','await fetch(publicUrl','DATABASE_READBACK_MISMATCH'];
  for(const x of checks)expect(edge).toContain(x);
  expect(edge.indexOf('await fetch(publicUrl')).toBeLessThan(edge.indexOf('.update({icon_path:job.app_path})'));
  expect(edge).toContain('GITHUB_TOKEN_NOT_CONFIGURED');
 });
 it('supports signed, immutable one-click Osäkerhet import from archived GitHub bytes',()=>{
  const edge=read('supabase/functions/hermes-v2/index.ts');
  const ui=read('features/combat/hermes2.js');
  expect(edge).toContain('body.action==="import_osakerhet"');
  expect(edge).toContain('PILOT_PNG_CHECKSUM_MISMATCH');
  expect(edge).toContain('PILOT_GIT_SHA_MISMATCH');
  expect(edge).toContain('legacyPath="assets/spells/arcane-ivory/"');
  expect(edge).toContain('auth.getUser(jwt)');
  expect(ui).toContain('Kör Osäkerhet-pilot utan uppladdning');
  expect(ui).toContain("action:'import_osakerhet'");
 });
 it('recognizes content-addressed HERMES icon paths in both admin and combat',()=>{
  const art=read('features/combat/spell-art.js'),runtime=read('features/combat/runtime.js'),symbols=read('features/combat/admin-symbols.js');
  expect(art).toContain('HERMES_ICON');
  expect(runtime).toContain('hermes\\/spell');
  expect(symbols).toContain('hermes\\/symbol');
  expect(symbols).toContain("img.addEventListener('load',success");
 });
});
