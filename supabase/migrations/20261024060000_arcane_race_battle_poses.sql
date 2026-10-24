-- Race-owned battle poses share the existing HERMES publication lifecycle.
-- Race IDs are stable text identifiers in public.rule_races.
create table if not exists public.race_battle_poses (
 id uuid primary key default gen_random_uuid(),
 race_id text not null references public.rule_races(id) on update cascade on delete restrict,
 gender_variant text not null default 'neutral' check (gender_variant in ('male','female','neutral')),
 pose_key text not null,
 image_path text,
 base_key text not null default 'arcane-bronze-ivory-pointed-hex-high-angle',
 mounting_profile jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 source_drive_file_id text,
 source_sha256 text,
 staging_path text,
 pending_staging_path text,
 pending_base_key text,
 pending_mounting_profile jsonb,
 publication_status text not null default 'draft' check (publication_status in ('draft','pending','published','failed')),
 constraint race_pose_published_asset check (publication_status <> 'published' or (image_path is not null and length(image_path)>0)),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (race_id,gender_variant,pose_key)
);
create index if not exists race_battle_poses_lookup on public.race_battle_poses(race_id,gender_variant,pose_key) where is_active;
alter table public.race_battle_poses enable row level security;
-- No broad client write access; publishing is handled through the existing privileged pipeline.
revoke all on public.race_battle_poses from anon,authenticated;

-- Combat clients may read published active rasposes, never staging or unpublished rows.
grant select (id,race_id,gender_variant,pose_key,image_path,base_key,mounting_profile,is_active,publication_status) on public.race_battle_poses to authenticated;
create policy race_pose_published_read on public.race_battle_poses for select to authenticated using (is_active and publication_status='published' and image_path is not null);
