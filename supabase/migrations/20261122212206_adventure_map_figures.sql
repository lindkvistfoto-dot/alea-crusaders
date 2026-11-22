-- A session's visit to a campaign map is its play instance. The academy
-- configuration and preparation positions remain properties of the map.
create table public.adventure_map_figures (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  session_id uuid not null,
  map_id uuid not null,
  character_id uuid,
  npc_character_id uuid,
  npc_id uuid,
  monster_id uuid,
  name text not null,
  race text,
  gender text,
  q integer not null,
  r integer not null,
  player_visible boolean not null default true,
  check (num_nonnulls(character_id, npc_character_id, npc_id, monster_id) = 1),
  foreign key (session_id, campaign_id) references public.game_sessions(id, campaign_id) on delete cascade,
  foreign key (map_id, campaign_id) references public.campaign_maps(id, campaign_id) on delete cascade,
  foreign key (character_id, campaign_id) references public.characters(id, campaign_id) on delete cascade,
  foreign key (npc_character_id, campaign_id) references public.characters(id, campaign_id) on delete cascade,
  foreign key (npc_id, campaign_id) references public.campaign_npcs(id, campaign_id) on delete cascade,
  foreign key (monster_id, campaign_id) references public.campaign_monsters(id, campaign_id) on delete cascade,
  unique (session_id, character_id),
  unique (session_id, map_id, q, r)
);

alter table public.adventure_map_figures enable row level security;
revoke all on public.adventure_map_figures from public, anon, authenticated;
grant select, insert, update, delete on public.adventure_map_figures to authenticated;

create policy adventure_figures_manage on public.adventure_map_figures for all to authenticated
  using ((select private.is_admin()) or private.is_campaign_gm(campaign_id))
  with check ((select private.is_admin()) or private.is_campaign_gm(campaign_id));

create policy adventure_figures_player_read on public.adventure_map_figures for select to authenticated
  using (player_visible and private.is_campaign_member(campaign_id) and exists (
    select 1 from public.campaign_maps m
    where m.id = adventure_map_figures.map_id and m.campaign_id = adventure_map_figures.campaign_id and m.player_visible
  ));

create function private.validate_adventure_figure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  board record;
  pitch float8;
  hex_size float8;
  x float8;
  y float8;
  mask jsonb;
  mask_cell integer;
begin
  if not exists (select 1 from public.game_sessions s where s.id = new.session_id
      and s.campaign_id = new.campaign_id and s.status = 'active') then
    raise exception 'Spelmötet är inte aktivt.';
  end if;
  if coalesce(new.character_id, new.npc_character_id) is not null and not exists (
    select 1 from public.characters c where c.id = coalesce(new.character_id, new.npc_character_id)
      and c.campaign_id = new.campaign_id and c.is_npc = (new.npc_character_id is not null)
  ) then raise exception 'Rollpersonen eller SLP:n tillhör inte detta register.'; end if;
  select m.width, m.height, a.configuration config, (to_jsonb(m)->>'pixels_per_meter')::float8 map_scale
    into strict board from public.campaign_maps m left join public.campaign_map_academy a on a.map_id = m.id
    where m.id = new.map_id and m.campaign_id = new.campaign_id;
  pitch := coalesce((board.config->>'pixelsPerMeter')::float8 * 1.5, board.map_scale * 1.5, board.height / 30.0);
  hex_size := pitch / 1.5;
  x := sqrt(3.0::float8) * hex_size * (new.q + new.r / 2.0);
  y := pitch * new.r;
  if pitch <= 0 or x - sqrt(3.0::float8)*hex_size/2 < 0 or x + sqrt(3.0::float8)*hex_size/2 > board.width
      or y - hex_size < 0 or y + hex_size > board.height then
    raise exception 'Hexagonen ligger utanför kartan.';
  end if;
  mask := board.config->'freeSight';
  if jsonb_array_length(mask->'runs') > 0 then
    mask_cell := floor(y * (mask->>'height')::int / board.height)::int * (mask->>'width')::int
               + floor(x * (mask->>'width')::int / board.width)::int;
    if not exists (select 1 from jsonb_array_elements(mask->'runs') run
        where mask_cell >= (run->>0)::int and mask_cell < (run->>0)::int + (run->>1)::int) then
      raise exception 'Hexagonen ligger i ett solitt område.';
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements(board.config->'geometry') shape
    where shape->'closed' = 'true' and shape->'movement' = 'true' and (
      select ('(' || string_agg(format('(%s,%s)', p->>0, p->>1), ',' order by n) || ')')::polygon
      from jsonb_array_elements(shape->'points') with ordinality pts(p,n)
    ) @> point(x,y)) then raise exception 'Hexagonen är blockerad.'; end if;
  return new;
end;
$$;

create trigger adventure_figure_position before insert or update of q, r, map_id, session_id, campaign_id, character_id, npc_character_id, npc_id, monster_id
  on public.adventure_map_figures for each row execute function private.validate_adventure_figure();

-- Realtime carries only the existing campaign revision, never actor data.
-- Entirely hidden changes do not signal their existence to player clients.
create trigger adventure_figure_add after insert on public.adventure_map_figures for each row
  when (new.player_visible) execute function private.bump_campaign_map_signal();
create trigger adventure_figure_move after update on public.adventure_map_figures for each row
  when (old.player_visible or new.player_visible) execute function private.bump_campaign_map_signal();
create trigger adventure_figure_remove after delete on public.adventure_map_figures for each row
  when (old.player_visible) execute function private.bump_campaign_map_signal();
