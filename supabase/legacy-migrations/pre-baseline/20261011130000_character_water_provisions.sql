-- v0.35.97 — Track water independently from packed food in character JSON.
-- This replaces the existing trigger FUNCTION; the existing campaign_day_consume_provisions
-- trigger stays in place. Only real forward campaign-day updates consume stores.
-- Inn meals excuse one food day only, never drinking water; old characters without
-- waterDays are left untouched until their first explicit water edit.
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
    case when c.data ? 'provisionsDays' then
      jsonb_set(
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
      )
    else c.data end,
    '{waterDays}',
    to_jsonb(greatest(
      0,
      (case
        when coalesce(c.data->>'waterDays','') ~ '^[0-9]{1,6}$'
          then (c.data->>'waterDays')::integer
        else 0
       end) - v_elapsed
    )),
    c.data ? 'waterDays'
  ),
  updated_at = now()
  where c.campaign_id = new.campaign_id
    and (c.data ? 'provisionsDays' or c.data ? 'waterDays');

  return new;
end
$$;

revoke all on function public.consume_character_provisions_on_day_change() from public;
revoke all on function public.consume_character_provisions_on_day_change() from anon;
revoke all on function public.consume_character_provisions_on_day_change() from authenticated;
