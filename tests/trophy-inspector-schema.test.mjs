import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

describe('Trophy Inspector schema release',()=>{
  const archive='supabase/legacy-migrations/live-candidate-original-migrations/';
  const migration=read(archive+'20261114033030_trophy_inspector_public_projection_and_earned_stars.sql');
  const policyMigration=read(archive+'20261114035052_trophy_inspector_invoker_read_policies.sql');
  const functionMigration=read(archive+'20261114041919_trophy_inspector_projection_functions.sql');
  const privateMigration=read(archive+'20261114104923_trophy_inspector_private_functions.sql');

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
    expect(policyMigration).toContain('honor_definitions_trophy_public_select');
    expect(functionMigration).toContain('drop policy if exists honor_definitions_trophy_public_select');
    expect(functionMigration).toContain('drop policy if exists honor_grants_trophy_public_select');
    expect(functionMigration).toContain('drop policy if exists honor_relief_variants_trophy_public_select');
  });

  it('keeps grant reasons and administrative columns out of public reads',()=>{
    expect(functionMigration).toContain('security definer');
    expect(functionMigration).toContain("set search_path = ''");
    expect(functionMigration).toContain('earned_gold_stars smallint');
    expect(functionMigration).toContain('select g.honor_id, g.character_id, g.granted_at, g.earned_gold_stars');
    expect(functionMigration).not.toMatch(/select g\.[^\n]*reason/);
  });

  it('keeps security-definer projection functions outside the exposed API schema',()=>{
    expect(privateMigration).toContain('create schema if not exists private');
    expect(privateMigration).toContain('private.arcane_trophy_public_grants_rows()');
    expect(privateMigration).toContain('security_invoker = true');
    expect(privateMigration).toContain('security invoker');
    expect(privateMigration).not.toMatch(/\bdrop\s+(function|view|table|policy)\b/i);
    expect(privateMigration).not.toMatch(/\b(delete\s+from|truncate|alter\s+table\s+.*drop)\b/i);
  });

  it('uses data-preserving schema changes and removes no application data',()=>{
    const all=[migration,policyMigration,functionMigration,privateMigration].join('\n');
    expect(migration).toContain('add column if not exists earned_gold_stars');
    expect(migration).toContain('check (earned_gold_stars between 0 and 3)');
    expect(all).not.toMatch(/\bdrop\s+(function|view|table)\b/i);
    expect(all).not.toMatch(/\b(delete\s+from|truncate\s+table)\b/i);
  });
});
