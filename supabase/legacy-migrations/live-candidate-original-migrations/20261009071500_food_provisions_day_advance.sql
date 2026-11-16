-- Alea Crusaders v0.35.09
-- A character's data.provisionsDays is an integer number of food days.
-- Campaign day changes are serialized by advance_campaign_day; this trigger
-- joins the SAME transaction as its existing rest/PSY/ERF updates.
-- Missing provisionsDays means zero, with no historical consumption/backfill.
-- Weather changes / rest edits / reloads do NOT consume any food.

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
         end) - v_elapsed
      )),
      true
    ),
    updated_at = now()
  where c.campaign_id = new.campaign_id
    and c.data ? 'provisionsDays';

  return new;
end
$$;

drop trigger if exists campaign_day_consume_provisions on public.campaign_day_state;
create trigger campaign_day_consume_provisions
  after update of day_number on public.campaign_day_state
  for each row
  when (new.day_number > old.day_number)
  execute function public.consume_character_provisions_on_day_change();

revoke all on function public.consume_character_provisions_on_day_change() from public;
revoke all on function public.consume_character_provisions_on_day_change() from anon;
revoke all on function public.consume_character_provisions_on_day_change() from authenticated;
