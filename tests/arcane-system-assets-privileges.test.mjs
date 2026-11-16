import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261116130510_arcane_system_assets_privileges.sql',import.meta.url),'utf8').toLowerCase();

describe('arcane_system_assets least-privilege grants',()=>{
  it('removes all direct anonymous access and keeps authenticated reads only',()=>{
    expect(sql).toContain('revoke all privileges on table public.arcane_system_assets from public, anon');
    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger');
    expect(sql).toContain('from authenticated');
    expect(sql).toContain('grant select on table public.arcane_system_assets to authenticated');
  });

  it('grants server-side writers only the CRUD operations required by HERMES',()=>{
    expect(sql).toContain('revoke truncate, references, trigger');
    expect(sql).toContain('grant select, insert, update, delete');
    expect(sql).toContain('to service_role');
    expect(sql).not.toMatch(/alter\s+table\s+public\.arcane_system_assets\s+disable\s+row\s+level\s+security/);
    expect(sql).not.toMatch(/truncate\s+table|delete\s+from\s+public\.arcane_system_assets/i);
  });
});
