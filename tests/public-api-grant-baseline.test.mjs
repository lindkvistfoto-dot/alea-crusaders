import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261116142344_public_api_grant_baseline.sql',import.meta.url),'utf8').toLowerCase();

describe('public API grant baseline',()=>{
  it('defaults new public tables to no API-role grants',()=>{
    expect(sql).toContain('alter default privileges for role postgres in schema public');
    expect(sql).toContain('revoke all on tables from anon, authenticated, service_role');
  });

  it('keeps the one verified anonymous read surface and preserves existing CRUD',()=>{
    expect(sql).toContain('revoke all privileges on all tables in schema public from anon');
    expect(sql).toContain('grant select on table public.rule_magic_symbols to anon');
    expect(sql).toContain('revoke references, trigger, truncate');
    expect(sql).not.toMatch(/\b(drop|delete from|truncate table|grant (insert|update|delete))\b/);
  });
});
