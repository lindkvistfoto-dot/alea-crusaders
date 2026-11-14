import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('Trophy Inspector schema release',()=>{
  const migration=read('supabase/migrations/20261114032504_trophy_inspector_public_projection_and_earned_stars.sql');
  const policyMigration=read('supabase/migrations/20261114033214_trophy_inspector_invoker_read_policies.sql');

  it('stores achieved stars separately from definition maximums',()=>{
    expect(migration).toContain('earned_gold_stars smallint');
    expect(migration).toContain('default 0');
    expect(migration).toContain('earned_gold_stars between 0 and 3');
  });

  it('projects only public active awards and badges through invoker views',()=>{
    expect(migration).toContain("d.visibility = 'public'");
    expect(migration).toContain("d.status = 'active'");
    expect(migration).toContain("d.category in ('award', 'badge')");
    expect(migration).toContain('security_barrier = true');
    expect(policyMigration).toContain('security_invoker = true');
    expect(policyMigration).toContain('honor_grants_trophy_public_select');
    expect(policyMigration).toContain("category in ('award', 'badge')");
  });
});
