-- Allow versioned ARCANE IVORY selector icons packaged from the GitHub repository.
-- Legacy private Supabase WebP paths remain valid and unchanged.
-- The repository asset basename must equal the corresponding spell_key.
alter table public.rule_spells
  drop constraint if exists rule_spells_dual_art_paths;
alter table public.rule_spells
  add constraint rule_spells_dual_art_paths check (
    (icon_path is null
      or (
        icon_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
        and split_part(icon_path,'/',2)=id::text
      )
      or icon_path in (
        'assets/spells/arcane-ivory/' || spell_key || '.png',
        'assets/spells/arcane-ivory/' || spell_key || '.webp'
      )
    )
    and (effect_image_path is null
      or (
        effect_image_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
        and split_part(effect_image_path,'/',2)=id::text
      )
    )
  );
comment on column public.rule_spells.icon_path is
  'Either legacy private WebP or the spell-matched assets/spells/arcane-ivory/<spell_key>.png|webp GitHub asset.';
