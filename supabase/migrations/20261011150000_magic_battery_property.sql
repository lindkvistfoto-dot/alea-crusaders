-- v0.35.103 — one-shot magical batteries; reusable definitions remain admin-only.
-- The actual loaded spell/EG/FV/charger are stored on the owned item in characters.data.
-- No stored charge or PSY is shared with artifact masters.
alter table public.rule_magic_artifact_powers
 add column if not exists battery_grade_mode text not null default 'chosen'
 check (battery_grade_mode in ('chosen','dice'));
alter table public.rule_magic_artifact_powers
 add column if not exists battery_grade_dice text not null default '1T3'
 check (length(battery_grade_dice) between 2 and 16);

insert into public.rule_magic_property_definitions
 (property_key,name,kind,description,sort_order,active)
values ('magic_battery','Magiskt batteri','spell',
 'Lagra en besvärjelse och dess effektgrad vid laddning. Laddaren betalar PSY; ett laddat batteri kan kasta den som kvick. EG väljs vid laddning eller slås exempelvis med 1T3.',15,true)
on conflict (property_key) do update set
 name=excluded.name,description=excluded.description,active=true;

create or replace function public.validate_magic_artifact_power()
returns trigger language plpgsql set search_path = '' as $$
declare power_kind text;
declare power_key text;
begin
 select d.kind,d.property_key into power_kind,power_key
 from public.rule_magic_property_definitions d where d.id=new.property_id;
 if power_kind is null then raise exception 'Magisk egenskap finns inte'; end if;
 if power_kind='spell' and power_key<>'magic_battery' and new.spell_id is null then
  raise exception 'Besvärjelseegenskap kräver registrerad besvärjelse';
 elsif power_kind<>'spell' and new.spell_id is not null then
  raise exception 'Endast besvärjelseegenskaper får länka besvärjelser';
 elsif power_key='magic_battery' and new.spell_id is not null then
  raise exception 'Magiskt batteri får besvärjelsen först vid laddning';
 end if;
 if power_key='magic_battery' and new.battery_grade_mode='dice' then
  if new.battery_grade_dice !~ '^[1-9][0-9]?T(3|4|6|8|10|12|20)([+-][0-9]{1,2})?$'
  then raise exception 'Ogiltig EG-tärning för magiskt batteri'; end if;
 end if;
 return new;
end $$;

comment on column public.rule_magic_artifact_powers.battery_grade_mode is
 'Chosen: charger selects EG; dice: evaluate battery_grade_dice at charging time.';
comment on column public.rule_magic_artifact_powers.battery_grade_dice is
 'EG dice notation, e.g. 1T3, only interpreted when battery_grade_mode=dice.';
comment on table public.rule_magic_artifact_powers is
 'Reusable power configuration. Individual battery contents live solely on the owning character item.';
revoke all on function public.validate_magic_artifact_power() from public,anon,authenticated;