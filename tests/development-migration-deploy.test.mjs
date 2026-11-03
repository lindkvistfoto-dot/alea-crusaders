import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('DEV database migration deployment', () => {
  const workflow = read('../.github/workflows/deploy-development-migrations.yml');

  it('reruns the existing guarded DEV deployment when its workflow changes', () => {
    expect(workflow).toContain('      - supabase/migrations/**');
    expect(workflow).toContain('      - .github/workflows/deploy-development-migrations.yml');
    expect(workflow).toContain('direct = u.hostname == "db.wkiuyklzzroavclnsxna.supabase.co"');
    expect(workflow).toContain("grep -q 'development_schema_baseline' <<< \"$plan\"");
  });

  it('accepts an auth trigger migration already recorded in DEV history', () => {
    expect(workflow).toContain("-name '*_restore_auth_user_profile_trigger.sql'");
    expect(workflow).toContain('auth_applied="$(psql');
    expect(workflow).toContain('if [[ "$auth_applied" != "t" ]] && ! grep -q');
    expect(workflow).not.toContain("grep -q 'restore_auth_user_profile_trigger' <<< \"$plan\" ||");
  });

  it('reports a missing storage table and a permission failure distinctly', () => {
    const edge = read('../supabase/functions/olympia-control/index.ts');
    expect(edge).toContain('databaseCode === "PGRST205"');
    expect(edge).toContain('UPPSLAG-tabellen saknas i DEV-databasen');
    expect(edge).toContain('databaseCode === "42501"');
    expect(edge).toContain('Zeus saknar administratörsbehörighet för UPPSLAG i DEV.');
  });
});
