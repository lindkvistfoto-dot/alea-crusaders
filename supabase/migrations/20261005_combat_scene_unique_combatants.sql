create table if not exists public.campaign_combat_scene_combatants (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  source_type text not null default 'custom',
  source_id uuid,
  combatant_type text not null default 'npc',
  instance_no integer not null default 1,
  name text not null,
  visible_to_players boolean not null default true,
  sort_order integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_combat_scene_combatants_scene_fkey
    foreign key (scene_id,campaign_id)
    references public.campaign_combat_scenes(id,campaign_id)
    on delete cascade,
  constraint campaign_combat_scene_combatants_source_type_check
    check (source_type in ('character','npc','monster','custom')),
  constraint campaign_combat_scene_combatants_type_check
    check (combatant_type in ('player','npc','enemy','monster')),
  constraint campaign_combat_scene_combatants_instance_check
    check (instance_no >= 1)
);

create unique index if not exists campaign_combat_scene_combatants_source_instance_uidx
  on public.campaign_combat_scene_combatants(scene_id,source_type,source_id,instance_no)
  where source_id is not null;

create index if not exists campaign_combat_scene_combatants_scene_idx
  on public.campaign_combat_scene_combatants(scene_id,sort_order,id);

alter table public.campaign_combat_scene_combatants enable row level security;
grant select,insert,update,delete on public.campaign_combat_scene_combatants to authenticated;

drop policy if exists campaign_combat_scene_combatants_manage on public.campaign_combat_scene_combatants;
create policy campaign_combat_scene_combatants_manage
on public.campaign_combat_scene_combatants
for all
to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

insert into public.campaign_combat_scene_combatants
  (scene_id,campaign_id,source_type,source_id,combatant_type,instance_no,name,visible_to_players,sort_order)
select p.scene_id,p.campaign_id,'character',p.character_id,
       case when c.is_npc then 'npc' else 'player' end,
       1,c.name,true,p.sort_order
from public.campaign_combat_scene_characters p
join public.characters c on c.id=p.character_id and c.campaign_id=p.campaign_id
where not exists (
  select 1 from public.campaign_combat_scene_combatants x
  where x.scene_id=p.scene_id and x.source_type='character' and x.source_id=p.character_id and x.instance_no=1
);

insert into public.campaign_combat_scene_combatants
  (scene_id,campaign_id,source_type,source_id,combatant_type,instance_no,name,visible_to_players,sort_order)
select p.scene_id,p.campaign_id,'npc',p.npc_id,'npc',1,n.name,n.player_visible,p.sort_order
from public.campaign_combat_scene_npcs p
join public.campaign_npcs n on n.id=p.npc_id and n.campaign_id=p.campaign_id
where not exists (
  select 1 from public.campaign_combat_scene_combatants x
  where x.scene_id=p.scene_id and x.source_type='npc' and x.source_id=p.npc_id and x.instance_no=1
);

insert into public.campaign_combat_scene_combatants
  (scene_id,campaign_id,source_type,source_id,combatant_type,instance_no,name,visible_to_players,sort_order)
select p.scene_id,p.campaign_id,'monster',p.monster_id,'monster',g.i,
       case when p.quantity > 1 then m.name || ' ' || g.i::text else m.name end,
       m.player_visible,p.sort_order * 100 + g.i
from public.campaign_combat_scene_monsters p
join public.campaign_monsters m on m.id=p.monster_id and m.campaign_id=p.campaign_id
cross join lateral generate_series(1,p.quantity) g(i)
where not exists (
  select 1 from public.campaign_combat_scene_combatants x
  where x.scene_id=p.scene_id and x.source_type='monster' and x.source_id=p.monster_id and x.instance_no=g.i
);
