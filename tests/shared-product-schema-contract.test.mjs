import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../supabase/migrations/20261116131457_shared_product_schema_contract.sql', import.meta.url), 'utf8').toLowerCase();

describe('shared product schema contract migration', () => {
  it('adds only the missing common product columns and battlefield tables', () => {
    for (const table of [
      'campaign_location_gm_notes',
      'combatant_battle_poses',
      'race_battle_poses',
      'rule_weapons',
      'rule_armor_types',
    ]) expect(sql).toContain(`alter table public.${table}`);

    expect(sql).toContain('create table if not exists public.arcane_battlefield_library');
    expect(sql).toContain('create table if not exists public.combat_battlefield_objects');
    expect(sql).toContain('combat_battlefield_objects_one_per_hex unique (combat_id, q, r)');
    expect(sql).toContain('private.validate_combat_battlefield_object()');
    expect(sql).toContain('private.touch_battlefield_object_combat()');
  });

  it('keeps battlefield tables restricted to authenticated policies and server-side writers', () => {
    expect(sql.match(/revoke all privileges on table public\.(?:arcane_battlefield_library|combat_battlefield_objects) from public, anon, authenticated/g)).toHaveLength(2);
    expect(sql).toContain('grant select, insert, update on public.arcane_battlefield_library to authenticated');
    expect(sql).toContain('grant select, insert, update, delete on public.combat_battlefield_objects to authenticated');
    expect(sql).toContain('for select to authenticated using (active or private.is_admin())');
    expect(sql).toContain('for delete to authenticated using (private.is_campaign_gm(campaign_id) or private.is_admin())');
  });

  it('does not copy or seed environment data or alter unrelated DEV-only tables', () => {
    expect(sql).not.toMatch(/^\s*insert\s+into\b/m);
    expect(sql).not.toMatch(/^\s*drop\s+table\b/m);
    expect(sql).not.toContain("'wall-segment-prototype'");
    expect(sql).not.toContain('olympia_');
    expect(sql).not.toMatch(/\b(drop|truncate)\s+table\b/);
  });
});
