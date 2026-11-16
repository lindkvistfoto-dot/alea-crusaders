create or replace function public.seed_rule_race_attribute_rows()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.rule_race_attributes (race_id, attribute_key, sort_order)
  values
    (new.id,'STY',10),
    (new.id,'FYS',20),
    (new.id,'STO',30),
    (new.id,'SMI',40),
    (new.id,'INT',50),
    (new.id,'PSY',60),
    (new.id,'KAR',70)
  on conflict (race_id,attribute_key) do nothing;
  return new;
end;
$$;

drop trigger if exists rule_races_seed_attribute_rows on public.rule_races;
create trigger rule_races_seed_attribute_rows
after insert on public.rule_races
for each row
execute function public.seed_rule_race_attribute_rows();
