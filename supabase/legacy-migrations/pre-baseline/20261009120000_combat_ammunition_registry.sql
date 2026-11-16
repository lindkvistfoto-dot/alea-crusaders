-- v0.35.13: authoritative projectile registry and weapon links.
create table if not exists public.rule_projectile_types (
 projectile_key text primary key check (projectile_key ~ '^[a-z][a-z0-9_]{1,50}$'),
 name text not null unique,
 recovery_percent integer not null default 85 check (recovery_percent between 0 and 100),
 description text not null default '',
 sort_order integer not null default 0,
 active boolean not null default true
);
insert into public.rule_projectile_types (projectile_key,name,description,sort_order) values
 ('arrow','Pilar','Pilbågar',10),
 ('bolt','Skäktor','Armborst och arbalest',20),
 ('stone','Stenar','Slungor',30),
 ('dart','Blåsrörspilar','Blåsrör',40),
 ('throwing_axe','Kastyxor','Kastade yxor',50),
 ('javelin','Kastspjut','Kastade spjut',60),
 ('throwing_knife','Kastknivar','Kastade knivar',70),
 ('throwing_star','Kaststjärnor','Kastade stjärnor',80),
 ('bola','Bolor','Kastade bolor',90)
on conflict (projectile_key) do nothing;
alter table public.rule_projectile_types enable row level security;
drop policy if exists rule_projectile_types_read on public.rule_projectile_types;
create policy rule_projectile_types_read on public.rule_projectile_types for select to authenticated using (true);
drop policy if exists rule_projectile_types_admin on public.rule_projectile_types;
create policy rule_projectile_types_admin on public.rule_projectile_types for all to authenticated using (private.is_admin()) with check (private.is_admin());
grant select,insert,update,delete on public.rule_projectile_types to authenticated;

alter table public.rule_weapons add column if not exists projectile_key text references public.rule_projectile_types(projectile_key);
update public.rule_weapons set projectile_key =
 case
 when category='projectile' and 'bow'=any(tags) then 'arrow'
 when category='projectile' and 'crossbow'=any(tags) then 'bolt'
 when category='projectile' and ('sling'=any(tags) or 'staff_sling'=any(tags)) then 'stone'
 when category='projectile' and 'blowgun'=any(tags) then 'dart'
 when category='thrown' and name='Kastyxa' then 'throwing_axe'
 when category='thrown' and name='Kastspjut' then 'javelin'
 when category='thrown' and name='Kastkniv' then 'throwing_knife'
 when category='thrown' and name='Kaststjärna' then 'throwing_star'
 when category='thrown' and name='Bola' then 'bola'
 else projectile_key end
where category in ('projectile','thrown');

-- Backfill legacy character stocks by name without changing their quantities.
update public.characters c
set data=jsonb_set(c.data,'{projectiles}',coalesce((
 select jsonb_agg(case
  when p->>'projectileKey' is not null then p
  else p || jsonb_build_object('projectileKey',
   case
   when lower(coalesce(p->>'name','')) ~ 'pil' and lower(coalesce(p->>'name','')) !~ 'blåsrör' then 'arrow'
   when lower(coalesce(p->>'name','')) ~ 'skäkt|armborst' then 'bolt'
   when lower(coalesce(p->>'name','')) ~ 'sten|slung' then 'stone'
   when lower(coalesce(p->>'name','')) ~ 'blåsrör' then 'dart'
   when lower(coalesce(p->>'name','')) ~ 'kastyx' then 'throwing_axe'
   when lower(coalesce(p->>'name','')) ~ 'kastspjut' then 'javelin'
   when lower(coalesce(p->>'name','')) ~ 'kastkniv' then 'throwing_knife'
   when lower(coalesce(p->>'name','')) ~ 'kaststjärn' then 'throwing_star'
   when lower(coalesce(p->>'name','')) ~ 'bola' then 'bola'
   else '' end) end order by ord)
 from jsonb_array_elements(case when jsonb_typeof(c.data->'projectiles')='array' then c.data->'projectiles' else '[]'::jsonb end) with ordinality as t(p,ord)
),'[]'::jsonb),true)
where jsonb_typeof(c.data->'projectiles')='array';

