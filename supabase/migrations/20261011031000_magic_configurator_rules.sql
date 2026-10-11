-- v0.35.86: reusable spell-power configuration; no custom columns per artifact.
-- Runtime state (last_used_day / charges_remaining) belongs to the character's
-- individual equipment instance, NEVER to a shared master/template.
alter table public.rule_magic_artifact_powers
 add column if not exists effect_multiplier integer not null default 1
  check (effect_multiplier between 1 and 1000);
alter table public.rule_magic_artifact_powers
 add column if not exists cast_mode text not null default 'fixed'
  check (cast_mode in ('wearer','fixed','automatic','none'));
alter table public.rule_magic_artifact_powers
 add column if not exists fixed_fv integer
  check (fixed_fv between 1 and 100);
alter table public.rule_magic_artifact_powers
 add column if not exists recharge_rule text not null default 'none'
  check (recharge_rule in ('none','next_day','manual'));
-- Existing definitions remain valid. For newly created spell templates, the
-- editor ensures that selecting 'fixed' includes an FV.
comment on column public.rule_magic_artifact_powers.effect_multiplier is
 'Generic output multiplier, independent of effect_grade: e.g. EG1 x4 yields four EG1 summons, NOT EG4.';
comment on column public.rule_magic_artifact_powers.recharge_rule is
 'A template rule; next_day checks the campaign day number on the owning individual item and is not a wall-clock delay.';
