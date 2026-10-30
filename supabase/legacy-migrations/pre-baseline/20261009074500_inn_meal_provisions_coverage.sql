-- v0.35.10 — Inn meals cover the day of purchase without using packed provisions.
-- The inn checkout writes character.data.innMealDay = CURRENT campaign day.
-- Only an actual day transition can consume provisions; a covered day is exempt.
-- A meal affects the paying character only. Drink and lodging don't grant coverage.
-- Buying packaged travel rations adds to data.provisionsDays, not innMealDay.
-- Preserve the existing after-update day trigger and atomically refresh its function.

create or replace function public.consume_character_provisions_on_day_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_elapsed integer;
begin
  v_elapsed := new.day_number - old.day_number;
  if v_elapsed <= 0 then
    return new;
  end if;

  update public.characters c
  set data = jsonb_set(
      c.data,
      '{provisionsDays}',
      to_jsonb(greatest(
        0,
        (case
          when coalesce(c.data->>'provisionsDays','') ~ '^[0-9]{1,6}$'
            then (c.data->>'provisionsDays')::integer
          else 0
         end) - greatest(
           0,
           v_elapsed - (case
             when coalesce(c.data->>'innMealDay','') ~ '^[0-9]{1,6}$'
             then (case
               when (c.data->>'innMealDay')::integer >= old.day_number
                and (c.data->>'innMealDay')::integer < new.day_number
               then 1 else 0
             end)
             else 0
           end)
         )
      )),
      true
    ),
    updated_at = now()
  where c.campaign_id = new.campaign_id
    and c.data ? 'provisionsDays';

  return new;
end
$$;

revoke all on function public.consume_character_provisions_on_day_change() from public;
revoke all on function public.consume_character_provisions_on_day_change() from anon;
revoke all on function public.consume_character_provisions_on_day_change() from authenticated;
