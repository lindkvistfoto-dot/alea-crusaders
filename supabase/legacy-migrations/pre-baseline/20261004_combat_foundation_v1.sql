-- Alea Crusaders – combat foundation v1
-- Tactical combat data model: encounter templates, active combats, combatants,
-- per-round actions, hex terrain/sight, and structured combat log.

create extension if not exists pgcrypto;

create table if not exists public.campaign_event_combats (
  event_id uuid primary key references public.campaign_events(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid references public.campaign_maps(id) on delete set null,
  name text not null default '',
  hex_orientation text not null default 'pointy',
  hex_size integer not null default 48,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combats_orientation_check check (hex_orientation in ('pointy','flat')),
  constraint campaign_event_combats_hex_size_check check (hex_size between 20 and 200)
);

create table if not exists public.campaign_event_combat_hexes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campaign_event_combats(event_id) on delete cascade,
  q integer not null,
  r integer not null,
  movement_mode text not null default 'free',
  sight_mode text not null default 'clear',
  movement_cost numeric(6,2) not null default 1,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_hexes_movement_check check (movement_mode in ('free','difficult','blocked')),
  constraint campaign_event_combat_hexes_sight_check check (sight_mode in ('clear','obscuring','blocked')),
  constraint campaign_event_combat_hexes_cost_check check (movement_cost > 0),
  constraint campaign_event_combat_hexes_unique unique (event_id,q,r)
);

