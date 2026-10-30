-- Gandalf: Alea Crusaders material library, campaign-scoped metadata and sharing.
-- This stage introduces no new public buckets and DOES NOT publish existing images.
-- Future Gimli storage will use private bucket 'campaign-materials' and explicit storage RLS.
-- Existing image references stay in their current tables/buckets until Aragorn links them.

create table if not exists public.campaign_materials (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'other',
  asset_kind text not null default 'image',
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  original_filename text not null default '',
  file_size_bytes bigint,
  sha256 text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint campaign_materials_campaign_id_id_unique unique (campaign_id, id),
  constraint campaign_materials_title_nonempty check (length(btrim(title)) between 1 and 160),
  constraint campaign_materials_category_check check (category in ('location','npc','monster','item','map','document','other')),
  constraint campaign_materials_kind_check check (asset_kind in ('image','document','text')),
  constraint campaign_materials_bucket_check check (storage_bucket in (
    'campaign-materials','campaign-actor-images','campaign-location-assets',
    'campaign-maps','combat-scene-maps','combat-icons'
  )),
  constraint campaign_materials_path_scope_check check (
    split_part(storage_path,'/',1)=campaign_id::text
    and length(storage_path)>length(campaign_id::text)+1
    and storage_path not like '%..%'
    and storage_path not like '%//%'
  ),
  constraint campaign_materials_mime_check check (
    (asset_kind='image' and mime_type in ('image/png','image/jpeg','image/webp'))
    or (asset_kind='document' and mime_type='application/pdf')
    or (asset_kind='text' and mime_type='text/plain')
  ),
  constraint campaign_materials_size_check check (file_size_bytes is null or file_size_bytes between 0 and 20971520),
  constraint campaign_materials_sha_check check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint campaign_materials_unique_storage unique (campaign_id,storage_bucket,storage_path)
);
create index if not exists campaign_materials_browse_idx on public.campaign_materials(campaign_id,category,title) where archived_at is null;

-- GM-only notes are stored separately; shared material rows never contain GM notes.
create table if not exists public.campaign_material_gm_notes (
  material_id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  constraint campaign_material_notes_material_fk foreign key(campaign_id,material_id)
    references public.campaign_materials(campaign_id,id) on delete cascade
);

-- One file may be associated with multiple locations/actors/scenes without duplication.
create table if not exists public.campaign_material_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  material_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  constraint campaign_material_links_kind_check
    check(entity_type in ('location','npc','monster','event','combat_scene')),
  constraint campaign_material_links_one_per_entity unique(campaign_id,material_id,entity_type,entity_id),
  constraint campaign_material_links_material_fk foreign key(campaign_id,material_id)
    references public.campaign_materials(campaign_id,id) on delete cascade
);
create index if not exists campaign_material_links_entity_idx on public.campaign_material_links(campaign_id,entity_type,entity_id);

