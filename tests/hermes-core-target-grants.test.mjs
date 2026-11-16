import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261116150000_hermes_core_target_grants.sql',import.meta.url),'utf8').toLowerCase();

describe('HERMES CORE trusted honor target grants',()=>{
  it('keeps verification reads while limiting writes to image references',()=>{
    expect(sql).toContain('revoke all privileges on table public.honor_definitions from service_role');
    expect(sql).toContain('grant select on table public.honor_definitions to service_role');
    expect(sql).toContain('grant update (image_asset_id, image_revision)');
    expect(sql).toContain('revoke all privileges on table public.honor_relief_variants from service_role');
    expect(sql).toContain('grant select on table public.honor_relief_variants to service_role');
    expect(sql).toContain('grant insert (honor_id, name, material, image_asset_id, status, created_by)');
    expect(sql).toContain('grant update (image_asset_id, updated_at)');
    expect(sql).not.toMatch(/\b(delete|truncate|references|trigger)\b/);
  });
});
