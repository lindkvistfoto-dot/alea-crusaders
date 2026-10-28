-- Chronicle: append-only, queryable history for resolved combat attacks.
-- A row is created by the combat_actions trigger only after hit_resolved=true.
-- Undo/reset writes a separate correction row; source facts are never deleted.

create table public.combat_history_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  combat_id uuid not null references public.combat_instances(id) on delete restrict,
  event_type text not null,
  source_action_id uuid not null,
  resolution_id uuid not null,
  idempotency_key text not null unique,
  corrects_event_id uuid references public.combat_history_events(id) on delete restrict,
  correction_action text,
  correction_reason_code text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  round_number integer,
  phase text,
  actor_combatant_id uuid,
  actor_source_type text,
  actor_source_id uuid,
  actor_name text,
  target_combatant_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_name text,
  target_race text,
  attack_mode text,
  weapon_key text,
  weapon_name text,
  weapon_class text,
  attack_success boolean,
  attack_outcome text,
  attack_roll integer,
  confirmation_roll integer,
  attack_fv integer,
  hit_location_key text,
  hit_location_label text,
  hit_location_roll integer,
  parry_success boolean,
  parry_outcome text,
  damage_gross integer,
  damage_bonus integer,
  armor_absorption integer,
  effect_protection integer,
  net_damage integer,
  kp_before integer,
  kp_after integer,
  map_id uuid,
  actor_q integer,
  actor_r integer,
  target_q integer,
  target_r integer,
  rules_engine text,
  source_quality text not null default 'verified_engine'
    check (source_quality in ('verified_engine','imported','reconstructed','manual','unknown')),
  event_schema_version smallint not null default 1 check (event_schema_version > 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  constraint combat_history_correction_shape check (
    (event_type = 'combat.event_correction'
      and corrects_event_id is not null
      and correction_action in ('retract','supersede')
      and correction_reason_code is not null)
    or
    (event_type <> 'combat.event_correction'
      and corrects_event_id is null
      and correction_action is null
      and correction_reason_code is null)
  )
);

create index combat_history_combat_time_idx
  on public.combat_history_events (combat_id, occurred_at, id);
create index combat_history_campaign_time_idx
  on public.combat_history_events (campaign_id, occurred_at, id);
create index combat_history_actor_time_idx
  on public.combat_history_events (actor_combatant_id, occurred_at, id)
  where actor_combatant_id is not null;
create index combat_history_target_race_zone_idx
  on public.combat_history_events (target_race, hit_location_key, occurred_at)
  where event_type = 'combat.attack_resolved';

alter table public.combat_history_events enable row level security;
revoke all on public.combat_history_events from anon, authenticated;
grant select, insert on public.combat_history_events to authenticated;

create policy combat_history_events_select
  on public.combat_history_events
  for select to authenticated
  using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

create policy combat_history_events_insert
  on public.combat_history_events
  for insert to authenticated
  with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

comment on table public.combat_history_events is
  'Append-only, queryable Chronicle facts. Attack outcomes are inserted transactionally from resolved combat_actions; corrections reference prior rows.';

