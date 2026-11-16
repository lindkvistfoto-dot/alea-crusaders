revoke all on function public.init_campaign_day_state() from public;
revoke all on function public.init_campaign_day_state() from anon;
revoke all on function public.init_campaign_day_state() from authenticated;

create index if not exists campaign_day_history_started_by_idx
  on public.campaign_day_history (started_by);

create index if not exists campaign_day_state_updated_by_idx
  on public.campaign_day_state (updated_by);

create index if not exists character_erf_awards_awarded_by_idx
  on public.character_erf_awards (awarded_by);
