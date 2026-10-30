-- Campaign-scoped sound sharing (applied as Supabase migration alea_shared_audio_v03523).
create table if not exists public.campaign_audio_state(
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 ambience_cue_key text references public.rule_sound_cues(cue_key) on delete set null,
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.campaign_audio_events(
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 cue_key text not null references public.rule_sound_cues(cue_key) on delete restrict,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
create index if not exists campaign_audio_events_recent_idx on public.campaign_audio_events(campaign_id,created_at desc);
alter table public.campaign_audio_state enable row level security;
alter table public.campaign_audio_events enable row level security;
revoke all on public.campaign_audio_state from public,anon,authenticated;
revoke all on public.campaign_audio_events from public,anon,authenticated;
grant select,insert,update on public.campaign_audio_state to authenticated;
grant select,insert on public.campaign_audio_events to authenticated;
create policy campaign_audio_state_member_read on public.campaign_audio_state for select to authenticated
 using (private.is_campaign_member(campaign_id) or private.is_campaign_gm(campaign_id) or private.is_admin());
create policy campaign_audio_state_gm_insert on public.campaign_audio_state for insert to authenticated
 with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy campaign_audio_state_gm_update on public.campaign_audio_state for update to authenticated
 using (private.is_campaign_gm(campaign_id) or private.is_admin())
 with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy campaign_audio_events_member_read on public.campaign_audio_events for select to authenticated
 using (private.is_campaign_member(campaign_id) or private.is_campaign_gm(campaign_id) or private.is_admin());
create policy campaign_audio_events_gm_insert on public.campaign_audio_events for insert to authenticated
 with check ((private.is_campaign_gm(campaign_id) or private.is_admin()) and created_by=(select auth.uid()));
do $publication$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_audio_state') then
   alter publication supabase_realtime add table public.campaign_audio_state;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_audio_events') then
   alter publication supabase_realtime add table public.campaign_audio_events;
  end if;
 end if;
end;
$publication$;
insert into public.rule_sound_cues(cue_key,title,category,volume) values
 ('magic.fire','Eldmagi','magic',0.82),
 ('magic.heal','Helning','magic',0.67),
 ('magic.antimagic','Antimagi','magic',0.72),
 ('ambience.rain','Regn','ambience',0.46),
 ('ambience.wind','Vind','ambience',0.40),
 ('ambience.cave','Grotta','ambience',0.40),
 ('ambience.tavern','Värdshus','ambience',0.43),
 ('ambience.thunder','Åska','ambience',0.85),
 ('ambience.door','Dörr','ambience',0.62),
 ('ambience.ghost','Andar','ambience',0.62),
 ('ambience.battle','Stridsmuller','ambience',0.68)
on conflict (cue_key) do nothing;