-- One single-use item per already-owned thrown weapon, unless a stock row exists.
update public.characters c set data=jsonb_set(
 c.data,'{projectiles}',
 coalesce(c.data->'projectiles','[]'::jsonb) ||
 coalesce((
 select jsonb_agg(jsonb_build_object('projectileKey',w.projectile_key,'name',p.name,'count',w.qty))
 from (
  select rw.projectile_key,count(*)::integer as qty
  from jsonb_array_elements(case when jsonb_typeof(c.data->'weapons')='array' then c.data->'weapons' else '[]'::jsonb end) wi
  join public.rule_weapons rw on rw.id::text=coalesce(wi->>'weaponTypeId',wi->>'weapon_id','')
  where rw.category='thrown' and rw.projectile_key is not null
  and not exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(c.data->'projectiles')='array' then c.data->'projectiles' else '[]'::jsonb end) existing
    where existing->>'projectileKey'=rw.projectile_key
  )
  group by rw.projectile_key
 ) w join public.rule_projectile_types p on p.projectile_key=w.projectile_key
 ),'[]'::jsonb),true)
where jsonb_typeof(c.data->'weapons')='array';

create table if not exists public.combat_ammunition_spends (
 action_id uuid primary key references public.combat_actions(id) on delete cascade,
 combat_id uuid not null references public.combat_instances(id) on delete cascade,
 combatant_id uuid not null references public.combatants(id) on delete cascade,
 character_id uuid references public.characters(id) on delete set null,
 projectile_key text not null references public.rule_projectile_types(projectile_key),
 weapon_key text not null,
 recovered boolean not null default false,
 recovery_attempted boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists combat_ammunition_spends_combat_idx on public.combat_ammunition_spends(combat_id,projectile_key);
alter table public.combat_ammunition_spends enable row level security;
drop policy if exists combat_ammunition_spends_read on public.combat_ammunition_spends;
create policy combat_ammunition_spends_read on public.combat_ammunition_spends for select to authenticated
using (private.is_admin() or private.is_campaign_gm((select campaign_id from public.combat_instances where id=combat_id)));
grant select on public.combat_ammunition_spends to authenticated;

-- Atomic, idempotent reservation of a real shot. No reload or second client can double-spend.
create or replace function public.combat_spend_ammunition(p_action_id uuid,p_weapon_key text,p_projectile_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 a public.combat_actions%rowtype; b public.combatants%rowtype; c public.characters%rowtype;
 v_profile jsonb;v_rows jsonb;v_i integer;v_count integer;v_weapon jsonb;v_rule_key text;
 v_character_id uuid;
begin
 select * into a from public.combat_actions where id=p_action_id for update;
 if not found then raise exception 'Attackhandlingen saknas.';end if;
 if not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Bara SL kan genomföra stridsattacker.';end if;
 select * into b from public.combatants where id=a.combatant_id and combat_id=a.combat_id for update;
 if not found or a.action_type<>'attack' then raise exception 'Ogiltig attackhandling.';end if;
 if exists(select 1 from public.combat_ammunition_spends where action_id=a.id) then
  return jsonb_build_object('already_spent',true,'projectile_key',p_projectile_key);
 end if;
 if a.status<>'planned' then raise exception 'Attacken kan inte genomföras igen.';end if;
 if b.source_type='character' then
  select * into c from public.characters where id=b.source_id and campaign_id=a.campaign_id for update;
  if not found then raise exception 'Rollpersonens utrustning saknas.';end if;
  v_profile:=c.data;
  v_character_id:=c.id;
 else
  v_profile:=coalesce(b.state->'attack_profile','{}'::jsonb);
  v_character_id:=null;
 end if;
 select w into v_weapon from jsonb_array_elements(coalesce(v_profile->'weapons','[]'::jsonb)) w
 where coalesce(w->>'equipId',w->>'weapon_id',w->>'weaponTypeId',w->>'name')=p_weapon_key limit 1;
 if v_weapon is null then raise exception 'Vapnet finns inte hos kombatanten.';end if;
 select projectile_key into v_rule_key from public.rule_weapons
 where id::text=coalesce(v_weapon->>'weaponTypeId',v_weapon->>'weapon_id','')
    or (name=v_weapon->>'name' and category in ('projectile','thrown'))
 order by (id::text=coalesce(v_weapon->>'weaponTypeId',v_weapon->>'weapon_id','')) desc limit 1;
 if v_rule_key is null or v_rule_key<>p_projectile_key then raise exception 'Fel ammunition för vapnet.';end if;
 v_rows:=coalesce(v_profile->'projectiles','[]'::jsonb);
 select (e.ord-1)::integer,coalesce(nullif(e.row->>'count','')::integer,0)
 into v_i,v_count
 from jsonb_array_elements(v_rows) with ordinality as e(row,ord)
 where coalesce(e.row->>'projectileKey',e.row->>'projectile_key')=p_projectile_key
 order by e.ord limit 1;
 if v_i is null or v_count<=0 then raise exception 'Slut på ammunition!';end if;
 v_rows:=jsonb_set(v_rows,array[v_i::text,'count'],to_jsonb(v_count-1),true);
 if v_character_id is not null then
  update public.characters set data=jsonb_set(data,'{projectiles}',v_rows,true),updated_at=now() where id=v_character_id;
 else
  update public.combatants set state=jsonb_set(state,'{attack_profile,projectiles}',v_rows,true),updated_at=now() where id=b.id;
 end if;
 insert into public.combat_ammunition_spends(action_id,combat_id,combatant_id,character_id,projectile_key,weapon_key)
 values (a.id,a.combat_id,b.id,v_character_id,p_projectile_key,p_weapon_key);
 update public.combat_actions set status='resolving',updated_at=now() where id=a.id;
 return jsonb_build_object('already_spent',false,'projectile_key',p_projectile_key,'remaining',v_count-1);
end $$;
revoke all on function public.combat_spend_ammunition(uuid,text,text) from public,anon;
grant execute on function public.combat_spend_ammunition(uuid,text,text) to authenticated;

-- Revert a reserved shot if dice resolution throws before the result is committed.
create or replace function public.combat_refund_ammunition(p_action_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare e public.combat_ammunition_spends%rowtype; a public.combat_actions%rowtype;
begin
 select * into a from public.combat_actions where id=p_action_id for update;
 if not found or a.status<>'resolving' then return false;end if;
 if not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Behörighet saknas.';end if;
 select * into e from public.combat_ammunition_spends where action_id=p_action_id for update;
 if not found then return false;end if;
 if e.character_id is not null then
  update public.characters c set data=jsonb_set(c.data,'{projectiles}',coalesce((
   select jsonb_agg(case when p->>'projectileKey'=e.projectile_key then
    jsonb_set(p,'{count}',to_jsonb(coalesce((p->>'count')::integer,0)+1),true) else p end order by ord)
   from jsonb_array_elements(c.data->'projectiles') with ordinality as x(p,ord)
  ),'[]'::jsonb),true) where id=e.character_id;
 else
  update public.combatants b set state=jsonb_set(b.state,'{attack_profile,projectiles}',coalesce((
   select jsonb_agg(case when p->>'projectileKey'=e.projectile_key then
    jsonb_set(p,'{count}',to_jsonb(coalesce((p->>'count')::integer,0)+1),true) else p end order by ord)
   from jsonb_array_elements(b.state->'attack_profile'->'projectiles') with ordinality as x(p,ord)
  ),'[]'::jsonb),true) where id=e.combatant_id;
 end if;
 delete from public.combat_ammunition_spends where action_id=p_action_id;
 update public.combat_actions set status='planned' where id=p_action_id;
 return true;
end $$;
revoke all on function public.combat_refund_ammunition(uuid) from public,anon;
grant execute on function public.combat_refund_ammunition(uuid) to authenticated;
