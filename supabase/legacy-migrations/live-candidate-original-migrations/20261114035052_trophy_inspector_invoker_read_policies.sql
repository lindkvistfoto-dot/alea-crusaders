-- Make public trophy-room projections honor underlying RLS, without opening
-- medal definitions or any hidden/inactive honors to campaign members.

alter view public.arcane_trophy_public_definitions
  set (security_barrier = true, security_invoker = true);
alter view public.arcane_trophy_public_grants
  set (security_barrier = true, security_invoker = true);
alter view public.arcane_trophy_public_variants
  set (security_barrier = true, security_invoker = true);

drop policy if exists honor_definitions_trophy_public_select on public.honor_definitions;
create policy honor_definitions_trophy_public_select on public.honor_definitions
  for select to authenticated
  using (
    category in ('award', 'badge')
    and status = 'active'
    and visibility = 'public'
    and (
      campaign_id is null
      or exists (
        select 1 from public.campaign_members m
        where m.campaign_id = honor_definitions.campaign_id
          and m.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists honor_grants_trophy_public_select on public.honor_grants;
create policy honor_grants_trophy_public_select on public.honor_grants
  for select to authenticated
  using (
    revoked_at is null
    and exists (
      select 1
      from public.honor_definitions d
      join public.characters c on c.id = honor_grants.character_id
      where d.id = honor_grants.honor_id
        and d.category in ('award', 'badge')
        and d.status = 'active'
        and d.visibility = 'public'
        and (d.campaign_id is null or d.campaign_id = c.campaign_id)
        and exists (
          select 1 from public.campaign_members m
          where m.campaign_id = c.campaign_id
            and m.user_id = (select auth.uid())
        )
    )
  );

drop policy if exists honor_relief_variants_trophy_public_select on public.honor_relief_variants;
create policy honor_relief_variants_trophy_public_select on public.honor_relief_variants
  for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.honor_definitions d
      where d.id = honor_relief_variants.honor_id
        and d.category = 'badge'
        and d.status = 'active'
        and d.visibility = 'public'
        and d.published_variant_id = honor_relief_variants.id
        and (
          d.campaign_id is null
          or exists (
            select 1 from public.campaign_members m
            where m.campaign_id = d.campaign_id
              and m.user_id = (select auth.uid())
          )
        )
    )
  );
