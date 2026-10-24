-- Extend HERMES jobs for race-owned poses without breaking existing combatant jobs.
alter table public.hermes_web_jobs add column if not exists race_pose_id uuid references public.race_battle_poses(id) on delete restrict;
alter table public.hermes_web_jobs alter column pose_id drop not null;
alter table public.hermes_web_jobs drop constraint if exists hermes_web_jobs_pose_owner_check;
alter table public.hermes_web_jobs add constraint hermes_web_jobs_pose_owner_check check ((pose_id is not null) <> (race_pose_id is not null));
alter table public.hermes_web_jobs drop constraint if exists hermes_web_jobs_asset_kind_check;
alter table public.hermes_web_jobs add constraint hermes_web_jobs_asset_kind_check check (
 (pose_id is not null and asset_kind='battle-pose-cutout') or
 (race_pose_id is not null and asset_kind='race-battle-pose-cutout'));
alter table public.hermes_web_jobs drop constraint if exists hermes_web_jobs_source_path_check;
alter table public.hermes_web_jobs add constraint hermes_web_jobs_source_path_check check (
 (pose_id is not null and source_path ~ '^battle-pose/[a-z0-9_-]+/[0-9a-f-]{36}/[a-z0-9_]+/[0-9a-f-]{36}\\.(png|webp)$') or
 (race_pose_id is not null and source_path ~ '^race-battle-pose/[a-z0-9_-]+/(male|female|neutral)/[a-z0-9_]+/[0-9a-f-]{36}\\.(png|webp)$'));
create unique index if not exists hermes_web_jobs_race_pose_source_unique on public.hermes_web_jobs(race_pose_id,source_path) where race_pose_id is not null;

-- Administrative race-pose jobs must match the staged asset and its owner.
-- Preserve the original administrative gate for individual combatant poses.
drop policy if exists hermes_web_jobs_admin_insert on public.hermes_web_jobs;
create policy hermes_web_jobs_admin_insert on public.hermes_web_jobs
for insert to authenticated
with check (
 (select private.is_admin())
 and requested_by = (select auth.uid())
 and state = 'queued' and attempts = 0
 and archive_drive_file_id is null and output_path is null
 and error_code is null and completed_at is null and source_sha256 is null
 and (
   (pose_id is not null and exists (
     select 1 from public.combatant_battle_poses p
     where p.id = pose_id and ((p.staging_path = source_path and p.publication_status in ('draft','queued')) or (p.pending_staging_path = source_path and p.publication_status = 'published'))
   ))
   or
   (race_pose_id is not null and exists (
     select 1 from public.race_battle_poses p
     where p.id = race_pose_id and ((p.staging_path = source_path and p.publication_status in ('draft','queued')) or (p.pending_staging_path = source_path and p.publication_status = 'published'))
   ))
 )
);
