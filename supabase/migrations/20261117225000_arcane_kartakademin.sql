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

create policy map_academy_read on public.campaign_map_academy for select to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id) or exists (
    select 1 from public.campaign_maps m where m.id = map_id and m.player_visible
      and private.is_campaign_member(m.campaign_id)
  ));
create policy map_academy_manage on public.campaign_map_academy for all to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id))
  with check ((select private.is_admin()) or private.is_campaign_gm(campaign_id));

create policy map_character_positions_read on public.campaign_map_character_positions for select to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id) or exists (
    select 1 from public.campaign_maps m where m.id = map_id and m.player_visible
      and private.is_campaign_member(m.campaign_id)
      and exists (select 1 from public.campaign_map_academy a where a.map_id = m.id)
  ));
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
