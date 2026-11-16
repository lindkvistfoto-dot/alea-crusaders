-- HERMES private portrait delivery for campaign-independent SLPs.
-- Keep the existing campaign NPC and monster policies unchanged.
drop policy if exists global_npc_portraits_select on storage.objects;
create policy global_npc_portraits_select on storage.objects
for select to authenticated using (
  bucket_id = 'campaign-actor-images'
  and exists (
    select 1 from public.global_npcs n
    where n.image_path = storage.objects.name
      and (
        (select private.is_admin())
        or exists (select 1 from public.campaigns c where private.is_campaign_gm(c.id))
      )
  )
);

-- A campaign copy retains the global portrait but never mutates its original.
create or replace function public.add_global_npc_to_campaign(p_global_npc_id uuid,p_campaign_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_npc_id uuid;
begin
  if not ((select private.is_admin()) or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Not authorized for this campaign';
  end if;
  insert into public.campaign_npcs(
    campaign_id,npc_key,name,title,description,gm_notes,player_visible,active,
    created_by,attributes,skills,weapons,shield,armor,race,gender,profession,spells,
    image_path,source_global_npc_id
  )
  select p_campaign_id, 'library-'||g.npc_key||'-'||left(gen_random_uuid()::text,8),
    g.name,g.title,g.description,
    concat_ws(E'\n\n',nullif(g.gm_notes,''), 'Bakgrund: '||g.background,
      'Drivkraft: '||g.motivation,'Svaghet: '||g.weakness,'Relationer: '||g.relationships,
      'Hemligheter: '||g.secrets,'Äventyrskrokar: '||g.hooks::text,
      'Övrig utrustning: '||g.equipment_notes::text),
    false,true,(select auth.uid()),g.attributes,g.skills,g.weapons,g.shield,g.armor,
    g.race,g.gender,g.profession,g.spells,g.image_path,g.id
  from public.global_npcs g where g.id=p_global_npc_id
  returning id into v_npc_id;
  if v_npc_id is null then raise exception 'Global NPC not found or not visible'; end if;
  return v_npc_id;
end $$;
revoke execute on function public.add_global_npc_to_campaign(uuid,uuid) from public,anon;
grant execute on function public.add_global_npc_to_campaign(uuid,uuid) to authenticated;
