-- Attach a combat runtime to its originating game session without changing
-- existing combat or session records. The composite FK prevents cross-campaign
-- links; RESTRICT preserves session history while linked combats exist.
alter table public.combat_instances
  add column if not exists session_id uuid;

create index if not exists combat_instances_campaign_session_idx
  on public.combat_instances (campaign_id, session_id)
  where session_id is not null;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.combat_instances'::regclass
      and conname = 'combat_instances_session_campaign_fkey'
  ) then
    alter table public.combat_instances
      add constraint combat_instances_session_campaign_fkey
      foreign key (session_id, campaign_id)
      references public.game_sessions (id, campaign_id)
      on delete restrict
      not valid;
  end if;
end
$migration$;

alter table public.combat_instances
  validate constraint combat_instances_session_campaign_fkey;
