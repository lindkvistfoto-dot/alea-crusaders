create table public.campaign_map_academy (
  map_id uuid primary key,
  campaign_id uuid not null,
  configuration jsonb not null,
  revision bigint not null default 1,
  constraint campaign_map_academy_map_fk foreign key (map_id, campaign_id)
    references public.campaign_maps (id, campaign_id) on delete cascade,
  constraint campaign_map_academy_format check (
    coalesce(jsonb_typeof(configuration) = 'object'
      and configuration->>'version' = '1'
      and jsonb_typeof(configuration->'lights') = 'array'
      and jsonb_typeof(configuration->'geometry') = 'array', false)
  )
);

create table public.campaign_map_character_positions (
  map_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  position jsonb not null,
  primary key (map_id, character_id),
  foreign key (character_id, campaign_id) references public.characters (id, campaign_id) on delete cascade,
  foreign key (map_id, campaign_id) references public.campaign_maps (id, campaign_id) on delete cascade,
  check (coalesce(jsonb_typeof(position) = 'array' and jsonb_array_length(position) = 2
    and jsonb_typeof(position->0) = 'number' and jsonb_typeof(position->1) = 'number', false))
);

alter table public.campaign_map_academy enable row level security;
alter table public.campaign_map_character_positions enable row level security;
revoke all on public.campaign_map_academy, public.campaign_map_character_positions from anon;
grant select, insert, update, delete on public.campaign_map_academy, public.campaign_map_character_positions to authenticated;

create policy map_academy_manage on public.campaign_map_academy for all to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id))
  with check ((select private.is_admin()) or private.is_campaign_gm(campaign_id));

create policy map_character_positions_manage on public.campaign_map_character_positions for all to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id))
  with check (
    ((select private.is_admin()) or private.is_campaign_gm(campaign_id))
    and exists (select 1 from public.characters c where c.id = character_id
      and c.campaign_id = campaign_map_character_positions.campaign_id and not c.is_npc)
  );

create trigger map_sync_academy after insert or update or delete on public.campaign_map_academy
  for each row execute function private.bump_campaign_map_signal();
create trigger map_sync_character_positions after insert or update or delete on public.campaign_map_character_positions
  for each row execute function private.bump_campaign_map_signal();

