-- Galadriel v0.34.87: RLS-protected, metadata-free per-campaign Realtime signals.
-- Material titles, object paths, actor data, and GM notes are never in the stream.
create table if not exists public.campaign_material_signals (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 presentation_revision bigint not null default 0 check(presentation_revision >= 0),
 folder_revision bigint not null default 0 check(folder_revision >= 0),
 updated_at timestamptz not null default now()
);
alter table public.campaign_material_signals enable row level security;
revoke all on public.campaign_material_signals from public,anon,authenticated;
grant select on public.campaign_material_signals to authenticated;
drop policy if exists campaign_material_signals_member_read on public.campaign_material_signals;
create policy campaign_material_signals_member_read
 on public.campaign_material_signals for select to authenticated
 using (
   private.is_campaign_member(campaign_id)
   or private.is_campaign_gm(campaign_id)
   or private.is_admin()
 );

create or replace function public.galadriel_signal_material_change()
returns trigger
language plpgsql security definer set search_path=''
as $galadriel$
declare v_campaign uuid;
begin
 v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
 if tg_table_name = 'campaign_material_presentations' then
   insert into public.campaign_material_signals(campaign_id,presentation_revision)
    values(v_campaign,1)
   on conflict(campaign_id) do update set
    presentation_revision=public.campaign_material_signals.presentation_revision+1,
    updated_at=now();
 elsif tg_table_name = 'campaign_material_shares' then
   insert into public.campaign_material_signals(campaign_id,folder_revision)
    values(v_campaign,1)
   on conflict(campaign_id) do update set
    folder_revision=public.campaign_material_signals.folder_revision+1,
    updated_at=now();
 end if;
 return case when tg_op = 'DELETE' then old else new end;
end;
$galadriel$;
revoke all on function public.galadriel_signal_material_change() from public,anon,authenticated;

drop trigger if exists galadriel_presentation_signal on public.campaign_material_presentations;
create trigger galadriel_presentation_signal after insert or update or delete
on public.campaign_material_presentations for each row
execute function public.galadriel_signal_material_change();

drop trigger if exists galadriel_folder_signal on public.campaign_material_shares;
create trigger galadriel_folder_signal after insert or update or delete
on public.campaign_material_shares for each row
execute function public.galadriel_signal_material_change();

-- Keep existing Realtime subscriptions intact; only append the new signal table.
do $galadriel_publication$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
    and not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime'
        and schemaname='public'
        and tablename='campaign_material_signals'
    ) then
   execute 'alter publication supabase_realtime add table public.campaign_material_signals';
 end if;
end;
$galadriel_publication$;
