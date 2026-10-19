-- SISYPHUS: one record per physical action, transactional planning/claiming.
-- No character data, existing migrations or unrelated policies are rewritten.
-- Deployment aborts on historic duplicate slots; it never deletes that history.
create unique index combat_actions_live_hand_slot
 on public.combat_actions(combat_id,combatant_id,round_number,slot_key)
 where slot_key in ('primary','secondary') and status <> 'cancelled';

create or replace function public.combat_sword_hand(p_value text,p_ambidextrous boolean default false)
returns text language sql immutable security invoker set search_path='' as $$
 select case
  when lower(coalesce(p_value,'')) ~ '(båda|bada|ambi|both)' then 'both'
  when lower(coalesce(p_value,'')) ~ '^(vänster|vanster|left|v$)' then 'leftHand'
  when lower(coalesce(p_value,'')) ~ '^(höger|hoger|right|h$)' then 'rightHand'
  when p_ambidextrous then 'both' else 'rightHand' end
$$;

-- A read-only projection of current source equipment + temporary combat state.
-- Grip always calls the established rule_weapon_grip; raw STY is converted first.
create or replace function public.combat_hand_context(p_combatant_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 b public.combatants%rowtype; i public.combat_instances%rowtype;
 p jsonb; eq jsonb; hs jsonb:='{}'; ref jsonb; item jsonb; opposite jsonb;
 r public.rule_weapons%rowtype; g jsonb; slot text; other text; kind text;
 sty numeric; delta numeric; req integer; handling text; linked boolean; usable boolean;
 assignment boolean; entry record; shield jsonb; chosen text;
begin
 select * into b from public.combatants where id=p_combatant_id;
 if not found then raise exception 'Kombatanten saknas.'; end if;
 select * into i from public.combat_instances where id=b.combat_id;
 if b.source_type='character' then
  select data into p from public.characters where id=b.source_id and campaign_id=b.campaign_id;
 else p:=b.state->'attack_profile'; end if;
 p:=coalesce(p,b.state->'attack_profile','{}'::jsonb);
 if b.source_type in ('npc','monster') then
  select coalesce(jsonb_agg(w||jsonb_build_object('equipId',coalesce(w->>'equipId','npc-weapon-'||(n-1)::text)) order by n),'[]'::jsonb)
   into item from jsonb_array_elements(coalesce(p->'weapons','[]'::jsonb)) with ordinality t(w,n);
  p:=p||jsonb_build_object('weapons',item);
  select coalesce(jsonb_agg(w||jsonb_build_object('equipId',coalesce(w->>'equipId','npc-shield-'||(n-1)::text)) order by n),'[]'::jsonb)
   into item from jsonb_array_elements(coalesce(p->'shields','[]'::jsonb)) with ordinality t(w,n);
  p:=p||jsonb_build_object('shields',item);
  if not(coalesce(p->'currentEquipment','{}'::jsonb) ?| array['rightHand','leftHand']) then
   assignment:=exists(select 1 from jsonb_array_elements((p->'weapons')||(p->'shields')) w where nullif(w->>'hand','') is not null);
   eq:='{}'::jsonb;
   for entry in select w,n from jsonb_array_elements(p->'weapons') with ordinality t(w,n) loop
    chosen:=case when assignment then coalesce(entry.w->>'hand','none') when entry.n=1 then case when entry.w->>'handling'='2H' then 'both' else 'right' end
     when entry.n=2 and jsonb_array_length(p->'shields')=0 then 'left' else 'none' end;
    if entry.w->>'handling'='2H' and chosen<>'none' then chosen:='both'; end if;
    ref:=jsonb_build_object('kind','weapon','itemId',entry.w->>'equipId','hands',case chosen when 'both' then 2 else 1 end);
    if chosen='both' and not(eq ?| array['rightHand','leftHand']) then eq:=jsonb_build_object('rightHand',ref,'leftHand',ref);
    elsif chosen in ('right','left') and not(eq ? (chosen||'Hand')) then eq:=eq||jsonb_build_object(chosen||'Hand',ref); end if;
   end loop;
   shield:=p#>'{shields,0}'; chosen:=case when assignment then shield->>'hand' else 'left' end;
   if shield is not null and chosen in ('right','left') and not(eq ? (chosen||'Hand')) then
    eq:=eq||jsonb_build_object(chosen||'Hand',jsonb_build_object('kind','shield','itemId',shield->>'equipId','hands',1)); end if;
   p:=p||jsonb_build_object('currentEquipment',eq);
  end if;
 end if;
 eq:=coalesce(b.state->'equipment_override',p->'currentEquipment','{}'::jsonb);
 sty:=coalesce(nullif(p#>>'{base,Styrka,v}','')::numeric,nullif(p#>>'{base,STY}','')::numeric,
  nullif(b.state#>>'{attributes,STY}','')::numeric,nullif(p->>'sty','')::numeric,10);
 select coalesce(sum(e.strength*(e.parameters->>'points_per_eg')::numeric*(d.modifiers->>'direction')::numeric),0)
 into delta from public.combatant_effects e join public.rule_effects d on d.id=e.effect_id
 where e.combatant_id=b.id and e.status='active' and d.active and d.modifiers->>'type'='attribute_delta'
  and e.parameters->>'attribute'='STY' and (d.modifiers->>'direction') in ('-1','1')
  and e.parameters->>'points_per_eg' ~ '^[0-9]+([.][0-9]+)?$'
  and (e.parameters->>'points_per_eg')::numeric>=1 and e.strength>=1
  and e.applied_round<=i.round_number and (e.expires_round is null or e.expires_round>=i.round_number)
  and (e.expires_at is null or e.expires_at>now());
 sty:=greatest(1,sty+delta);
 foreach slot in array array['rightHand','leftHand'] loop
  ref:=eq->slot; kind:=ref->>'kind'; item:=null;
  if ref->>'itemId' is not null then
   select w into item from jsonb_array_elements(coalesce(p->(case kind when 'weapon' then 'weapons' when 'shield' then 'shields' else 'equipment' end),'[]'::jsonb)) w
    where coalesce(w->>'equipId',w->>'id',w->>'name')=ref->>'itemId' limit 1;
  end if;
  if item is null or coalesce(b.state->'broken_weapon_keys','[]'::jsonb) ? (ref->>'itemId')
   or coalesce(b.state->'dropped_weapon_keys','[]'::jsonb) ? (ref->>'itemId')
   or item->>'destroyed'='true' or item->>'dropped'='true' then continue; end if;
  g:=null; linked:=false; usable:=true;
  if kind='weapon' then
   select * into r from public.rule_weapons
    where id::text=coalesce(nullif(item->>'weaponTypeId',''),nullif(item->>'weapon_id',''),'') or name=item->>'name'
    order by (id::text=coalesce(nullif(item->>'weaponTypeId',''),nullif(item->>'weapon_id',''),'')) desc limit 1;
   handling:=coalesce(nullif(item->>'handling',''),r.handling);
   req:=coalesce(nullif(item->>'strengthGroup','')::integer,r.strength_group);
   linked:=handling is not null and req is not null;
   if linked then g:=public.rule_weapon_grip(handling,req,public.rule_strength_group(sty));
   else g:=jsonb_build_object('can_use',true,'hands',case when handling='2H' or ref->>'hands'='2' then 2 else 1 end,'gl_multiplier',1,'status','legacy'); end if;
   usable:=(g->>'can_use')::boolean;
  end if;
  hs:=hs||jsonb_build_object(slot,jsonb_build_object('item',item,'kind',kind,'ref',ref,'grip',g,'linked',linked,'usable',usable));
 end loop;
 foreach slot in array array['rightHand','leftHand'] loop
  other:=case slot when 'rightHand' then 'leftHand' else 'rightHand' end;
  if hs#>>array[slot,'kind']<>'weapon' then continue; end if;
  opposite:=hs->other;
  if hs#>>array[slot,'grip','hands']='2' then
   if opposite is not null and opposite#>>'{ref,itemId}'<>hs#>>array[slot,'ref','itemId'] then
    hs:=jsonb_set(jsonb_set(hs,array[slot,'usable'],'false'),array[other,'usable'],'false');
   elsif opposite is null then hs:=hs||jsonb_build_object(other,hs->slot); end if;
  elsif opposite#>>'{ref,itemId}'=hs#>>array[slot,'ref','itemId'] then
   hs:=hs-(case when hs#>>array[slot,'ref','primaryHand']='leftHand' then 'rightHand' else 'leftHand' end);
  end if;
 end loop;
 return jsonb_build_object('profile',p,'hands',hs,'strength_group',public.rule_strength_group(sty),
  'sword_hand',public.combat_sword_hand(coalesce(p#>>'{derived,Svärdshand}',p->>'swordHand'),
   coalesce((p->>'ambidextrous')::boolean,false) or coalesce((b.state#>>'{attributes,ambidextrous}')::boolean,false)));
end $$;

create or replace function public.combat_two_weapon_context(p_combatant_id uuid,p_first_hand text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 c jsonb:=public.combat_hand_context(p_combatant_id); a jsonb; b jsonb; sk jsonb; spec jsonb;
 first_hand text; second_hand text; x text; y text; fv numeric; modifier integer;
begin
 first_hand:=case when c->>'sword_hand'='both' then p_first_hand else c->>'sword_hand' end;
 if first_hand is null or first_hand not in ('rightHand','leftHand') then raise exception 'Välj förstahand.'; end if;
 second_hand:=case first_hand when 'rightHand' then 'leftHand' else 'rightHand' end;
 a:=c#>array['hands',first_hand]; b:=c#>array['hands',second_hand];
 if a is null or b is null or a->>'kind'<>'weapon' or b->>'kind'<>'weapon'
  or a#>>'{ref,itemId}'=b#>>'{ref,itemId}'
  or a->>'usable'<>'true' or b->>'usable'<>'true'
  or a->>'linked'<>'true' or b->>'linked'<>'true'
  or a#>>'{grip,hands}'<>'1' or b#>>'{grip,hands}'<>'1'
  or coalesce(a#>>'{item,weaponCategory}',a#>>'{item,category}','melee')<>'melee'
  or coalesce(b#>>'{item,weaponCategory}',b#>>'{item,category}','melee')<>'melee'
 then raise exception 'Två vapen kräver två tillgängliga enhandsvapen vid aktuell STY.'; end if;
 select s into sk from jsonb_array_elements(coalesce(c#>'{profile,skills}','[]'::jsonb)) s
  where coalesce(nullif(s->>'skillId',''),s->>'skill_id')='tva_vapen' limit 1;
 if sk is null or coalesce(nullif(sk->>'fv','')::numeric,0)<=0 then raise exception 'Två vapen kräver tränat FV (BC 0).'; end if;
 x:=coalesce(nullif(a#>>'{item,weaponTypeId}',''),nullif(a#>>'{item,weapon_id}',''),a#>>'{item,name}');
 y:=coalesce(nullif(b#>>'{item,weaponTypeId}',''),nullif(b#>>'{item,weapon_id}',''),b#>>'{item,name}');
 select s into spec from jsonb_array_elements(coalesce(sk->'specializations','[]'::jsonb)) s
  where (s->>'swordWeaponId'=x and s->>'shieldWeaponId'=y)
   or (c->>'sword_hand'='both' and s->>'swordWeaponId'=y and s->>'shieldWeaponId'=x) limit 1;
 modifier:=case when spec is null then -15 else 0 end;
 fv:=coalesce(nullif(spec->>'fv','')::numeric,(sk->>'fv')::numeric)+modifier;
 return c||jsonb_build_object('first_hand',first_hand,'second_hand',second_hand,'fv',fv,'modifier',modifier,'trained',spec is not null);
end $$;

create or replace function public.combat_plan_two_weapons(p_combatant_id uuid,p_mode text,p_first_hand text default 'rightHand')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 b public.combatants%rowtype; i public.combat_instances%rowtype; c jsonb; held jsonb;
 n integer; slot text; hand text; typ text; source jsonb; is_reaction boolean;
begin
 if p_mode is null or p_mode not in ('attack_attack','attack_parry','parry_parry') then raise exception 'Ogiltig kombination.'; end if;
 select * into b from public.combatants where id=p_combatant_id;
 if not found then raise exception 'Kombatanten saknas.'; end if;
 select * into i from public.combat_instances where id=b.combat_id for update;
 perform 1 from public.combatants where id=b.id for update;
 if auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(b.campaign_id)) then raise exception 'Endast SL får välja stridshandlingar.'; end if;
 is_reaction:=p_mode<>'attack_attack' and exists(select 1 from public.combat_actions a where a.combat_id=i.id and a.round_number=i.round_number
  and a.target_combatant_id=b.id and a.action_type='attack' and a.result->>'awaiting_parry'='true' and a.result->>'parry_decision' is null);
 if i.status<>'active' or (i.active_actor_id is distinct from b.id and not is_reaction) or i.phase='late'
  or b.status in ('dead','removed','defeated','unconscious')
  or b.movement_remaining < b.movement_max/2 then raise exception 'Kombinationen kan inte väljas nu.'; end if;
 if exists(select 1 from public.combat_actions a where a.combatant_id=b.id and a.round_number=i.round_number
  and a.slot_key in ('primary','secondary') and a.status in ('pending','resolving','resolved')) then raise exception 'En handling är redan förbrukad.'; end if;
 if exists(select 1 from public.combat_actions a where a.combatant_id=b.id and a.round_number<=i.round_number
  and a.source_data->>'casting_spell'='true' and a.status='planned') then raise exception 'Avsluta först den förberedda besvärjelsen.'; end if;
 c:=public.combat_two_weapon_context(b.id,p_first_hand);
 for n in 1..2 loop
  slot:=case n when 1 then 'primary' else 'secondary' end;
  hand:=case n when 1 then c->>'first_hand' else c->>'second_hand' end;
  held:=c#>array['hands',hand];
  typ:=case when p_mode='parry_parry' or (p_mode='attack_parry' and n=2) then 'parry' else 'attack' end;
  source:=jsonb_build_object('two_weapons',true,'combination_mode',p_mode,'first_hand',c->>'first_hand',
   'action_key',typ,'label',case typ when 'attack' then 'Attack' else 'Parera' end,
   'mode',case typ when 'attack' then 'melee' else 'reaction' end,'hand',hand,
   'weapon_key',held#>>'{ref,itemId}','weapon_name',held#>>'{item,name}',
   'weapon_id',coalesce(held#>>'{item,weaponTypeId}',held#>>'{item,weapon_id}'),
   'combination_modifier',c->'modifier');
  insert into public.combat_actions(combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,source_data,status,sequence,created_by)
   values(i.id,b.campaign_id,b.id,i.round_number,case when typ='parry' then 'reaction' when n=2 then 'late' else 'normal' end,
    typ,slot,source,case typ when 'parry' then 'reserved' else 'planned' end,coalesce((b.state->>'initiative_rank')::integer,1)-1,auth.uid())
  on conflict(combat_id,combatant_id,round_number,slot_key) where slot_key in ('primary','secondary') and status<>'cancelled'
   do update set phase=excluded.phase,action_type=excluded.action_type,source_data=excluded.source_data,
    status=excluded.status,result='{}'::jsonb,target_combatant_id=null,updated_at=now();
 end loop;
 return jsonb_build_object('planned',true,'mode',p_mode);
end $$;

-- One lock order (instance, actor, action) serializes competing GM clients.
-- A claim is persisted before any dice or damage; stale clients cannot re-use it.
create or replace function public.combat_claim_weapon_action(p_action_id uuid,p_target_id uuid,p_parry_key text default null,p_weapon_key text default null,p_projectile_key text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a public.combat_actions%rowtype; b public.combatants%rowtype; i public.combat_instances%rowtype;
 c jsonb; h jsonb; item jsonb; skill jsonb; rule public.rule_weapons%rowtype;
 hand text; weapon_key text; skill_id text; fv numeric; combo jsonb; ammo jsonb; reaction public.combat_actions%rowtype;
begin
 select * into a from public.combat_actions where id=p_action_id;
 if not found then raise exception 'Handlingen saknas.'; end if;
 select * into i from public.combat_instances where id=a.combat_id for update;
 select * into b from public.combatants where id=a.combatant_id and combat_id=i.id for update;
 select * into a from public.combat_actions where id=p_action_id for update;
 if auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Endast SL får verkställa handlingar.'; end if;
 if a.status not in ('planned','reserved') or a.round_number<>i.round_number or i.status<>'active'
  or a.action_type not in ('attack','parry') or b.status in ('dead','removed','defeated','unconscious')
  or b.movement_remaining < b.movement_max/2 then raise exception 'Handlingen är förbrukad eller inte tillgänglig.'; end if;
 if not exists(select 1 from public.combatants t where t.id=p_target_id and t.combat_id=i.id and t.id<>b.id) then raise exception 'Ogiltigt mål.'; end if;
 if a.action_type='attack' and (i.active_actor_id is distinct from b.id or
  ((a.slot_key='secondary') is distinct from (i.phase='late'))) then raise exception 'Fel plats i initiativordningen.'; end if;
 if exists(select 1 from public.combatant_effects e join public.rule_effects d on d.id=e.effect_id
  where e.combatant_id=b.id and e.status='active' and d.active and e.applied_round<=i.round_number
   and (e.expires_round is null or e.expires_round>=i.round_number) and (e.expires_at is null or e.expires_at>now())
   and (d.modifiers->>'type'='incapacitated' or (a.action_type='attack' and (d.modifiers->>'type'='skip_turns' or d.modifiers->>'disable_actions'='true'))
    or (a.action_type='parry' and d.modifiers->>'disable_reactions'='true'))) then raise exception 'En aktiv effekt spärrar handlingen.'; end if;
 c:=public.combat_hand_context(b.id);
 hand:=a.source_data->>'hand'; weapon_key:=coalesce(a.source_data->>'weapon_key',p_weapon_key);
 if a.source_data->>'weapon_key' is not null and p_weapon_key is not null and a.source_data->>'weapon_key'<>p_weapon_key then raise exception 'Vapenvalet har ändrats.'; end if;
 if a.action_type='parry' then
  select * into reaction from public.combat_actions where id=(a.source_data->>'reaction_to_action_id')::uuid for update;
  if not found or reaction.combat_id<>i.id or reaction.round_number<>i.round_number or reaction.target_combatant_id<>b.id
   or reaction.combatant_id<>p_target_id or reaction.result->>'awaiting_parry'<>'true' or reaction.result->>'parry_decision' is not null
   then raise exception 'Det inkommande anfallet är redan hanterat.'; end if;
  if p_parry_key is null then raise exception 'Parervapen saknas.'; end if;
  weapon_key:=substring(p_parry_key from position(':' in p_parry_key)+1);
 end if;
 if weapon_key='unarmed' and a.action_type='attack' then
  select nullif(s->>'fv','')::numeric into fv from jsonb_array_elements(coalesce(c#>'{profile,skills}','[]'::jsonb)) s
   where coalesce(nullif(s->>'skillId',''),s->>'skill_id')='slagsmal' limit 1;
 else
  if hand is null then
   select s into hand from unnest(array['rightHand','leftHand']) s where c#>>array['hands',s,'ref','itemId']=weapon_key limit 1;
  end if;
  h:=c#>array['hands',hand]; item:=h->'item';
  if h is null or h->>'usable'<>'true' or h#>>'{ref,itemId}' is distinct from weapon_key
   or (a.action_type='attack' and h->>'kind'<>'weapon') then raise exception 'Vapnet är inte tillgängligt i den valda handen.'; end if;
  if h->>'kind'='shield' or b.source_type in ('npc','monster') then fv:=nullif(item->>'fv','')::numeric;
  else
   select * into rule from public.rule_weapons where id::text=coalesce(nullif(item->>'weaponTypeId',''),nullif(item->>'weapon_id',''),'') or name=item->>'name'
    order by (id::text=coalesce(nullif(item->>'weaponTypeId',''),nullif(item->>'weapon_id',''),'')) desc limit 1;
   skill_id:=coalesce(nullif(item->>'skillId',''),nullif(item->>'skill_id',''),rule.skill_id);
   select s into skill from jsonb_array_elements(coalesce(c#>'{profile,skills}','[]'::jsonb)) s where coalesce(nullif(s->>'skillId',''),s->>'skill_id')=skill_id limit 1;
   if skill_id is not null then
    fv:=nullif(skill->>'fv','')::numeric;
    if coalesce(fv,0)<=0 then
     select nullif(c#>>array['profile','base',case upper(r.bc) when 'STY' then 'Styrka' when 'SMI' then 'Smidighet' when 'FYS' then 'Fysik' when 'STO' then 'Storlek' when 'INT' then 'Intelligens' when 'PSY' then 'Psykisk kraft' when 'KAR' then 'Karisma' end,'g'],'')::numeric
      into fv from public.rule_skills r where r.id=skill_id and upper(r.bc) in ('STY','SMI','FYS','STO','INT','PSY','KAR');
    end if;
   else fv:=nullif(item->>'fv','')::numeric; end if;
  end if;
 end if;
 if a.source_data->>'two_weapons'='true' then
  combo:=public.combat_two_weapon_context(b.id,a.source_data->>'first_hand');
  fv:=least(fv,(combo->>'fv')::numeric);
  if a.slot_key='secondary' and a.action_type='attack' and not exists(select 1 from public.combat_actions p
   where p.combat_id=i.id and p.combatant_id=b.id and p.round_number=i.round_number and p.slot_key='primary' and p.status='resolved' and p.action_type='attack')
   then raise exception 'Första attacken måste vara genomförd.'; end if;
 end if;
 if fv is null or fv<=0 then raise exception 'Handlingen saknar ett positivt FV.'; end if;
 if p_projectile_key is not null then
  if a.action_type<>'attack' then raise exception 'Endast attacker får förbruka ammunition.'; end if;
  ammo:=public.combat_spend_ammunition(a.id,weapon_key,p_projectile_key);
  if ammo->>'already_spent'='true' then raise exception 'Ammunitionen har redan förbrukats.'; end if;
 end if;
 update public.combat_actions set status='resolving',source_data=source_data||jsonb_build_object('hand',hand,'weapon_key',weapon_key),updated_at=now() where id=a.id;
 if a.action_type='parry' then
  update public.combat_actions set result=result||jsonb_build_object('parry_decision','resolving'),updated_at=now() where id=reaction.id;
 end if;
 return jsonb_build_object('claimed',true,'fv',fv,'hand',hand,'weapon',item,'grip',h->'grip','ammunition',ammo);
end $$;

-- Equipment edits are instance state, never writes to characters.data.
create or replace function public.combat_advance_turn(p_combat_id uuid,p_actor_id uuid,p_round integer,p_phase text,p_next_actor_id uuid,p_next_phase text,p_new_round boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare i public.combat_instances%rowtype;
begin
 select * into i from public.combat_instances where id=p_combat_id for update;
 if not found or auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(i.campaign_id))
  or i.status<>'active' or i.active_actor_id is distinct from p_actor_id or i.round_number is distinct from p_round or i.phase is distinct from p_phase
  then raise exception 'Turen har ändrats. Uppdatera striden.'; end if;
 if exists(select 1 from public.combat_actions a where a.combat_id=i.id and a.round_number=i.round_number
  and (a.status in ('pending','resolving') or (a.result->>'awaiting_parry'='true' and coalesce(a.result->>'hit_resolved','false')<>'true')))
  then raise exception 'Avsluta pågående slag och försvarsreaktioner före turbytet.'; end if;
 if p_new_round is true then
  if p_next_actor_id is not null or p_next_phase is distinct from 'initiative' then raise exception 'Ogiltig SR-övergång.'; end if;
  update public.combat_instances set active_actor_id=null,active_responder_id=null,phase='initiative',round_number=round_number+1,
   initiative='{"formula":"SMI+1T10","status":"pending","rolled_at":null,"order":[],"results":[]}',updated_at=now() where id=i.id;
 else
  if p_new_round is null or p_next_phase is null or p_next_phase not in ('movement','late') or p_next_actor_id is null
   or not exists(select 1 from public.combatants b where b.id=p_next_actor_id and b.combat_id=i.id) then raise exception 'Ogiltig nästa tur.'; end if;
  update public.combat_instances set active_actor_id=p_next_actor_id,active_responder_id=null,phase=p_next_phase,updated_at=now() where id=i.id;
 end if;
 return true;
end $$;

create or replace function public.combat_set_hand_equipment(p_combatant_id uuid,p_slot text,p_kind text,p_item_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.combatants%rowtype; i public.combat_instances%rowtype;
 c jsonb; eq jsonb; h jsonb; ref jsonb; other text;
begin
 select * into b from public.combatants where id=p_combatant_id;
 if not found then raise exception 'Kombatanten saknas.'; end if;
 select * into i from public.combat_instances where id=b.combat_id for update;
 select * into b from public.combatants where id=p_combatant_id for update;
 if auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(b.campaign_id)) or i.status<>'active'
  or p_slot is null or p_slot not in ('rightHand','leftHand') then raise exception 'Otillåtet utrustningsbyte.'; end if;
 c:=public.combat_hand_context(b.id); eq:=coalesce(b.state->'equipment_override',c#>'{profile,currentEquipment}','{}'::jsonb);
 other:=case p_slot when 'rightHand' then 'leftHand' else 'rightHand' end;
 if c#>>array['hands',p_slot,'grip','hands']='2' then eq:=eq||'{"rightHand":null,"leftHand":null}'::jsonb; end if;
 if p_item_id is null then eq:=jsonb_set(eq,array[p_slot],'null');
 else
  if p_kind is null or p_kind not in ('weapon','shield','equipment') or not exists(
   select 1 from jsonb_array_elements(coalesce(c#>array['profile',case p_kind when 'weapon' then 'weapons' when 'shield' then 'shields' else 'equipment' end],'[]'::jsonb)) w
   where coalesce(w->>'equipId',w->>'id',w->>'name')=p_item_id)
   then raise exception 'Föremålet finns inte hos kombatanten.'; end if;
  if eq#>>array[other,'itemId']=p_item_id then eq:=jsonb_set(eq,array[other],'null'); end if;
  ref:=jsonb_build_object('kind',p_kind,'itemId',p_item_id,'primaryHand',p_slot,'hands',1);
  eq:=jsonb_set(eq,array[p_slot],ref);
  update public.combatants set state=state||jsonb_build_object('equipment_override',eq) where id=b.id;
  c:=public.combat_hand_context(b.id); h:=c#>array['hands',p_slot];
  if h is null or (h->>'usable'<>'true' and not(h#>>'{grip,hands}'='2' and h#>>'{grip,can_use}'='true')) then raise exception 'Föremålet kan inte användas vid aktuell fattning och STY.'; end if;
  if h#>>'{grip,hands}'='2' then
   ref:=ref||jsonb_build_object('hands',2); eq:=eq||jsonb_build_object(p_slot,ref,other,ref);
  end if;
 end if;
 update public.combatants set state=state||jsonb_build_object('equipment_override',eq),updated_at=now() where id=b.id;
 return eq;
end $$;

create or replace function public.combat_undo_ammunition(p_action_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.combat_actions%rowtype; previous_status text; refunded boolean;
begin
 select * into a from public.combat_actions where id=p_action_id for update;
 if not found then return false; end if;
 if auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Endast SL får ångra ammunition.'; end if;
 if not exists(select 1 from public.combat_ammunition_spends where action_id=a.id) then return false; end if;
 previous_status:=a.status;
 update public.combat_actions set status='resolving' where id=a.id;
 refunded:=public.combat_refund_ammunition(a.id);
 -- The checkpoint restore/delete follows; keep its prior status on failure.
 update public.combat_actions set status=previous_status where id=a.id;
 return refunded;
end $$;

create or replace function public.combat_claim_hit(p_attack_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.combat_actions%rowtype; i public.combat_instances%rowtype;
begin
 select * into a from public.combat_actions where id=p_attack_id;
 if not found then raise exception 'Anfallet saknas.'; end if;
 select * into i from public.combat_instances where id=a.combat_id for update;
 select * into a from public.combat_actions where id=p_attack_id for update;
 if auth.uid() is null or not(private.is_admin() or private.is_campaign_gm(a.campaign_id))
  or a.round_number<>i.round_number or a.result->>'awaiting_parry'<>'true'
  or a.result->>'parry_decision' is not null then raise exception 'Anfallet är redan hanterat eller otillgängligt.'; end if;
 update public.combat_actions set result=result||jsonb_build_object('parry_decision','declining'),updated_at=now() where id=a.id;
 return true;
end $$;

-- Player polling watches this timestamp. All slots, gear and attribute effects
-- are part of the existing saved combat; no second synchronisation channel.
create or replace function public.combat_touch_instance()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 update public.combat_instances set updated_at=clock_timestamp() where id=coalesce(new.combat_id,old.combat_id);
 return coalesce(new,old);
end $$;
create trigger combat_hand_action_changed after insert or update or delete on public.combat_actions
 for each row execute function public.combat_touch_instance();
create trigger combat_hand_equipment_changed after update of state on public.combatants
 for each row execute function public.combat_touch_instance();
create trigger combat_hand_effect_changed after insert or update or delete on public.combatant_effects
 for each row execute function public.combat_touch_instance();

-- A player may edit their character but cannot update the GM-owned instance.
-- This private trigger propagates only a timestamp after the character's RLS
-- accepted the edit; it grants no new character or combat write permission.
create or replace function private.combat_touch_character_instances()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return new; end if;
 update public.combat_instances i set updated_at=clock_timestamp()
 where i.status in ('active','paused','setup') and exists(select 1 from public.combatants b
  where b.combat_id=i.id and b.source_type='character' and b.source_id=new.id);
 return new;
end $$;
create trigger combat_hand_character_changed after update of data on public.characters
 for each row when (old.data is distinct from new.data) execute function private.combat_touch_character_instances();

revoke all on function public.combat_sword_hand(text,boolean), public.combat_hand_context(uuid),
 public.combat_two_weapon_context(uuid,text),public.combat_plan_two_weapons(uuid,text,text),
 public.combat_claim_weapon_action(uuid,uuid,text,text,text),public.combat_claim_hit(uuid),public.combat_set_hand_equipment(uuid,text,text,text),
 public.combat_advance_turn(uuid,uuid,integer,text,uuid,text,boolean),
 public.combat_undo_ammunition(uuid),
 public.combat_touch_instance(),private.combat_touch_character_instances() from public,anon;
grant execute on function public.combat_sword_hand(text,boolean),public.combat_hand_context(uuid),
 public.combat_two_weapon_context(uuid,text),public.combat_plan_two_weapons(uuid,text,text),
 public.combat_claim_weapon_action(uuid,uuid,text,text,text),public.combat_claim_hit(uuid),public.combat_set_hand_equipment(uuid,text,text,text),
 public.combat_advance_turn(uuid,uuid,integer,text,uuid,text,boolean),public.combat_undo_ammunition(uuid) to authenticated;