create function public.save_campaign_map_academy(
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
begin
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
  return next_revision;
end;
$$;
revoke all on function public.save_campaign_map_academy(uuid, uuid, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.save_campaign_map_academy(uuid, uuid, jsonb, bigint, jsonb) to authenticated;

-- This RPC is the only player read path. Rasterization retains the visual
-- effect of blockers without returning their original geometry.
create function public.read_campaign_map_academy_player(p_map_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  map_row record;
  config jsonb;
  mask jsonb;
  mw integer;
  mh integer;
  dx double precision;
  dy double precision;
  rooms polygon[];
  concealed polygon[];
  blockers polygon[];
  edges lseg[];
  clipped jsonb := null;
  lights jsonb;
begin
  select m.campaign_id, m.width, m.height, a.configuration
    into map_row
    from public.campaign_maps m
    join public.campaign_map_academy a on a.map_id = m.id and a.campaign_id = m.campaign_id
    where m.id = p_map_id and m.player_visible and private.is_campaign_member(m.campaign_id)
      and (select auth.uid()) is not null;
  if not found then return null; end if;
  config := map_row.configuration;
  mask := config->'freeSight';

  with room_shapes as (
    select coalesce(s.status, 'unknown') status,
      case when a.shape_type = 'rect' then polygon(box(
        point((a.shape_data->>'x')::float8, (a.shape_data->>'y')::float8),
        point((a.shape_data->>'x')::float8 + (a.shape_data->>'width')::float8,
              (a.shape_data->>'y')::float8 + (a.shape_data->>'height')::float8)))
      when jsonb_array_length(a.shape_data->'points') >= 3 then
        (select ('(' || string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) || ')')::polygon
          from jsonb_array_elements(a.shape_data->'points') with ordinality p(v,n))
      end as shape
    from public.campaign_map_areas a
    left join public.campaign_location_state s on s.location_id = a.location_id and s.campaign_id = a.campaign_id
    where a.map_id = p_map_id and a.campaign_id = map_row.campaign_id
  )
  select array_agg(shape) filter (where status = 'explored' and shape is not null),
         array_agg(shape) filter (where status <> 'explored' and shape is not null)
    into rooms, concealed from room_shapes;
  concealed := coalesce(concealed, array[]::polygon[]);

  if jsonb_typeof(mask) = 'object' and rooms is not null then
    mw := (mask->>'width')::integer;
    mh := (mask->>'height')::integer;
    if mw between 1 and 1536 and mh between 1 and 1536 then
      dx := map_row.width::float8 / mw;
      dy := map_row.height::float8 / mh;
      with shapes as (
        select item, array_agg(point((v->>0)::float8, (v->>1)::float8) order by n) as pts,
          string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) as coords
        from jsonb_array_elements(config->'geometry') with ordinality g(item, i)
        cross join lateral jsonb_array_elements(item->'points') with ordinality p(v,n)
        where item->'light' = 'true'::jsonb
        group by i,item
      )
      select array_agg(('(' || coords || ')')::polygon) filter (where item->'closed' = 'true'::jsonb and cardinality(pts) >= 3)
        into blockers from shapes;
      select array_agg(lseg(point((v->>0)::float8,(v->>1)::float8), point((w->>0)::float8,(w->>1)::float8)))
        into edges
        from jsonb_array_elements(config->'geometry') g(item)
        cross join lateral jsonb_array_elements(item->'points') with ordinality p(v,n)
        cross join lateral (select item->'points'->(n::int % jsonb_array_length(item->'points')) as w) next
        where item->'light' = 'true'::jsonb and (item->'closed' = 'true'::jsonb or n < jsonb_array_length(item->'points'));
      with candidates as (
        select i, point((i % mw + .5) * dx, (i / mw + .5) * dy) as p
        from jsonb_array_elements(mask->'runs') r(v)
        cross join lateral generate_series(greatest(0,(v->>0)::int),
          least(mw * mh - 1, (v->>0)::int + (v->>1)::int - 1)) as i
      ), visible as (
        select distinct i from candidates c
        where exists (select 1 from unnest(rooms) room where room @> c.p)
          and not exists (select 1 from unnest(concealed) room where room @> c.p)
          and not exists (select 1 from unnest(blockers) b where b @> c.p)
          and not exists (select 1 from unnest(edges) e where e <-> c.p <= .5 * sqrt(dx*dx+dy*dy))
      ), runs as (
        select min(i) as start, count(*) as len
        from (select i, i - row_number() over(order by i) as grp from visible) v group by grp
      )
      select jsonb_build_object('width',mw,'height',mh,'runs',
        coalesce(jsonb_agg(jsonb_build_array(start,len) order by start),'[]'::jsonb)) into clipped from runs;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',origin, 'type',item->'type', 'color',item->'color', 'intensity',item->'intensity',
    'beam',item->'beam', 'beamWidth',item->'beamWidth', 'edgeSoftness',item->'edgeSoftness',
    'range',item->'range', 'height',item->'height', 'direction',case
      when item->>'type' in ('solljus','manljus')
        and jsonb_typeof(config->'north') = 'number'
        and jsonb_typeof(item->'direction') = 'number'
      then to_jsonb((item->>'direction')::numeric + (config->>'north')::numeric - 90)
      else item->'direction' end,
    'aperture',item->'aperture', 'inclination',item->'inclination', 'motion',item->'motion', 'on',true
  ) order by ordinal),'[]'::jsonb) into lights
  from jsonb_array_elements(config->'lights') with ordinality g(item,ordinal)
  left join public.campaign_map_character_positions pos on pos.map_id = p_map_id
    and pos.campaign_id = map_row.campaign_id and pos.character_id::text = item->>'characterId'
  cross join lateral (select case when coalesce(item->>'characterId','') = '' then item->'position' else pos.position end as origin) f
  where clipped is not null and item->'playerVisible' = 'true'::jsonb and item->'on' = 'true'::jsonb
    and exists (select 1 from unnest(rooms) room where room @> point((origin->>0)::float8,(origin->>1)::float8))
    and not exists (select 1 from unnest(concealed) room where room @> point((origin->>0)::float8,(origin->>1)::float8));

  return jsonb_build_object('darkness',config->'darkness','pixelsPerMeter',config->'pixelsPerMeter',
    'freeSight',clipped,'lights',lights,'geometry','[]'::jsonb);
end;
$$;
revoke all on function public.read_campaign_map_academy_player(uuid) from public, anon;
grant execute on function public.read_campaign_map_academy_player(uuid) to authenticated;
