
-- Permanent, campaign-independent recurring NPCs.
-- Originals live in global_npcs. Only explicit copies enter campaign_npcs.
create table if not exists public.global_npcs (
  id uuid primary key default gen_random_uuid(),
  npc_key text not null unique,
  name text not null,
  title text not null default '',
  description text not null default '',
  gm_notes text not null default '',
  age_years integer check (age_years is null or age_years>=0),
  race text not null default '',
  gender text not null default '',
  profession text not null default '',
  appearance text not null default '',
  personality text not null default '',
  motivation text not null default '',
  weakness text not null default '',
  background text not null default '',
  relationships text not null default '',
  secrets text not null default '',
  hooks jsonb not null default '[]'::jsonb check(jsonb_typeof(hooks)='array'),
  equipment_notes jsonb not null default '[]'::jsonb check(jsonb_typeof(equipment_notes)='array'),
  image_reference jsonb not null default '{}'::jsonb check(jsonb_typeof(image_reference)='object'),
  image_path text,
  attributes jsonb not null default '{}'::jsonb check(jsonb_typeof(attributes)='object'),
  skills jsonb not null default '[]'::jsonb check(jsonb_typeof(skills)='array'),
  weapons jsonb not null default '[]'::jsonb check(jsonb_typeof(weapons)='array'),
  spells jsonb not null default '[]'::jsonb check(jsonb_typeof(spells)='array'),
  shield jsonb not null default '{}'::jsonb check(jsonb_typeof(shield)='object'),
  armor jsonb not null default '{}'::jsonb check(jsonb_typeof(armor)='object'),
  tags text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.global_npcs enable row level security;
grant select,insert,update,delete on public.global_npcs to authenticated;
drop policy if exists global_npcs_read on public.global_npcs;
create policy global_npcs_read on public.global_npcs for select to authenticated
using ((select private.is_admin()) or exists (select 1 from public.campaigns c where private.is_campaign_gm(c.id)));
drop policy if exists global_npcs_admin_write on public.global_npcs;
create policy global_npcs_admin_write on public.global_npcs for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.campaign_npcs
  add column if not exists source_global_npc_id uuid references public.global_npcs(id) on delete set null;
create index if not exists campaign_npcs_global_source_idx
  on public.campaign_npcs(source_global_npc_id) where source_global_npc_id is not null;

create or replace function public.add_global_npc_to_campaign(p_global_npc_id uuid,p_campaign_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_npc_id uuid;
begin
  if not ((select private.is_admin()) or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Not authorized for this campaign';
  end if;
  insert into public.campaign_npcs(
    campaign_id,npc_key,name,title,description,gm_notes,player_visible,active,
    created_by,attributes,skills,weapons,shield,armor,race,gender,profession,spells,source_global_npc_id
  )
  select p_campaign_id, 'library-'||g.npc_key||'-'||left(gen_random_uuid()::text,8),
    g.name,g.title,g.description,
    concat_ws(E'\n\n', nullif(g.gm_notes,''), 'Bakgrund: '||g.background,
      'Drivkraft: '||g.motivation,'Svaghet: '||g.weakness,'Relationer: '||g.relationships,
      'Hemligheter: '||g.secrets,'Äventyrskrokar: '||g.hooks::text,
      'Övrig utrustning: '||g.equipment_notes::text),
    false,true,(select auth.uid()),g.attributes,g.skills,g.weapons,g.shield,g.armor,
    g.race,g.gender,g.profession,g.spells,g.id
  from public.global_npcs g where g.id=p_global_npc_id
  returning id into v_npc_id;
  if v_npc_id is null then
    raise exception 'Global NPC not found or not visible';
  end if;
  return v_npc_id;
end $$;
revoke execute on function public.add_global_npc_to_campaign(uuid,uuid) from public,anon;
grant execute on function public.add_global_npc_to_campaign(uuid,uuid) to authenticated;