create table if not exists public.campaign_event_combat_spawns (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campaign_event_combats(event_id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  name_override text not null default '',
  side text not null default 'enemies',
  q integer not null,
  r integer not null,
  quantity integer not null default 1,
  controller_user_id uuid references auth.users(id) on delete set null,
  flying boolean not null default false,
  hidden_initially boolean not null default false,
  state jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_spawns_source_check check (source_type in ('character','npc','monster')),
  constraint campaign_event_combat_spawns_side_check check (side in ('heroes','enemies','neutral')),
  constraint campaign_event_combat_spawns_quantity_check check (quantity between 1 and 100)
);

create table if not exists public.combat_instances (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_id uuid references public.campaign_events(id) on delete set null,
  map_id uuid references public.campaign_maps(id) on delete set null,
  name text not null default '',
  status text not null default 'setup',
  round_number integer not null default 1,
  phase text not null default 'initiative',
  winning_side text,
  initiative jsonb not null default '{}'::jsonb,
  active_actor_id uuid,
  active_responder_id uuid,
  settings jsonb not null default '{}'::jsonb,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combat_instances_status_check check (status in ('setup','active','paused','completed')),
  constraint combat_instances_round_check check (round_number >= 1),
  constraint combat_instances_phase_check check (phase in ('initiative','declaration','movement','magic','quick','normal','new_contact','late','effects','round_end')),
  constraint combat_instances_side_check check (winning_side is null or winning_side in ('heroes','enemies','neutral'))
);

create table if not exists public.combatants (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combat_instances(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  source_instance_key text not null default '',
  name_snapshot text not null,
  side text not null default 'neutral',
  controller_user_id uuid references auth.users(id) on delete set null,
  q integer not null default 0,
  r integer not null default 0,
  flying boolean not null default false,
  visible_to_players boolean not null default true,
  current_kp integer,
  max_kp integer,
  current_psy integer,
  max_psy integer,
  movement_max numeric(6,2),
  movement_remaining numeric(6,2),
  status text not null default 'active',
  action_plan jsonb not null default '[]'::jsonb,
  state jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combatants_source_check check (source_type in ('character','npc','monster')),
  constraint combatants_side_check check (side in ('heroes','enemies','neutral')),
  constraint combatants_status_check check (status in ('active','unconscious','defeated','dead','removed')),
  constraint combatants_kp_check check ((max_kp is null or max_kp >= 0) and (current_kp is null or current_kp >= 0)),
  constraint combatants_psy_check check ((max_psy is null or max_psy >= 0) and (current_psy is null or current_psy >= 0)),
  constraint combatants_move_check check ((movement_max is null or movement_max >= 0) and (movement_remaining is null or movement_remaining >= 0))
);

alter table public.combat_instances drop constraint if exists combat_instances_active_actor_fkey;
alter table public.combat_instances
  add constraint combat_instances_active_actor_fkey foreign key (active_actor_id)
  references public.combatants(id) on delete set null;

alter table public.combat_instances drop constraint if exists combat_instances_active_responder_fkey;
alter table public.combat_instances
  add constraint combat_instances_active_responder_fkey foreign key (active_responder_id)
  references public.combatants(id) on delete set null;

create table if not exists public.combat_hexes (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combat_instances(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  q integer not null,
  r integer not null,
  movement_mode text not null default 'free',
  sight_mode text not null default 'clear',
  movement_cost numeric(6,2) not null default 1,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combat_hexes_movement_check check (movement_mode in ('free','difficult','blocked')),
  constraint combat_hexes_sight_check check (sight_mode in ('clear','obscuring','blocked')),
  constraint combat_hexes_cost_check check (movement_cost > 0),
  constraint combat_hexes_unique unique (combat_id,q,r)
);

create table if not exists public.combat_actions (
  id uuid primary key default gen_random_uuid(),
  combat_id uuid not null references public.combat_instances(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  combatant_id uuid not null references public.combatants(id) on delete cascade,
  round_number integer not null,
  phase text not null,
  action_type text not null,
  slot_key text not null default '',
  source_data jsonb not null default '{}'::jsonb,
  target_combatant_id uuid references public.combatants(id) on delete set null,
  status text not null default 'planned',
  sequence integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  player_visible boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combat_actions_round_check check (round_number >= 1),
  constraint combat_actions_phase_check check (phase in ('initiative','declaration','movement','magic','quick','normal','new_contact','late','effects','round_end','reaction')),
  constraint combat_actions_type_check check (action_type in ('attack','parry','spell','move','other')),
  constraint combat_actions_status_check check (status in ('planned','reserved','pending','resolving','resolved','cancelled'))
);

create table if not exists public.combat_log (
  id bigint generated by default as identity primary key,
  combat_id uuid not null references public.combat_instances(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  round_number integer not null,
  phase text not null,
  actor_id uuid references public.combatants(id) on delete set null,
  target_id uuid references public.combatants(id) on delete set null,
  event_type text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  player_visible boolean not null default true,
  created_at timestamptz not null default now(),
  constraint combat_log_round_check check (round_number >= 1)
);

create index if not exists campaign_event_combats_campaign_idx on public.campaign_event_combats(campaign_id);
create index if not exists campaign_event_combats_map_idx on public.campaign_event_combats(map_id);
create index if not exists campaign_event_combat_hexes_event_idx on public.campaign_event_combat_hexes(event_id,q,r);
create index if not exists campaign_event_combat_spawns_event_idx on public.campaign_event_combat_spawns(event_id,sort_order);
create index if not exists campaign_event_combat_spawns_controller_idx on public.campaign_event_combat_spawns(controller_user_id);
create index if not exists combat_instances_campaign_status_idx on public.combat_instances(campaign_id,status,updated_at desc);
create index if not exists combat_instances_event_idx on public.combat_instances(event_id);
create index if not exists combat_instances_map_idx on public.combat_instances(map_id);
create index if not exists combat_instances_started_by_idx on public.combat_instances(started_by);
create index if not exists combat_instances_active_actor_idx on public.combat_instances(active_actor_id);
create index if not exists combat_instances_active_responder_idx on public.combat_instances(active_responder_id);
create index if not exists combatants_combat_idx on public.combatants(combat_id,sort_order,name_snapshot);
create index if not exists combatants_campaign_idx on public.combatants(campaign_id);
create index if not exists combatants_controller_idx on public.combatants(controller_user_id);
create index if not exists combatants_source_idx on public.combatants(source_type,source_id);
create index if not exists combat_hexes_combat_idx on public.combat_hexes(combat_id,q,r);
create index if not exists combat_hexes_campaign_idx on public.combat_hexes(campaign_id);
create index if not exists combat_actions_combat_round_idx on public.combat_actions(combat_id,round_number,phase,sequence);
create index if not exists combat_actions_actor_idx on public.combat_actions(combatant_id,status);
create index if not exists combat_actions_campaign_idx on public.combat_actions(campaign_id);
create index if not exists combat_actions_target_idx on public.combat_actions(target_combatant_id);
create index if not exists combat_actions_created_by_idx on public.combat_actions(created_by);
create index if not exists combat_log_combat_idx on public.combat_log(combat_id,id);
create index if not exists combat_log_campaign_idx on public.combat_log(campaign_id);
create index if not exists combat_log_actor_idx on public.combat_log(actor_id);
create index if not exists combat_log_target_idx on public.combat_log(target_id);

drop trigger if exists campaign_event_combats_updated_at on public.campaign_event_combats;
create trigger campaign_event_combats_updated_at before update on public.campaign_event_combats
for each row execute function private.set_updated_at();
drop trigger if exists campaign_event_combat_hexes_updated_at on public.campaign_event_combat_hexes;
create trigger campaign_event_combat_hexes_updated_at before update on public.campaign_event_combat_hexes
for each row execute function private.set_updated_at();
drop trigger if exists campaign_event_combat_spawns_updated_at on public.campaign_event_combat_spawns;
create trigger campaign_event_combat_spawns_updated_at before update on public.campaign_event_combat_spawns
for each row execute function private.set_updated_at();
drop trigger if exists combat_instances_updated_at on public.combat_instances;
create trigger combat_instances_updated_at before update on public.combat_instances
for each row execute function private.set_updated_at();
drop trigger if exists combatants_updated_at on public.combatants;
create trigger combatants_updated_at before update on public.combatants
for each row execute function private.set_updated_at();
drop trigger if exists combat_hexes_updated_at on public.combat_hexes;
create trigger combat_hexes_updated_at before update on public.combat_hexes
for each row execute function private.set_updated_at();
drop trigger if exists combat_actions_updated_at on public.combat_actions;
create trigger combat_actions_updated_at before update on public.combat_actions
for each row execute function private.set_updated_at();

alter table public.campaign_event_combats enable row level security;
alter table public.campaign_event_combat_hexes enable row level security;
alter table public.campaign_event_combat_spawns enable row level security;
alter table public.combat_instances enable row level security;
alter table public.combatants enable row level security;
alter table public.combat_hexes enable row level security;
alter table public.combat_actions enable row level security;
alter table public.combat_log enable row level security;

grant select,insert,update,delete on public.campaign_event_combats to authenticated;
grant select,insert,update,delete on public.campaign_event_combat_hexes to authenticated;
grant select,insert,update,delete on public.campaign_event_combat_spawns to authenticated;
grant select,insert,update,delete on public.combat_instances to authenticated;
grant select,insert,update,delete on public.combatants to authenticated;
grant select,insert,update,delete on public.combat_hexes to authenticated;
grant select,insert,update,delete on public.combat_actions to authenticated;
grant select,insert,update,delete on public.combat_log to authenticated;
grant usage,select on sequence public.combat_log_id_seq to authenticated;

-- Event combat templates are GM/admin-only.
drop policy if exists campaign_event_combats_select on public.campaign_event_combats;
create policy campaign_event_combats_select on public.campaign_event_combats
for select to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists campaign_event_combats_insert on public.campaign_event_combats;
create policy campaign_event_combats_insert on public.campaign_event_combats
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists campaign_event_combats_update on public.campaign_event_combats;
create policy campaign_event_combats_update on public.campaign_event_combats
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists campaign_event_combats_delete on public.campaign_event_combats;
create policy campaign_event_combats_delete on public.campaign_event_combats
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_hexes_select on public.campaign_event_combat_hexes;
create policy campaign_event_combat_hexes_select on public.campaign_event_combat_hexes
for select to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_hexes.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_hexes_insert on public.campaign_event_combat_hexes;
create policy campaign_event_combat_hexes_insert on public.campaign_event_combat_hexes
for insert to authenticated
with check (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_hexes.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_hexes_update on public.campaign_event_combat_hexes;
create policy campaign_event_combat_hexes_update on public.campaign_event_combat_hexes
for update to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_hexes.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
))
with check (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_hexes.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_hexes_delete on public.campaign_event_combat_hexes;
create policy campaign_event_combat_hexes_delete on public.campaign_event_combat_hexes
for delete to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_hexes.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));

drop policy if exists campaign_event_combat_spawns_select on public.campaign_event_combat_spawns;
create policy campaign_event_combat_spawns_select on public.campaign_event_combat_spawns
for select to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_spawns.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_spawns_insert on public.campaign_event_combat_spawns;
create policy campaign_event_combat_spawns_insert on public.campaign_event_combat_spawns
for insert to authenticated
with check (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_spawns.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_spawns_update on public.campaign_event_combat_spawns;
create policy campaign_event_combat_spawns_update on public.campaign_event_combat_spawns
for update to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_spawns.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
))
with check (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_spawns.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));
drop policy if exists campaign_event_combat_spawns_delete on public.campaign_event_combat_spawns;
create policy campaign_event_combat_spawns_delete on public.campaign_event_combat_spawns
for delete to authenticated
using (exists (
  select 1 from public.campaign_event_combats c
  where c.event_id=campaign_event_combat_spawns.event_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(c.campaign_id)))
));

