-- HERMES: image paths for the six Expert Symbolism glyphs.
-- Symbolism uses its own rule_magic_symbols register, not rule_spells.
-- No mechanics, RLS, grants, or existing rule values are modified.
alter table public.rule_magic_symbols
  add column if not exists icon_path text;
comment on column public.rule_magic_symbols.icon_path is
  'HERMES published 640px WebP spell/symbol icon path; null when no icon is assigned.';
