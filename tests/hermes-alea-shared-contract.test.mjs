import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../supabase/migrations/20261116143000_hermes_alea_shared_contract.sql', import.meta.url), 'utf8').toLowerCase();

describe('shared HERMES ALEA database contract', () => {
  it('keeps the existing ALEA targets and verified activation contract', () => {
    expect(sql).toContain("check (target_kind in ('definition','relief','weapon','armor_head','armor_arms','armor_torso','armor_legs'))");
    expect(sql).toContain('create or replace function private.hermes_alea_require_verified_activation()');
    expect(sql).toContain('upload_not_verified');
    expect(sql).toContain('hermes_alea_require_verified_activation before update of state on public.hermes_alea_jobs');
    expect(sql).toContain('create or replace function private.hermes_alea_begin(request jsonb)');
    expect(sql).toContain('create or replace function private.hermes_alea_finalize(job_id uuid)');
  });

  it('preserves HERMES job rows while bringing schema behavior forward', () => {
    expect(sql).toContain('create or replace view public.hermes_alea_cleanup_report');
    expect(sql).toContain('create or replace function public.hermes_alea_cleanup(job_id uuid, kind text, action text)');
    expect(sql).toContain('create or replace function public.hermes_alea_health()');
    expect(sql).toContain('create or replace function private.hermes_alea_storage_allowed(bucket text, path text, reading boolean)');
    expect(sql).toContain('create or replace view public.hermes_alea_assets');
    expect(sql).toContain('security_barrier = true');
    expect(sql).toContain('security_invoker = true');
    const migrationDdl = sql.replace(/create\s+or\s+replace\s+function\b[\s\S]*?\bas\s+(\$[a-z0-9_]*\$)[\s\S]*?\1\s*;/gi, '');
    expect(migrationDdl).not.toMatch(/^\s*(insert|update|delete|truncate)\b/m);
    expect(migrationDdl).not.toMatch(/^\s*drop\s+table\b/m);
  });

  it('applies the least-privilege grants already verified in LIVE', () => {
    expect(sql).toContain('revoke all privileges on table public.hermes_alea_jobs from public, anon, authenticated, service_role');
    expect(sql).toContain('grant select on public.hermes_alea_jobs to authenticated');
    expect(sql).toContain('grant select, insert, update, delete on public.hermes_alea_jobs to service_role');
    expect(sql).toContain('grant select, insert on public.hermes_web_jobs to authenticated');
    expect(sql).toContain('grant select, update on public.hermes_web_jobs to service_role');
    expect(sql).toContain('revoke all on function public.hermes_alea_begin(jsonb) from public, anon, authenticated, service_role');
    expect(sql).toContain('grant execute on function public.hermes_alea_begin(jsonb) to authenticated');
    expect(sql).toContain('grant execute on function public.hermes_alea_verify(uuid,jsonb) to service_role');
    expect(sql).not.toContain('grant execute on function public.hermes_alea_report_staging_block');
  });

  it('keeps DEV-only Olympia alerts out of the common migration', () => {
    expect(sql).not.toMatch(/(?:create|alter|drop)\s+[^;]*olympia_[a-z_]+/);
    expect(sql).not.toContain('hermes_alea_report_staging_block');
  });
});
