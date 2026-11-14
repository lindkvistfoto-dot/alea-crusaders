-- Keep public trophy projections narrow without granting members direct reads
-- of private grant reasons or other administrative honors metadata.

create or replace function public.arcane_trophy_public_definitions_rows()
returns table (
  id uuid,
  name text,
  description text,
  category text,
  status text,
  visibility text,
  campaign_id uuid,
  image_asset_id text,
  badge_frame_assets jsonb,
  published_variant_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.name, d.description, d.category, d.status, d.visibility,
         d.campaign_id, d.image_asset_id, d.badge_frame_assets,
         d.published_variant_id
  from public.honor_definitions d
  where d.category in ('award', 'badge')
    and d.status = 'active'
    and d.visibility = 'public'
    and (
      d.campaign_id is null
      or exists (
        select 1 from public.campaign_members m
        where m.campaign_id = d.campaign_id
          and m.user_id = auth.uid()
      )
    );
$$;

create or replace function public.arcane_trophy_public_grants_rows()
returns table (
  honor_id uuid,
  character_id uuid,
  granted_at timestamptz,
  earned_gold_stars smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.honor_id, g.character_id, g.granted_at, g.earned_gold_stars
  from public.honor_grants g
  join public.honor_definitions d on d.id = g.honor_id
  join public.characters c on c.id = g.character_id
  where g.revoked_at is null
    and d.category in ('award', 'badge')
    and d.status = 'active'
    and d.visibility = 'public'
    and (d.campaign_id is null or d.campaign_id = c.campaign_id)
    and exists (
      select 1 from public.campaign_members m
      where m.campaign_id = c.campaign_id
        and m.user_id = auth.uid()
    );
$$;

create or replace function public.arcane_trophy_public_variants_rows()
returns table (
  id uuid,
  honor_id uuid,
  status text,
  allow_overhang boolean,
  image_asset_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.honor_id, v.status, v.allow_overhang, v.image_asset_id
  from public.honor_relief_variants v
  join public.honor_definitions d on d.id = v.honor_id
  where v.status = 'published'
    and d.category = 'badge'
    and d.status = 'active'
    and d.visibility = 'public'
    and d.published_variant_id = v.id
    and (
      d.campaign_id is null
      or exists (
        select 1 from public.campaign_members m
        where m.campaign_id = d.campaign_id
          and m.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.arcane_trophy_public_definitions_rows() from public, anon;
revoke all on function public.arcane_trophy_public_grants_rows() from public, anon;
revoke all on function public.arcane_trophy_public_variants_rows() from public, anon;
grant execute on function public.arcane_trophy_public_definitions_rows() to authenticated;
grant execute on function public.arcane_trophy_public_grants_rows() to authenticated;
grant execute on function public.arcane_trophy_public_variants_rows() to authenticated;

create or replace view public.arcane_trophy_public_definitions
with (security_barrier = true, security_invoker = true)
as select * from public.arcane_trophy_public_definitions_rows();
create or replace view public.arcane_trophy_public_grants
with (security_barrier = true, security_invoker = true)
as select * from public.arcane_trophy_public_grants_rows();
create or replace view public.arcane_trophy_public_variants
with (security_barrier = true, security_invoker = true)
as select * from public.arcane_trophy_public_variants_rows();

revoke all on public.arcane_trophy_public_definitions from public, anon;
revoke all on public.arcane_trophy_public_grants from public, anon;
revoke all on public.arcane_trophy_public_variants from public, anon;
grant select on public.arcane_trophy_public_definitions to authenticated;
grant select on public.arcane_trophy_public_grants to authenticated;
grant select on public.arcane_trophy_public_variants to authenticated;

-- Remove the temporary table-level row policy: it would expose every column
-- of honor_grants for matching rows, including grant and revocation reasons.
drop policy if exists honor_definitions_trophy_public_select on public.honor_definitions;
drop policy if exists honor_grants_trophy_public_select on public.honor_grants;
drop policy if exists honor_relief_variants_trophy_public_select on public.honor_relief_variants;
