create table if not exists public.rule_weapons (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('melee','projectile','thrown')),
  handling text not null check (handling in ('1H','1-2H','2H')),
  strength_group integer not null check (strength_group >= 0),
  name text not null,
  damage text not null default '',
  weapon_length integer null check (weapon_length is null or weapon_length >= 0),
  bep numeric(8,2) not null default 0 check (bep >= 0),
  bv integer null,
  weapon_type text not null default '',
  price numeric(10,2) null check (price is null or price >= 0),
  range_text text not null default '',
  reload_rounds integer null check (reload_rounds is null or reload_rounds >= 0),
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, name)
);

alter table public.rule_weapons enable row level security;

drop policy if exists rule_weapons_select on public.rule_weapons;
create policy rule_weapons_select on public.rule_weapons
for select to authenticated using (true);

drop policy if exists rule_weapons_insert on public.rule_weapons;
create policy rule_weapons_insert on public.rule_weapons
for insert to authenticated with check ((select private.is_admin()));

drop policy if exists rule_weapons_update on public.rule_weapons;
create policy rule_weapons_update on public.rule_weapons
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists rule_weapons_delete on public.rule_weapons;
create policy rule_weapons_delete on public.rule_weapons
for delete to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.rule_weapons to authenticated;

create or replace function public.rule_strength_group(p_strength numeric)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_strength is null or p_strength < 0 then null
    when p_strength <= 3 then 0
    when p_strength <= 8 then 1
    when p_strength <= 12 then 2
    when p_strength <= 16 then 3
    when p_strength <= 20 then 4
    when p_strength <= 25 then 5
    when p_strength <= 30 then 6
    when p_strength <= 40 then 7
    when p_strength <= 50 then 8
    when p_strength <= 60 then 9
    when p_strength <= 70 then 10
    when p_strength <= 80 then 11
    when p_strength <= 90 then 12
    when p_strength <= 100 then 13
    when p_strength <= 110 then 14
    when p_strength <= 120 then 15
    when p_strength <= 130 then 16
    when p_strength <= 140 then 17
    when p_strength <= 150 then 18
    when p_strength <= 160 then 19
    when p_strength <= 170 then 20
    when p_strength <= 180 then 21
    when p_strength <= 190 then 22
    when p_strength <= 200 then 23
    when p_strength <= 210 then 24
    when p_strength <= 220 then 25
    when p_strength <= 230 then 26
    when p_strength <= 240 then 27
    when p_strength <= 250 then 28
    when p_strength <= 260 then 29
    when p_strength <= 270 then 30
    when p_strength <= 280 then 31
    when p_strength <= 290 then 32
    when p_strength <= 300 then 33
    else 33 + ceil((p_strength - 300) / 10.0)::integer
  end
$$;

create or replace function public.rule_weapon_grip(
  p_handling text,
  p_weapon_strength_group integer,
  p_character_strength_group integer
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_required integer := p_weapon_strength_group;
  v_hands integer;
  v_gl_multiplier numeric := 1.0;
  v_status text := 'normal';
  v_can_use boolean := true;
begin
  if p_handling not in ('1H','1-2H','2H')
     or v_required is null
     or p_character_strength_group is null then
    return jsonb_build_object('can_use',false,'hands',null,'gl_multiplier',0,'status','invalid');
  end if;

  if p_handling = '1H' then
    v_hands := 1;
    if p_character_strength_group >= v_required then
      null;
    elsif p_character_strength_group = v_required - 1 then
      v_gl_multiplier := 0.5; v_status := 'understrength';
    else
      v_can_use := false; v_gl_multiplier := 0; v_status := 'too_weak';
    end if;
  elsif p_handling = '2H' then
    v_hands := 2;
    if p_character_strength_group >= v_required then
      null;
    elsif p_character_strength_group = v_required - 1 then
      v_gl_multiplier := 0.5; v_status := 'understrength';
    else
      v_can_use := false; v_gl_multiplier := 0; v_status := 'too_weak';
    end if;
  else
    if p_character_strength_group >= v_required + 1 then
      v_hands := 1;
    elsif p_character_strength_group = v_required then
      v_hands := 2;
    elsif p_character_strength_group = v_required - 1 then
      v_hands := 2; v_gl_multiplier := 0.5; v_status := 'understrength';
    else
      v_hands := 2; v_can_use := false; v_gl_multiplier := 0; v_status := 'too_weak';
    end if;
  end if;

  return jsonb_build_object(
    'can_use',v_can_use,
    'hands',v_hands,
    'gl_multiplier',v_gl_multiplier,
    'status',v_status
  );
end
$$;

revoke all on function public.rule_strength_group(numeric) from public;
revoke all on function public.rule_weapon_grip(text,integer,integer) from public;
grant execute on function public.rule_strength_group(numeric) to authenticated;
grant execute on function public.rule_weapon_grip(text,integer,integer) to authenticated;