-- Validate polymorphic links belong to this very campaign (never cross-tenant).
create or replace function public.validate_campaign_material_link()
returns trigger language plpgsql set search_path = '' as $$
declare valid boolean;
begin
  case new.entity_type
    when 'location' then select exists(select 1 from public.campaign_locations v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'npc' then select exists(select 1 from public.campaign_npcs v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'monster' then select exists(select 1 from public.campaign_monsters v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'event' then select exists(select 1 from public.campaign_events v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'combat_scene' then select exists(select 1 from public.campaign_combat_scenes v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    else valid := false;
  end case;
  if not coalesce(valid,false) then
    raise exception 'Material link target does not belong to the campaign' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists campaign_material_links_validate on public.campaign_material_links;
create trigger campaign_material_links_validate
before insert or update of campaign_id,entity_type,entity_id
on public.campaign_material_links
for each row execute function public.validate_campaign_material_link();

-- Durable player library; a revoked row is historical, not visible to players.
create table if not exists public.campaign_material_shares (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  material_id uuid not null,
  shared_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint campaign_material_shares_material_fk foreign key(campaign_id,material_id)
    references public.campaign_materials(campaign_id,id) on delete cascade,
  constraint campaign_material_shares_dates check (revoked_at is null or revoked_at >= created_at)
);
create unique index if not exists campaign_material_shares_current_unique
  on public.campaign_material_shares(campaign_id,material_id) where revoked_at is null;
create index if not exists campaign_material_shares_active_idx
  on public.campaign_material_shares(campaign_id,material_id) where revoked_at is null;

-- One currently presented material per campaign, nullable when presentation closed.
-- Realtime clients can subscribe to changes to the row; delivery logic is Galadriel.
create table if not exists public.campaign_material_presentations (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  material_id uuid,
  shown_by uuid references auth.users(id) on delete set null,
  shown_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint campaign_material_presentation_material_fk foreign key(campaign_id,material_id)
    references public.campaign_materials(campaign_id,id) on delete no action,
  constraint campaign_material_presentation_state_check check (
    (material_id is null and shown_at is null) or (material_id is not null and shown_at is not null)
  )
);
create index if not exists campaign_material_presentation_lookup on public.campaign_material_presentations(material_id)
  where material_id is not null;

alter table public.campaign_materials enable row level security;
alter table public.campaign_material_gm_notes enable row level security;
alter table public.campaign_material_links enable row level security;
alter table public.campaign_material_shares enable row level security;
alter table public.campaign_material_presentations enable row level security;

grant select,insert,update on public.campaign_materials to authenticated;
grant select,insert,update,delete on public.campaign_material_gm_notes to authenticated;
grant select,insert,update,delete on public.campaign_material_links to authenticated;
grant select,insert,update,delete on public.campaign_material_shares to authenticated;
grant select,insert,update,delete on public.campaign_material_presentations to authenticated;

-- GM controls metadata. Player SELECT is restricted to a current presentation
-- or an explicitly shared library item. Archived media never becomes visible.
create policy campaign_materials_gm_write on public.campaign_materials
for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

create policy campaign_materials_player_read on public.campaign_materials
for select to authenticated
using (
  archived_at is null
  and private.is_campaign_member(campaign_id)
  and (
    exists(select 1 from public.campaign_material_shares s
      where s.campaign_id=campaign_materials.campaign_id
        and s.material_id=campaign_materials.id and s.revoked_at is null)
    or exists(select 1 from public.campaign_material_presentations p
      where p.campaign_id=campaign_materials.campaign_id
        and p.material_id=campaign_materials.id)
  )
);

create policy campaign_material_notes_gm_only on public.campaign_material_gm_notes
for all to authenticated
using(private.is_admin() or private.is_campaign_gm(campaign_id))
with check(private.is_admin() or private.is_campaign_gm(campaign_id));

create policy campaign_material_links_gm_only on public.campaign_material_links
for all to authenticated
using(private.is_admin() or private.is_campaign_gm(campaign_id))
with check(private.is_admin() or private.is_campaign_gm(campaign_id));

create policy campaign_material_shares_gm_write on public.campaign_material_shares
for all to authenticated
using(private.is_admin() or private.is_campaign_gm(campaign_id))
with check(private.is_admin() or private.is_campaign_gm(campaign_id));

create policy campaign_material_shares_player_read on public.campaign_material_shares
for select to authenticated
using(revoked_at is null and private.is_campaign_member(campaign_id));

create policy campaign_material_presentations_gm_write on public.campaign_material_presentations
for all to authenticated
using(private.is_admin() or private.is_campaign_gm(campaign_id))
with check(private.is_admin() or private.is_campaign_gm(campaign_id));

create policy campaign_material_presentations_player_read on public.campaign_material_presentations
for select to authenticated
using(private.is_campaign_member(campaign_id));

-- Intentionally NO public or anonymous policies.
-- Storage RLS / upload limits / secure signed-URL delivery will be implemented
-- in Gimli/Aragorn before any client exposes these shared material rows.
