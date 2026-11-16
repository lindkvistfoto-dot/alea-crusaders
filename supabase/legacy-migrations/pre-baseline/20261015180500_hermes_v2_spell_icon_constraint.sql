-- HERMES 2.0: SHA-addressed spell icons with the original icon and effect guards intact.
ALTER TABLE public.rule_spells DROP CONSTRAINT IF EXISTS rule_spells_dual_art_paths;
ALTER TABLE public.rule_spells ADD CONSTRAINT rule_spells_dual_art_paths
CHECK (
 (
  icon_path IS NULL
  OR (
   icon_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
   AND split_part(icon_path,'/',2) = id::text
  )
  OR icon_path = 'assets/spells/arcane-ivory/' || spell_key || '.png'
  OR icon_path = 'assets/spells/arcane-ivory/' || spell_key || '.webp'
  OR (
   icon_path ~ '^hermes/spell/[a-z0-9]+(-[a-z0-9]+)*/[a-f0-9]{64}[.]webp$'
   AND split_part(icon_path,'/',3) = spell_key
  )
 )
 AND
 (
  effect_image_path IS NULL
  OR (
   effect_image_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
   AND split_part(effect_image_path,'/',2) = id::text
  )
 )
);
