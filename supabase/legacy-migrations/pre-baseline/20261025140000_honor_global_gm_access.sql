-- Allow campaign GMs (SL) to manage the two global Honors records that own the relief library.
-- Other global honor definitions remain admin-only.
drop policy if exists honor_definitions_global_relief_gm_select on public.honor_definitions;
create policy honor_definitions_global_relief_gm_select on public.honor_definitions
  for select to authenticated
  using (
    campaign_id is null
    and lower(name) in ('arcane laurel badge','sir robin','sir robin award')
    and exists (
      select 1 from public.campaign_members m
      where m.user_id = (select auth.uid()) and m.role = 'gm'
    )
  );

drop policy if exists honor_definitions_global_relief_gm_update on public.honor_definitions;
create policy honor_definitions_global_relief_gm_update on public.honor_definitions
  for update to authenticated
  using (
    campaign_id is null
    and lower(name) in ('arcane laurel badge','sir robin','sir robin award')
    and exists (
      select 1 from public.campaign_members m
      where m.user_id = (select auth.uid()) and m.role = 'gm'
    )
  )
  with check (
    campaign_id is null
    and lower(name) in ('arcane laurel badge','sir robin','sir robin award')
    and exists (
      select 1 from public.campaign_members m
      where m.user_id = (select auth.uid()) and m.role = 'gm'
    )
  );

drop policy if exists honor_relief_variants_manager_access on public.honor_relief_variants;
create policy honor_relief_variants_manager_access on public.honor_relief_variants
  for all to authenticated
  using (
    private.is_admin() or exists (
      select 1
      from public.honor_definitions d
      join public.campaign_members m on m.user_id = (select auth.uid()) and m.role = 'gm'
      where d.id = honor_relief_variants.honor_id
        and (
          d.campaign_id = m.campaign_id
          or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award'))
        )
    )
  )
  with check (
    private.is_admin() or exists (
      select 1
      from public.honor_definitions d
      join public.campaign_members m on m.user_id = (select auth.uid()) and m.role = 'gm'
      where d.id = honor_relief_variants.honor_id
        and (
          d.campaign_id = m.campaign_id
          or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award'))
        )
    )
  );
