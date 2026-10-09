-- Production migration name: alea_location_ambience_v03524
-- v0.35.24: attach ambient sound cues to rooms and places; track GM activated place.
alter table public.campaign_locations
 add column if not exists ambience_cue_key text references public.rule_sound_cues(cue_key) on delete set null;
alter table public.campaign_audio_state
 add column if not exists source_location_id uuid references public.campaign_locations(id) on delete set null;
insert into public.rule_sound_cues(cue_key,title,category,volume) values
 ('ambience.forest','Skog och nattfåglar','ambience',0.42),
 ('ambience.water','Rinnande vatten','ambience',0.48),
 ('ambience.ruins','Övergivna ruiner','ambience',0.46),
 ('ambience.crypt','Krypta och viskningar','ambience',0.52),
 ('ambience.fire','Brasa','ambience',0.40),
 ('ambience.night','Nattens vind','ambience',0.42)
on conflict (cue_key) do nothing;
update public.campaign_locations
set ambience_cue_key = case name
 when 'Kyrkan' then 'ambience.crypt'
 when 'Vattenfallet' then 'ambience.water'
 when 'Kvarnruinen' then 'ambience.ruins'
 when 'Skogsgläntan – gravplatsen' then 'ambience.forest'
 when 'Den övervuxna åkern' then 'ambience.wind'
 when 'Pionjärens grav' then 'ambience.night'
 when 'Det rasade gravkapellet' then 'ambience.crypt'
 else ambience_cue_key end
where site_id='fec56253-9405-426b-baba-71c483430a3a'
  and ambience_cue_key is null
  and name in ('Kyrkan','Vattenfallet','Kvarnruinen','Skogsgläntan – gravplatsen',
               'Den övervuxna åkern','Pionjärens grav','Det rasade gravkapellet');
