alter table public.campaign_monsters
  add column if not exists actor_kind text not null default 'enemy',
  add column if not exists title text not null default '',
  add column if not exists race text not null default '',
  add column if not exists gender text not null default '',
  add column if not exists profession text not null default '',
  add column if not exists image_path text,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists skills jsonb not null default '[]'::jsonb,
  add column if not exists weapons jsonb not null default '[]'::jsonb,
  add column if not exists shield jsonb not null default '{}'::jsonb,
  add column if not exists armor jsonb not null default '{}'::jsonb;

alter table public.campaign_monsters
  drop constraint if exists campaign_monsters_actor_kind_check;

alter table public.campaign_monsters
  add constraint campaign_monsters_actor_kind_check
  check (actor_kind in ('enemy','monster'));

create index if not exists campaign_monsters_kind_idx
  on public.campaign_monsters(campaign_id, actor_kind, sort_order, name);

drop policy if exists campaign_actor_images_select on storage.objects;
create policy campaign_actor_images_select on storage.objects
for select to authenticated
using (
  bucket_id = 'campaign-actor-images'
  and (
    exists (
      select 1
      from public.campaign_npcs n
      where n.image_path = storage.objects.name
        and (
          (select private.is_admin())
          or (select private.is_campaign_gm(n.campaign_id))
          or (n.player_visible and (select private.is_campaign_member(n.campaign_id)))
        )
    )
    or exists (
      select 1
      from public.campaign_monsters m
      where m.image_path = storage.objects.name
        and (
          (select private.is_admin())
          or (select private.is_campaign_gm(m.campaign_id))
          or (m.player_visible and (select private.is_campaign_member(m.campaign_id)))
        )
    )
  )
);
