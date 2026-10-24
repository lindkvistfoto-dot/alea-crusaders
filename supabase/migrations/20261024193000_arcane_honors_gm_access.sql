-- Authenticated GM and central admin access. Secret awards stay unreadable to ordinary players.
create policy honor_definitions_admin_select on public.honor_definitions for select to authenticated
using (
 exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or (campaign_id is not null and exists(select 1 from public.campaign_members m where m.campaign_id=honor_definitions.campaign_id and m.user_id=(select auth.uid()) and m.role='gm'))
);
create policy honor_definitions_admin_insert on public.honor_definitions for insert to authenticated
with check (
 created_by=(select auth.uid()) and
 (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or (campaign_id is not null and exists(select 1 from public.campaign_members m where m.campaign_id=honor_definitions.campaign_id and m.user_id=(select auth.uid()) and m.role='gm')))
);
create policy honor_definitions_admin_update on public.honor_definitions for update to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or (campaign_id is not null and exists(select 1 from public.campaign_members m where m.campaign_id=honor_definitions.campaign_id and m.user_id=(select auth.uid()) and m.role='gm')))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or (campaign_id is not null and exists(select 1 from public.campaign_members m where m.campaign_id=honor_definitions.campaign_id and m.user_id=(select auth.uid()) and m.role='gm')));
create policy honor_grants_gm_select on public.honor_grants for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or exists(select 1 from public.characters c join public.campaign_members m on m.campaign_id=c.campaign_id where c.id=honor_grants.character_id and m.user_id=(select auth.uid()) and m.role='gm'));
create policy honor_grants_gm_insert on public.honor_grants for insert to authenticated
with check (granted_by=(select auth.uid()) and exists (
 select 1 from public.honor_definitions d join public.characters c on c.id=honor_grants.character_id
 where d.id=honor_grants.honor_id and
 (d.campaign_id is null or d.campaign_id=c.campaign_id) and
 (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_admin=true)
 or exists(select 1 from public.campaign_members m where m.campaign_id=c.campaign_id and m.user_id=(select auth.uid()) and m.role='gm'))
));
grant select,insert,update on public.honor_definitions to authenticated;
grant select,insert on public.honor_grants to authenticated;
