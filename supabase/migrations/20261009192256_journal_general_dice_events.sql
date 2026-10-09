-- v0.35.33 – include general dice rolls as journal activity.
alter table public.campaign_journal_entries
 drop constraint if exists campaign_journal_entries_event_type_check;
alter table public.campaign_journal_entries
 add constraint campaign_journal_entries_event_type_check
 check (event_type in ('skill','spell','dice','combat','day','note'));
drop policy if exists journal_insert on public.campaign_journal_entries;
create policy journal_insert on public.campaign_journal_entries
 for insert to authenticated
 with check (created_by=(select auth.uid()) and source_key is null and
   ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id))
    or (event_type in ('skill','spell','dice') and player_visible and
        (select private.is_campaign_member(campaign_id)))));