create or replace function private.capture_combat_attack_history()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_old_final boolean := false;
  v_new_final boolean := false;
  v_old_resolution_id uuid;
  v_new_resolution_id uuid;
  v_event_id uuid;
  v_actor public.combatants%rowtype;
  v_target public.combatants%rowtype;
  v_combat public.combat_instances%rowtype;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_final :=
      old.action_type = 'attack'
      and old.status = 'resolved'
      and coalesce((old.result ->> 'hit_resolved')::boolean, false);

    if v_old_final then
      v_old_resolution_id := coalesce(
        nullif(old.result ->> 'resolution_id', '')::uuid,
        md5(old.id::text || old.result::text)::uuid
      );

      if tg_op = 'DELETE' then
        v_new_final := false;
      else
        v_new_final :=
          new.action_type = 'attack'
          and new.status = 'resolved'
          and coalesce((new.result ->> 'hit_resolved')::boolean, false);

        if v_new_final then
          v_new_resolution_id := coalesce(
            nullif(new.result ->> 'resolution_id', '')::uuid,
            md5(new.id::text || new.result::text)::uuid
          );
        end if;
      end if;

      if tg_op = 'DELETE' or not v_new_final or v_new_resolution_id is distinct from v_old_resolution_id then
        select id into v_event_id
        from public.combat_history_events
        where event_type = 'combat.attack_resolved'
          and source_action_id = old.id
          and resolution_id = v_old_resolution_id
        order by recorded_at desc
        limit 1;

        if v_event_id is not null then
          insert into public.combat_history_events (
            campaign_id, combat_id, event_type, source_action_id, resolution_id,
            idempotency_key, corrects_event_id, correction_action,
            correction_reason_code, occurred_at, round_number, phase,
            actor_combatant_id, actor_source_type, actor_source_id, actor_name,
            target_combatant_id, target_source_type, target_source_id, target_name,
            target_race, attack_mode, weapon_key, weapon_name, weapon_class,
            attack_success, attack_outcome, attack_roll, confirmation_roll, attack_fv,
            hit_location_key, hit_location_label, hit_location_roll,
            parry_success, parry_outcome,
            damage_gross, damage_bonus, armor_absorption, effect_protection,
            net_damage, kp_before, kp_after, map_id, actor_q, actor_r, target_q, target_r,
            rules_engine, source_quality, event_schema_version, payload
          )
          select
            e.campaign_id, e.combat_id, 'combat.event_correction', e.source_action_id,
            e.resolution_id, 'retract:' || e.id::text, e.id, 'retract',
            case when tg_op = 'DELETE' then 'action_deleted' else 'action_reset' end,
            clock_timestamp(), e.round_number, e.phase,
            e.actor_combatant_id, e.actor_source_type, e.actor_source_id, e.actor_name,
            e.target_combatant_id, e.target_source_type, e.target_source_id, e.target_name,
            e.target_race, e.attack_mode, e.weapon_key, e.weapon_name, e.weapon_class,
            e.attack_success, e.attack_outcome, e.attack_roll, e.confirmation_roll, e.attack_fv,
            e.hit_location_key, e.hit_location_label, e.hit_location_roll,
            e.parry_success, e.parry_outcome,
            e.damage_gross, e.damage_bonus, e.armor_absorption, e.effect_protection,
            e.net_damage, e.kp_before, e.kp_after, e.map_id, e.actor_q, e.actor_r, e.target_q, e.target_r,
            e.rules_engine, e.source_quality, e.event_schema_version,
            jsonb_build_object('corrected_event_id', e.id, 'reason',
              case when tg_op = 'DELETE' then 'action_deleted' else 'action_reset' end)
          from public.combat_history_events e
          where e.id = v_event_id
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_final :=
      new.action_type = 'attack'
      and new.status = 'resolved'
      and coalesce((new.result ->> 'hit_resolved')::boolean, false);

    if v_new_final then
      v_new_resolution_id := coalesce(
        nullif(new.result ->> 'resolution_id', '')::uuid,
        md5(new.id::text || new.result::text)::uuid
      );

      select * into v_actor
      from public.combatants
      where id = new.combatant_id and combat_id = new.combat_id;

      if new.target_combatant_id is not null then
        select * into v_target
        from public.combatants
        where id = new.target_combatant_id and combat_id = new.combat_id;
      end if;

      select * into v_combat
      from public.combat_instances
      where id = new.combat_id;

      insert into public.combat_history_events (
        campaign_id, combat_id, event_type, source_action_id, resolution_id, idempotency_key,
        occurred_at, round_number, phase,
        actor_combatant_id, actor_source_type, actor_source_id, actor_name,
        target_combatant_id, target_source_type, target_source_id, target_name, target_race,
        attack_mode, weapon_key, weapon_name, weapon_class,
        attack_success, attack_outcome, attack_roll, confirmation_roll, attack_fv,
        hit_location_key, hit_location_label, hit_location_roll,
        parry_success, parry_outcome,
        damage_gross, damage_bonus, armor_absorption, effect_protection, net_damage, kp_before, kp_after,
        map_id, actor_q, actor_r, target_q, target_r, rules_engine, source_quality,
        payload
      )
      values (
        new.campaign_id, new.combat_id, 'combat.attack_resolved', new.id, v_new_resolution_id,
        'attack:' || new.id::text || ':' || v_new_resolution_id::text,
        coalesce(new.updated_at, clock_timestamp()), new.round_number, new.phase,
        v_actor.id, v_actor.source_type, v_actor.source_id, v_actor.name_snapshot,
        v_target.id, v_target.source_type, v_target.source_id, v_target.name_snapshot,
        coalesce(v_target.state ->> 'race_name', v_target.state ->> 'race'),
        coalesce(new.result ->> 'attack_mode', new.source_data ->> 'mode'),
        coalesce(new.result ->> 'weapon_key', new.source_data ->> 'weapon_key'),
        coalesce(new.result ->> 'weapon_name', new.source_data ->> 'weapon_name'),
        coalesce(new.result ->> 'weapon_class', new.source_data ->> 'weapon_class'),
        nullif(new.result ->> 'success', '')::boolean,
        new.result ->> 'outcome',
        nullif(new.result ->> 'roll', '')::integer,
        nullif(new.result ->> 'confirmation_roll', '')::integer,
        nullif(new.result ->> 'fv', '')::integer,
        new.result #>> '{hit_location,key}',
        new.result #>> '{hit_location,label}',
        nullif(new.result #>> '{hit_location,roll}', '')::integer,
        nullif(new.result #>> '{parry,success}', '')::boolean,
        new.result #>> '{parry,outcome}',
        nullif(new.result #>> '{damage,gross_damage}', '')::integer,
        nullif(new.result #>> '{damage,damage_bonus_value}', '')::integer,
        nullif(new.result #>> '{damage,armor_absorption}', '')::integer,
        nullif(new.result #>> '{damage,effect_protection}', '')::integer,
        nullif(new.result #>> '{damage,net_damage}', '')::integer,
        nullif(new.result #>> '{damage,kp_before}', '')::integer,
        nullif(new.result #>> '{damage,kp_after}', '')::integer,
        v_combat.map_id, v_actor.q, v_actor.r, v_target.q, v_target.r,
        new.result ->> 'rule_engine', 'verified_engine',
        jsonb_build_object(
          'action', jsonb_build_object(
            'phase', new.phase, 'action_type', new.action_type, 'slot_key', new.slot_key,
            'source_data', new.source_data
          ),
          'result', new.result,
          'actor', jsonb_build_object(
            'combatant_id', v_actor.id, 'source_type', v_actor.source_type,
            'source_id', v_actor.source_id, 'name', v_actor.name_snapshot
          ),
          'target', jsonb_build_object(
            'combatant_id', v_target.id, 'source_type', v_target.source_type,
            'source_id', v_target.source_id, 'name', v_target.name_snapshot,
            'race', coalesce(v_target.state ->> 'race_name', v_target.state ->> 'race')
          ),
          'map', jsonb_build_object(
            'id', v_combat.map_id, 'actor_q', v_actor.q, 'actor_r', v_actor.r,
            'target_q', v_target.q, 'target_r', v_target.r
          )
        )
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists combat_actions_capture_history on public.combat_actions;
create trigger combat_actions_capture_history
after insert or update or delete on public.combat_actions
for each row execute function private.capture_combat_attack_history();
