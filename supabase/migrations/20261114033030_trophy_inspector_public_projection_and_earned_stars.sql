-- Public trophy-room projection. Keep source tables and their GM/admin policies
-- unchanged; the views expose only active, explicitly public awards and badges
-- to authenticated members of the relevant campaign.

alter table public.honor_grants
  add column if not exists earned_gold_stars smallint not null default 0;

alter table public.honor_grants
  drop constraint if exists honor_grants_earned_gold_stars_range;
alter table public.honor_grants
  add constraint honor_grants_earned_gold_stars_range
  check (earned_gold_stars between 0 and 3);

create or replace view public.arcane_trophy_public_definitions
with (security_barrier = true)
as
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
      select 1
      from public.campaign_members m
      where m.campaign_id = d.campaign_id
        and m.user_id = (select auth.uid())
    )
  );

create or replace view public.arcane_trophy_public_grants
with (security_barrier = true)
as
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
    select 1
    from public.campaign_members m
    where m.campaign_id = c.campaign_id
      and m.user_id = (select auth.uid())
  );

create or replace view public.arcane_trophy_public_variants
with (security_barrier = true)
as
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
      select 1
      from public.campaign_members m
      where m.campaign_id = d.campaign_id
        and m.user_id = (select auth.uid())
    )
  );

revoke all on public.arcane_trophy_public_definitions from public, anon;
revoke all on public.arcane_trophy_public_grants from public, anon;
revoke all on public.arcane_trophy_public_variants from public, anon;
grant select on public.arcane_trophy_public_definitions to authenticated;
grant select on public.arcane_trophy_public_grants to authenticated;
grant select on public.arcane_trophy_public_variants to authenticated;

comment on view public.arcane_trophy_public_definitions is
  'Safe trophy-room projection: only active public awards/badges, scoped to the caller campaign.';
comment on view public.arcane_trophy_public_grants is
  'Safe trophy-room projection: only active public award/badge grants in the caller campaign; exposes earned star count, not grant reasons.';
comment on view public.arcane_trophy_public_variants is
  'Safe trophy-room projection: published badge reliefs only.';