-- Active combat: campaign members can read the combat, but hidden enemies remain hidden.
drop policy if exists combat_instances_select on public.combat_instances;
create policy combat_instances_select on public.combat_instances
for select to authenticated
using ((select private.is_admin()) or (select private.is_campaign_member(campaign_id)));
drop policy if exists combat_instances_insert on public.combat_instances;
create policy combat_instances_insert on public.combat_instances
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_instances_update on public.combat_instances;
create policy combat_instances_update on public.combat_instances
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_instances_delete on public.combat_instances;
create policy combat_instances_delete on public.combat_instances
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists combatants_select on public.combatants;
create policy combatants_select on public.combatants
for select to authenticated
using (
  (select private.is_admin())
  or (select private.is_campaign_gm(campaign_id))
  or (
    (select private.is_campaign_member(campaign_id))
    and (side='heroes' or visible_to_players or controller_user_id=(select auth.uid()))
  )
);
drop policy if exists combatants_insert on public.combatants;
create policy combatants_insert on public.combatants
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combatants_update on public.combatants;
create policy combatants_update on public.combatants
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combatants_delete on public.combatants;
create policy combatants_delete on public.combatants
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists combat_hexes_select on public.combat_hexes;
create policy combat_hexes_select on public.combat_hexes
for select to authenticated
using ((select private.is_admin()) or (select private.is_campaign_member(campaign_id)));
drop policy if exists combat_hexes_insert on public.combat_hexes;
create policy combat_hexes_insert on public.combat_hexes
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_hexes_update on public.combat_hexes;
create policy combat_hexes_update on public.combat_hexes
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_hexes_delete on public.combat_hexes;
create policy combat_hexes_delete on public.combat_hexes
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists combat_actions_select on public.combat_actions;
create policy combat_actions_select on public.combat_actions
for select to authenticated
using (
  (select private.is_admin())
  or (select private.is_campaign_gm(campaign_id))
  or (player_visible and (select private.is_campaign_member(campaign_id)))
);
drop policy if exists combat_actions_insert on public.combat_actions;
create policy combat_actions_insert on public.combat_actions
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_actions_update on public.combat_actions;
create policy combat_actions_update on public.combat_actions
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_actions_delete on public.combat_actions;
create policy combat_actions_delete on public.combat_actions
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists combat_log_select on public.combat_log;
create policy combat_log_select on public.combat_log
for select to authenticated
using (
  (select private.is_admin())
  or (select private.is_campaign_gm(campaign_id))
  or (player_visible and (select private.is_campaign_member(campaign_id)))
);
drop policy if exists combat_log_insert on public.combat_log;
create policy combat_log_insert on public.combat_log
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_log_update on public.combat_log;
create policy combat_log_update on public.combat_log
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
drop policy if exists combat_log_delete on public.combat_log;
create policy combat_log_delete on public.combat_log
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
