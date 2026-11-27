-- Only the topic owner may publish presence. Subscribers never trust a user id in the payload.
create policy party_read_presence on realtime.messages for select to authenticated
using (extension = 'presence' and exists (
  select 1 from public.campaign_members m
  where (select realtime.topic()) = 'party:' || m.campaign_id::text || ':' || m.user_id::text
    and (private.is_campaign_member(m.campaign_id) or private.is_admin())
));
create policy party_track_presence on realtime.messages for insert to authenticated
with check (extension = 'presence' and exists (
  select 1 from public.campaign_members m
  where m.user_id = (select auth.uid())
    and (select realtime.topic()) = 'party:' || m.campaign_id::text || ':' || m.user_id::text
));
