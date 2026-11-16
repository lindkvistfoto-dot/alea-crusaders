-- HERMES combat VFX registry: visual-only configurable animations.
create table if not exists public.combat_animation_cues (
  event_key text primary key check (event_key ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)+$'),
  label text not null check (length(trim(label)) between 2 and 96),
  category text not null default 'combat' check (category in ('melee','ranged','magic','combat','defense','system')),
  enabled boolean not null default true,
  asset_path text,
  speed numeric(4,2) not null default 1 check (speed between 0.25 and 4),
  scale numeric(4,2) not null default 1 check (scale between 0.25 and 3),
  opacity numeric(4,2) not null default 1 check (opacity between 0.1 and 1),
  offset_x integer not null default 0 check (offset_x between -400 and 400),
  offset_y integer not null default 0 check (offset_y between -400 and 400),
  blend_mode text not null default 'screen' check (blend_mode in ('screen','lighten','normal')),
  updated_at timestamptz not null default now(),
  constraint hermes_animation_asset_path check (
    asset_path is null or asset_path ~ '^events/[a-z][a-z0-9]*(\.[a-z0-9]+)+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$'
  )
);
alter table public.combat_animation_cues enable row level security;
revoke all on public.combat_animation_cues from anon;
grant select on public.combat_animation_cues to authenticated;
grant update on public.combat_animation_cues to authenticated;
drop policy if exists hermes_animation_authenticated_read on public.combat_animation_cues;
create policy hermes_animation_authenticated_read on public.combat_animation_cues
 for select to authenticated using(true);
drop policy if exists hermes_animation_admin_update on public.combat_animation_cues;
create policy hermes_animation_admin_update on public.combat_animation_cues
 for update to authenticated using((select private.is_admin()))
 with check((select private.is_admin()));
insert into public.combat_animation_cues(event_key,label,category,speed,blend_mode) values
 ('melee.attack','Närstrid · attack','melee',2.50,'screen'),
 ('melee.hit','Närstrid · träff','melee',1,'screen'),
 ('melee.miss','Närstrid · miss','melee',1,'screen'),
 ('melee.parry','Närstrid · parering','defense',1,'screen'),
 ('melee.perfect','Närstrid · perfekt träff','melee',1,'screen'),
 ('melee.fumble','Närstrid · fummel','melee',1,'screen'),
 ('ranged.attack','Avståndsattack','ranged',1,'screen'),
 ('ranged.hit','Avståndsattack · träff','ranged',1,'screen'),
 ('magic.cast','Magi · kasta besvärjelse','magic',1,'screen'),
 ('magic.hit','Magi · träff','magic',1,'screen')
on conflict(event_key) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('alea-combat-animations','alea-combat-animations',true,12582912,array['video/mp4','video/webm'])
on conflict (id) do update set
 file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists hermes_vfx_read on storage.objects;
create policy hermes_vfx_read on storage.objects
 for select to public using (bucket_id='alea-combat-animations');
drop policy if exists hermes_vfx_admin_upload on storage.objects;
create policy hermes_vfx_admin_upload on storage.objects
 for insert to authenticated with check(bucket_id='alea-combat-animations' and (select private.is_admin()));
drop policy if exists hermes_vfx_admin_delete on storage.objects;
create policy hermes_vfx_admin_delete on storage.objects
 for delete to authenticated using(bucket_id='alea-combat-animations' and (select private.is_admin()));
