import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261116142033_revoke_anon_table_write_privileges.sql',import.meta.url),'utf8').toLowerCase();

describe('anonymous table write privileges',()=>{
  it('revokes anonymous write and schema-altering table grants only',()=>{
    expect(sql).toContain('revoke insert, update, delete, references, trigger, truncate');
    expect(sql).toContain('on all tables in schema public');
    expect(sql).toContain('from anon');
    expect(sql).not.toMatch(/\b(drop|delete from|truncate table|alter table)\b/);
    expect(sql).not.toMatch(/from\s+(authenticated|service_role)/);
  });
});
