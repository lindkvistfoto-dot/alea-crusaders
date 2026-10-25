-- Symbol records need the same editable magic-school reference as spells.
-- Keep existing rows valid; school_id remains nullable until an administrator assigns it.
alter table public.rule_magic_symbols
  add column if not exists school_id text
  references public.rule_magic_schools(id) on delete set null;

comment on column public.rule_magic_symbols.school_id is
  'Optional link to the shared magic-school registry, matching rule_spells.school_id.';

-- Mirror the existing spell registry's admin-only editing model, with UPDATE only.
grant update on public.rule_magic_symbols to authenticated;
drop policy if exists rule_magic_symbols_admin_update on public.rule_magic_symbols;
create policy rule_magic_symbols_admin_update
  on public.rule_magic_symbols
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin
  ));
