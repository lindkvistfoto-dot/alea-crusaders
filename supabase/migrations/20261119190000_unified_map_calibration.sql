-- Physical scale belongs to the map. Preserve existing two-point measurements.
update public.campaign_maps m
set pixels_per_meter = round((a.configuration->>'pixelsPerMeter')::numeric,4)
from public.campaign_map_academy a
where m.id = a.map_id and m.campaign_id = a.campaign_id and m.pixels_per_meter is null
  and jsonb_typeof(a.configuration->'pixelsPerMeter') = 'number'
  and round((a.configuration->>'pixelsPerMeter')::numeric,4) between 0.0001 and 99999999.9999;

-- Keep the existing campaign renderer and old clients on the calibrated scale.
create function private.reflect_campaign_map_scale() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.campaign_map_academy
    set configuration = jsonb_set(configuration, '{pixelsPerMeter}', to_jsonb(new.pixels_per_meter)),
        revision = revision + 1
    where map_id = new.id and campaign_id = new.campaign_id
      and configuration->'pixelsPerMeter' is distinct from to_jsonb(new.pixels_per_meter);
  return new;
end;
$$;
create trigger reflect_campaign_map_scale after update of pixels_per_meter on public.campaign_maps
  for each row when (old.pixels_per_meter is distinct from new.pixels_per_meter and new.pixels_per_meter is not null)
  execute function private.reflect_campaign_map_scale();

create or replace function public.save_campaign_map_academy(
  p_map_id uuid, p_campaign_id uuid, p_configuration jsonb,
  p_revision bigint, p_positions jsonb
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_revision bigint;
  change jsonb;
  calibrated numeric(12,4);
  previous_scale numeric(12,4);
begin
  -- Lock in map → academy order, including a simultaneous two-point calibration.
  select pixels_per_meter into previous_scale from public.campaign_maps
    where id = p_map_id and campaign_id = p_campaign_id for update;
  if not found then raise exception 'Kartan är inte tillgänglig.'; end if;
  -- A two-point measurement can change even before the first academy revision exists.
  if p_configuration ? 'expectedMapScale' then
    if previous_scale is distinct from (p_configuration->>'expectedMapScale')::numeric then
      raise exception 'Kartans skala har ändrats. Öppna kartan på nytt.';
    end if;
    p_configuration := p_configuration - 'expectedMapScale';
  end if;
  calibrated := (p_configuration->>'pixelsPerMeter')::numeric;
  if calibrated is not null then
    if calibrated <= 0 then raise exception 'Kartans skala måste vara positiv.'; end if;
    p_configuration := jsonb_set(p_configuration, '{pixelsPerMeter}', to_jsonb(calibrated));
  end if;
  if p_revision = 0 then
    insert into public.campaign_map_academy (map_id, campaign_id, configuration)
      values (p_map_id, p_campaign_id, p_configuration)
      on conflict (map_id) do nothing
      returning revision into next_revision;
  else
    update public.campaign_map_academy
      set configuration = p_configuration, revision = revision + 1
      where map_id = p_map_id and campaign_id = p_campaign_id and revision = p_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then
    raise exception 'Kartans inställningar har ändrats. Öppna kartan på nytt.';
  end if;

  for change in select value from pg_catalog.jsonb_array_elements(p_positions) loop
    if change->'position' = 'null'::jsonb then
      delete from public.campaign_map_character_positions
        where map_id = p_map_id and campaign_id = p_campaign_id and character_id = (change->>'character_id')::uuid;
    else
      insert into public.campaign_map_character_positions (map_id, campaign_id, character_id, position)
        values (p_map_id, p_campaign_id, (change->>'character_id')::uuid, change->'position')
        on conflict (map_id, character_id) do update set position = excluded.position;
    end if;
  end loop;
  if calibrated is not null then
    update public.campaign_maps
      set pixels_per_meter = calibrated, scale_point_a = null, scale_point_b = null, scale_distance_m = null
      where id = p_map_id and campaign_id = p_campaign_id and pixels_per_meter is distinct from calibrated;
  end if;
  return next_revision;
end;
$$;
revoke all on function public.save_campaign_map_academy(uuid, uuid, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.save_campaign_map_academy(uuid, uuid, jsonb, bigint, jsonb) to authenticated;

