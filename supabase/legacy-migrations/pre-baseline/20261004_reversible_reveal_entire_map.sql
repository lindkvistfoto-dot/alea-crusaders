-- Alea Crusaders - reversible reveal entire map
-- "Reveal entire map" is a batch action that sets mapped locations to explored.
-- Fog-of-war is always controlled by each room/location status afterwards.

update public.campaign_maps
set fully_revealed = false
where fully_revealed = true;

create or replace function public.reveal_campaign_map(p_map_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  select m.campaign_id
    into v_campaign_id
  from public.campaign_maps m
  where m.id = p_map_id;

  if v_campaign_id is null then
    raise exception 'Kartan finns inte.';
  end if;

  if not (
    private.is_admin()
    or private.is_campaign_gm(v_campaign_id)
  ) then
    raise exception 'Du har inte behörighet att låsa upp kartan.';
  end if;

  update public.campaign_maps
  set
    fully_revealed = false,
    player_visible = true,
    first_activated_at = coalesce(first_activated_at, now()),
    last_activated_at = now(),
    updated_at = now()
  where id = p_map_id;

  insert into public.campaign_location_state (
    location_id,
    campaign_id,
    status,
    updated_by,
    updated_at
  )
  select distinct
    a.location_id,
    v_campaign_id,
    'explored',
    auth.uid(),
    now()
  from public.campaign_map_areas a
  join public.campaign_locations l
    on l.id = a.location_id
   and l.campaign_id = v_campaign_id
  where a.map_id = p_map_id
    and a.location_id is not null
  on conflict (location_id)
  do update set
    campaign_id = excluded.campaign_id,
    status = 'explored',
    updated_by = auth.uid(),
    updated_at = now();

  return p_map_id;
end;
$$;

revoke all on function public.reveal_campaign_map(uuid) from public;
revoke all on function public.reveal_campaign_map(uuid) from anon;
grant execute on function public.reveal_campaign_map(uuid) to authenticated;
