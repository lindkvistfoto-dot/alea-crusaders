import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const sql=readFileSync(new URL('../supabase/migrations/20261026172000_hermes_alea_target_adapter_boundary.sql',import.meta.url),'utf8');
it('keeps target reads and writes behind explicit allowlisted adapters',()=>{
 expect(sql).toContain('private.hermes_alea_target_lock');
 expect(sql).toContain('private.hermes_alea_target_set');
 expect(sql).toContain("kind='definition'");
 expect(sql).toContain("kind='relief'");
 expect(sql).not.toMatch(/execute\s+format\s*\(/i);
 expect(sql).not.toMatch(/execute\s+request/i);
});
it('keeps existing begin and finalize contracts while replacing direct pointer dispatch',()=>{
 expect(sql).toContain('create or replace function private.hermes_alea_begin(request jsonb)');
 expect(sql).toContain('create or replace function private.hermes_alea_finalize(job_id uuid)');
 expect(sql).toContain('private.hermes_alea_target_lock(kind,target)');
 expect(sql).toContain('private.hermes_alea_target_lock(j.target_kind,j.target_id)');
 expect(sql).toContain('private.hermes_alea_target_set(j.target_kind,j.target_id,newkey)');
 expect(sql).toContain('IMAGE_REVISION_CONFLICT');
 expect(sql).toContain('UPLOAD_NOT_VERIFIED');
});
