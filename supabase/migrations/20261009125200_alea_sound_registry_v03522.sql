-- Sound cues and public audio files for v0.35.22. Applied to the production
-- project using Supabase migration "alea_sound_registry_v03522".
create table if not exists public.rule_sound_cues (
 cue_key text primary key check (cue_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
 title text not null check (length(title) between 1 and 120),
 category text not null check (category in ('dice','melee','magic','ambience')),
 asset_path text check (asset_path is null or (length(asset_path) between 1 and 240 and asset_path !~ '[?#]')),
 volume numeric(4,3) not null default 0.65 check (volume >= 0 and volume <= 1),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.rule_sound_cues enable row level security;
grant select on public.rule_sound_cues to authenticated;
grant insert,update,delete on public.rule_sound_cues to authenticated;
create policy rule_sound_cues_read on public.rule_sound_cues for select to authenticated using (true);
create policy rule_sound_cues_admin_insert on public.rule_sound_cues for insert to authenticated with check ((select private.is_admin()));
create policy rule_sound_cues_admin_update on public.rule_sound_cues for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy rule_sound_cues_admin_delete on public.rule_sound_cues for delete to authenticated using ((select private.is_admin()));
insert into public.rule_sound_cues(cue_key,title,category,volume) values
 ('dice.roll','Tärningar rullar','dice',0.42),
 ('dice.land','Tärningar landar','dice',0.42),
 ('melee.swing','Vapen svingas','melee',0.68),
 ('melee.hit','Vapenträff','melee',0.8),
 ('melee.parry','Parering','melee',0.84),
 ('melee.miss','Missad attack','melee',0.55),
 ('melee.fumble','Fummel','melee',0.58),
 ('magic.cast','Besvärjelse kastas','magic',0.65),
 ('magic.success','Magi lyckas','magic',0.70),
 ('magic.fail','Magi misslyckas','magic',0.58)
on conflict(cue_key) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('alea-sound-effects','alea-sound-effects',true,8388608,array['audio/mpeg','audio/ogg','audio/wav','audio/webm','audio/mp4','audio/x-wav'])
on conflict(id) do nothing;
create policy alea_sounds_admin_insert on storage.objects for insert to authenticated
 with check (bucket_id='alea-sound-effects' and (select private.is_admin()));
create policy alea_sounds_admin_update on storage.objects for update to authenticated
 using (bucket_id='alea-sound-effects' and (select private.is_admin()))
 with check (bucket_id='alea-sound-effects' and (select private.is_admin()));
create policy alea_sounds_admin_delete on storage.objects for delete to authenticated
 using (bucket_id='alea-sound-effects' and (select private.is_admin()));
create policy alea_sounds_read on storage.objects for select to authenticated
 using (bucket_id='alea-sound-effects');
