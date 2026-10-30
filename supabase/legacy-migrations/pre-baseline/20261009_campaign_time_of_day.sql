-- v0.35.34 – kampanjtid som synkroniseras för alla deltagare.
alter table public.campaign_day_state add column if not exists time_of_day text not null default 'morning';
do $guard$
begin
 if not exists (select 1 from pg_constraint where conrelid='public.campaign_day_state'::regclass and conname='campaign_day_state_time_of_day_check') then
  alter table public.campaign_day_state add constraint campaign_day_state_time_of_day_check
   check (time_of_day in ('dawn','morning','midday','afternoon','evening','night'));
 end if;
end $guard$;
create or replace function public.reset_campaign_time_on_new_day()
returns trigger language plpgsql security invoker set search_path='' as $body$
begin
 if new.day_number is distinct from old.day_number then new.time_of_day:='morning'; end if;
 return new;
end $body$;
drop trigger if exists campaign_time_reset_on_new_day on public.campaign_day_state;
create trigger campaign_time_reset_on_new_day before update of day_number on public.campaign_day_state
 for each row execute function public.reset_campaign_time_on_new_day();
create or replace function public.set_campaign_time_of_day(p_campaign_id uuid,p_time_of_day text)
returns jsonb language plpgsql security definer set search_path='' as $body$
declare v_state public.campaign_day_state%rowtype;
begin
 if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
  raise exception 'Du har inte behörighet att ändra tiden på dygnet.';
 end if;
 if p_time_of_day is null or p_time_of_day not in ('dawn','morning','midday','afternoon','evening','night') then
  raise exception 'Ogiltig tid på dygnet.';
 end if;
 update public.campaign_day_state set time_of_day=p_time_of_day, updated_by=auth.uid(), updated_at=now()
 where campaign_id=p_campaign_id returning * into v_state;
 if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;
 return to_jsonb(v_state);
end $body$;
revoke all on function public.set_campaign_time_of_day(uuid,text) from public,anon;
grant execute on function public.set_campaign_time_of_day(uuid,text) to authenticated;
do $publication$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='campaign_day_state') then
  alter publication supabase_realtime add table public.campaign_day_state;
 end if;
end $publication$;
