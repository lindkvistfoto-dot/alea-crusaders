"""Isolated PostgreSQL integration checks. Requires pgserver + psycopg2-binary.

Run: PYTHONPATH=<isolated dependencies> python scripts/test-sisyphus-postgres.py
Creates a fresh local database in work/, never connects to a remote database.
The combat tables and grip function are read from the actual migration files.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import os
import subprocess
import uuid

import pgserver
import psycopg2
from psycopg2.extras import Json

ROOT = Path(__file__).resolve().parents[1]
WORK = Path(os.environ.get('SISYPHUS_WORK_DIR', ROOT / 'work' / 'sisyphus-postgres'))
WORK.mkdir(parents=True, exist_ok=True)
server = pgserver.get_server(WORK / 'pgdata', cleanup_mode=None)
admin = psycopg2.connect(server.get_uri())
admin.autocommit = True
database = 'sisyphus_' + uuid.uuid4().hex
with admin.cursor() as q:
    q.execute('create database ' + database)
uri = server.get_uri(database=database)
GM = '00000000-0000-0000-0000-000000000001'
PLAYER = '00000000-0000-0000-0000-000000000002'
campaign, combat, character, actor, target = [str(uuid.uuid4()) for _ in range(5)]
sword_type, dagger_type = str(uuid.uuid4()), str(uuid.uuid4())


def connection(user=None):
    c = psycopg2.connect(uri)
    c.autocommit = True
    if user:
        with c.cursor() as q:
            q.execute('set role authenticated')
            q.execute("select set_config('request.jwt.claim.sub',%s,false)", (user,))
    return c


def run(sql, args=(), user=GM):
    with connection(user) as c, c.cursor() as q:
        q.execute(sql, args)
        return q.fetchall() if q.description else []


bootstrap = """
do $$begin create role authenticated; exception when duplicate_object then null; end$$;
do $$begin create role anon; exception when duplicate_object then null; end$$;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function private.is_admin() returns boolean language sql stable as $$select auth.uid()='00000000-0000-0000-0000-000000000001'::uuid$$;
create function private.is_campaign_gm(uuid) returns boolean language sql stable as $$select private.is_admin()$$;
create function private.is_campaign_member(uuid) returns boolean language sql stable as $$select auth.uid() is not null$$;
create table public.campaigns(id uuid primary key);
create table public.campaign_events(id uuid primary key);
create table public.campaign_maps(id uuid primary key);
create table public.characters(id uuid primary key,campaign_id uuid,data jsonb not null,updated_at timestamptz default now());
create table public.rule_skills(id text primary key,name text,bc text);
create table public.rule_effects(id uuid primary key,active boolean,modifiers jsonb);
create table public.combatant_effects(id uuid primary key,combat_id uuid,combatant_id uuid,effect_id uuid,
 status text,applied_round integer,expires_round integer,expires_at timestamptz,strength numeric,parameters jsonb);
"""
with connection() as c, c.cursor() as q:
    q.execute(bootstrap)
    q.execute((ROOT / 'supabase/migrations/20261004_rule_weapon_mechanics.sql').read_text())
    q.execute("alter table public.rule_weapons add column skill_id text,add column tags text[] default '{}'")
    foundation = (ROOT / 'supabase/migrations/20261004_combat_foundation_v1.sql').read_text()
    for name in ['combat_instances', 'combatants', 'combat_actions', 'combat_log']:
        start = foundation.index('create table if not exists public.' + name + ' (')
        end = foundation.index('\n);', start) + 3
        q.execute(foundation[start:end])
    q.execute((ROOT/'supabase/migrations/20261009120000_combat_ammunition_registry.sql').read_text())
    haj=(ROOT/'supabase/migrations/20261008112200_haj_undo_safety.sql').read_text()
    q.execute(haj[:haj.index('CREATE OR REPLACE FUNCTION private.haj_combatant_move')])
    # Exercise real foundation RLS policies, using test-only identity predicates.
    start = foundation.index('drop policy if exists combat_actions_select')
    end = foundation.index('drop policy if exists combat_log_select', start)
    q.execute(foundation[start:end])
    q.execute('alter table public.combat_actions enable row level security')
    q.execute('grant usage on schema public,auth,private to authenticated')
    q.execute('grant select,insert,update,delete on all tables in schema public to authenticated')
    q.execute('grant usage,select on all sequences in schema public to authenticated')
    q.execute('grant execute on all functions in schema auth,private to authenticated')
    q.execute((ROOT / 'supabase/migrations/20261019091740_sisyphus_two_weapons.sql').read_text())
    q.execute('insert into auth.users values(%s),(%s)', (GM, PLAYER))
    q.execute('insert into campaigns values(%s)', (campaign,))
    q.execute("insert into combat_instances(id,campaign_id,status,phase,active_actor_id,initiative) values(%s,%s,'active','movement',%s,%s)",
              (combat, campaign, actor, Json({'status':'resolved','order':[actor,target]})))
    q.execute("insert into rule_skills values('swords','Svärd','0'),('daggers','Dolkar','0'),('tva_vapen','Två vapen','0')")
    for rid, name, handling, req, skill in [(sword_type,'Bastardsvärd','1-2H',4,'swords'),(dagger_type,'Dolk','1H',1,'daggers')]:
        q.execute("insert into rule_weapons(id,category,name,handling,strength_group,skill_id) values(%s,'melee',%s,%s,%s,%s)", (rid,name,handling,req,skill))
    data = {'base':{'Styrka':{'v':22,'g':5}},'derived':{'Svärdshand':'Höger'},
            'weapons':[{'equipId':'sword','weaponTypeId':sword_type,'name':'Bastardsvärd','fv':18,'damage':'1T10+1','handling':'1-2H','strengthGroup':4},
                       {'equipId':'dagger','weaponTypeId':dagger_type,'name':'Dolk','fv':16,'damage':'1T4+1','handling':'1H','strengthGroup':1}],
            'currentEquipment':{'rightHand':{'kind':'weapon','itemId':'sword'},'leftHand':{'kind':'weapon','itemId':'dagger'}},
            'skills':[{'skillId':'swords','fv':18},{'skillId':'daggers','fv':16},
                      {'skillId':'tva_vapen','fv':22,'specializations':[{'swordWeaponId':sword_type,'shieldWeaponId':dagger_type}]}]}
    q.execute('insert into characters(id,campaign_id,data) values(%s,%s,%s)', (character,campaign,Json(data)))
    for aid, name in [(actor,'Hero'),(target,'Enemy')]:
        q.execute("insert into combatants(id,combat_id,campaign_id,source_type,source_id,name_snapshot,movement_max,movement_remaining,state,current_kp,max_kp) values(%s,%s,%s,'character',%s,%s,10,10,%s,100,100)",
                  (aid,combat,campaign,character,name,Json({'initiative_rank':1 if aid==actor else 2})))

checks = []


def check(label, condition):
    assert condition, label
    checks.append(label)


def rejected(label, sql, args=(), user=GM):
    try:
        run(sql,args,user)
    except psycopg2.Error:
        checks.append(label)
        return
    raise AssertionError(label + ': unexpectedly accepted')


def plan(mode='attack_attack', first='rightHand'):
    return run('select combat_plan_two_weapons(%s,%s,%s)', (actor,mode,first))[0][0]


def rows():
    return run('select id::text,slot_key,status,source_data from combat_actions where combatant_id=%s and round_number=(select round_number from combat_instances where id=%s) and status<>\'cancelled\' order by slot_key', (actor,combat))


check('client matching matrix: Bastardsvärd groups 2–6',
      [r[0] for r in run("select rule_weapon_grip('1-2H',4,g) from generate_series(2,6) g")] == [
          {'can_use':False,'hands':2,'gl_multiplier':0,'status':'too_weak'},
          {'can_use':True,'hands':2,'gl_multiplier':.5,'status':'understrength'},
          {'can_use':True,'hands':2,'gl_multiplier':1,'status':'normal'},
          {'can_use':True,'hands':1,'gl_multiplier':1,'status':'normal'},
          {'can_use':True,'hands':1,'gl_multiplier':1,'status':'normal'}])
check('raw strength 22 converts to group 5', run('select combat_hand_context(%s)',(actor,))[0][0]['strength_group']==5)
rejected('player cannot plan', 'select combat_plan_two_weapons(%s,%s,%s)', (actor,'attack_attack','rightHand'),PLAYER)
check('atomic plan creates exactly two slots', plan()['planned'] and len(rows())==2)
check('repeated planning does not duplicate slots', plan()['planned'] and len(rows())==2)
primary,secondary = rows()
check('second attack is late and opposite hand', secondary[3]['hand']=='leftHand' and run('select phase from combat_actions where id=%s',(secondary[0],))[0][0]=='late')
rejected('second attack cannot precede normal attacks', 'select combat_claim_weapon_action(%s,%s,null,null)', (secondary[0],target))


def contender():
    try:
        run('select combat_claim_weapon_action(%s,%s,null,null)',(primary[0],target))
        return 'claimed'
    except psycopg2.Error:
        return 'rejected'


with ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(lambda _: contender(), range(2)))
check('two concurrent clients: one claim, one rejection', sorted(results)==['claimed','rejected'])
check('reload preserves resolving claim', rows()[0][2]=='resolving')
rejected('spent action cannot be replaced by a new combination','select combat_plan_two_weapons(%s,%s,%s)',(actor,'parry_parry','rightHand'))
run("update combat_actions set status='resolved',result='{\"success\":false}' where id=%s",(primary[0],))
run("update combat_instances set phase='late' where id=%s",(combat,))
check('second attack is independently claimable in late phase',run('select combat_claim_weapon_action(%s,%s,null,null)',(secondary[0],target))[0][0]['hand']=='leftHand')
run("update combat_actions set status='resolved' where id=%s",(secondary[0],))
run("update combat_instances set round_number=2,phase='movement' where id=%s",(combat,))
check('new SR obtains two new slots', plan('parry_parry')['planned'] and len(rows())==2)
reserved=rows()
check('parry reservations do not consume either hand', all(r[2]=='reserved' for r in reserved))


def incoming():
    aid=str(uuid.uuid4())
    run("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,target_combatant_id,result) values(%s,%s,%s,%s,2,'normal','attack','', 'resolved',%s,%s)",
        (aid,combat,campaign,target,actor,Json({'success':True,'awaiting_parry':True})))
    return aid


for index,r in enumerate(reserved):
    attack=incoming()
    run("update combat_actions set source_data=source_data||jsonb_build_object('reaction_to_action_id',%s::text) where id=%s",(attack,r[0]))
    weapon=r[3]['weapon_key']
    claim=run('select combat_claim_weapon_action(%s,%s,%s,null)',(r[0],target,'weapon:'+weapon))[0][0]
    check('parry '+str(index+1)+' has its own hand and FV',claim['hand']==r[3]['hand'] and claim['fv']>0)
    rejected('parry '+str(index+1)+' cannot be consumed twice','select combat_claim_weapon_action(%s,%s,%s,null)',(r[0],target,'weapon:'+weapon))
    run("update combat_actions set status='resolved',result=jsonb_build_object('parry',true,'reaction_to_action_id',%s::text) where id=%s",(attack,r[0]))
    run("update combat_actions set result=result||'{\"parry_decision\":\"parried\",\"awaiting_parry\":false}' where id=%s",(attack,))

run("update combat_instances set round_number=3 where id=%s",(combat,))
plan()
run("update combatants set state=state||'{\"dropped_weapon_keys\":[\"dagger\"]}' where id=%s",(actor,))
rejected('dropped offhand invalidates unspent combination','select combat_claim_weapon_action(%s,%s,null,null)',(rows()[0][0],target))
run("update combatants set state=state-'dropped_weapon_keys' where id=%s",(actor,))
run("update characters set data=jsonb_set(data,'{base,Styrka,v}','18') where id=%s",(character,))
rejected('lower STY makes simultaneous dagger invalid','select combat_claim_weapon_action(%s,%s,null,null)',(rows()[0][0],target))
run("update characters set data=jsonb_set(data,'{base,Styrka,v}','22') where id=%s",(character,))
run("update characters set data=jsonb_set(data,'{skills,2,specializations}','[]') where id=%s",(character,))
check('untrained combination is -15 FV',run('select combat_two_weapon_context(%s,%s)',(actor,'rightHand'))[0][0]['fv']==7)
run("update characters set data=jsonb_set(data,'{skills,2,fv}','0') where id=%s",(character,))
rejected('BC 0 without trained skill never gives a second action','select combat_plan_two_weapons(%s,%s,%s)',(actor,'attack_attack','rightHand'))

# Restore original source data for independent scenarios, preserving history.
run('update characters set data=%s where id=%s',(Json(data),character))
run("update combat_instances set round_number=4,phase='movement' where id=%s",(combat,))
plan('attack_parry')
mixed=rows()
run('select combat_claim_weapon_action(%s,%s,null,null)',(mixed[0][0],target))
run("update combat_actions set status='resolved' where id=%s",(mixed[0][0],))
attack=incoming()
# incoming() is used in round 4 too, so update its test round explicitly.
run('update combat_actions set round_number=4 where id=%s',(attack,))
run("update combat_actions set source_data=source_data||jsonb_build_object('reaction_to_action_id',%s::text) where id=%s",(attack,mixed[1][0]))


def defend(choice):
    try:
        if choice=='parry':
            run('select combat_claim_weapon_action(%s,%s,%s,null)',(mixed[1][0],target,'weapon:dagger'))
        else:
            run('select combat_claim_hit(%s)',(attack,))
        return 'claimed'
    except psycopg2.Error:
        return 'rejected'


with ThreadPoolExecutor(max_workers=2) as pool:
    results=list(pool.map(defend,['parry','decline']))
check('simultaneous parry and take-hit cannot resolve the same attack twice',sorted(results)==['claimed','rejected'])
check('attack + parry keeps distinct rows and hands',len(mixed)==2 and mixed[1][3]['hand']=='leftHand')
run("update combat_actions set status='resolved' where id=%s",(mixed[1][0],))

# Equipment changes use a saved instance override and preserve already spent rows.
permanent=run('select data from characters where id=%s',(character,))[0][0]
run('select combat_set_hand_equipment(%s,%s,null,null)',(actor,'leftHand'))
check('temporary empty hand never rewrites permanent equipment',run('select data from characters where id=%s',(character,))[0][0]==permanent)
check('gear edits retain spent actions',all(r[2]=='resolved' for r in rows()))
run('select combat_set_hand_equipment(%s,%s,%s,%s)',(actor,'leftHand','weapon','dagger'))
run("update characters set data=jsonb_set(data,'{base,Styrka,v}','18') where id=%s",(character,))
eq=run('select combat_set_hand_equipment(%s,%s,%s,%s)',(actor,'rightHand','weapon','sword'))[0][0]
check('explicitly drawing a required 2H weapon occupies both hands',eq['rightHand']['itemId']==eq['leftHand']['itemId']=='sword' and eq['leftHand']['hands']==2)
run('select combat_set_hand_equipment(%s,%s,null,null)',(actor,'rightHand'))
ctx=run('select combat_hand_context(%s)',(actor,))[0][0]
check('clearing either half of a 2H override clears both hands',not ctx['hands'])
run('update characters set data=%s where id=%s',(Json(data),character))
run("update combatants set state=state-'equipment_override' where id=%s",(actor,))

# A real attribute_delta row must have the same effect as the client projection.
run("update combat_instances set round_number=5 where id=%s",(combat,))
effect=str(uuid.uuid4()); definition=str(uuid.uuid4())
run("insert into rule_effects values(%s,true,'{\"type\":\"attribute_delta\",\"direction\":-1}')",(definition,))
run("insert into combatant_effects values(%s,%s,%s,%s,'active',4,null,null,4,'{\"attribute\":\"STY\",\"points_per_eg\":1}')",(effect,combat,actor,definition))
check('effective STY effects convert raw 22 minus 4 into group 4',run('select combat_hand_context(%s)',(actor,))[0][0]['strength_group']==4)
rejected('strength effect prevents a new illegal two-weapon plan','select combat_plan_two_weapons(%s,%s,%s)',(actor,'attack_attack','rightHand'))
run("update combatant_effects set status='removed' where id=%s",(effect,))

before=run('select updated_at from combat_instances where id=%s',(combat,))[0][0]
run("update characters set data=jsonb_set(data,'{derived,Svärdshand}','\"Vänster\"') where id=%s",(character,),PLAYER)
check('player character edit notifies the combat timestamp',run('select updated_at from combat_instances where id=%s',(combat,))[0][0]>before)
ctx=run('select combat_two_weapon_context(%s,%s)',(actor,'rightHand'))[0][0]
check('left-handed source preference determines ordered combination',ctx['first_hand']=='leftHand' and not ctx['trained'])
run("update characters set data=jsonb_set(data,'{derived,Svärdshand}','\"Båda\"') where id=%s",(character,))
ctx=run('select combat_two_weapon_context(%s,%s)',(actor,'leftHand'))[0][0]
check('ambidextrous specialization accepts either orientation',ctx['first_hand']=='leftHand' and ctx['trained'])

# NPCs retain their weapon FV, including old snapshots lacking equip IDs/refs.
npc=str(uuid.uuid4())
run("insert into combatants(id,combat_id,campaign_id,source_type,source_id,name_snapshot,movement_max,movement_remaining,state) values(%s,%s,%s,'npc',%s,'Legacy NPC',10,10,%s)",
    (npc,combat,campaign,str(uuid.uuid4()),Json({'attack_profile':{'sty':22,'ambidextrous':True,'weapons':[{'name':'Bastardsvärd','weapon_id':sword_type,'handling':'1-2H','strengthGroup':4,'fv':13}]}})))
ctx=run('select combat_hand_context(%s)',(npc,))[0][0]
check('legacy NPC snapshot receives a held right-hand weapon without altering state',ctx['hands']['rightHand']['ref']['itemId']=='npc-weapon-0')
run('update combat_instances set active_actor_id=%s where id=%s',(npc,combat))
aid=str(uuid.uuid4())
run("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,source_data) select %s,id,campaign_id,%s,round_number,'normal','attack','primary','planned','{\"weapon_key\":\"npc-weapon-0\"}' from combat_instances where id=%s",(aid,npc,combat))
check('NPC attack uses existing weapon FV without a character skill row',run('select combat_claim_weapon_action(%s,%s,null,null)',(aid,target))[0][0]['fv']==13)
rejected('turn cannot advance while an attack is resolving','select combat_advance_turn(%s,%s,5,%s,%s,%s,false)',(combat,npc,'movement',actor,'movement'))
run("update combat_actions set status='resolved' where id=%s",(aid,))
run('select combat_advance_turn(%s,%s,5,%s,%s,%s,false)',(combat,npc,'movement',actor,'movement'))
rejected('stale client cannot advance the same turn again','select combat_advance_turn(%s,%s,5,%s,%s,%s,false)',(combat,npc,'movement',actor,'movement'))
run("update combatants set status='removed' where id=%s",(npc,))

# Unarmed combat uses the registered Slagsmål skill, never an invented base FV.
run('update characters set data=%s where id=%s',(Json(data),character))
run("update combat_instances set round_number=6 where id=%s",(combat,))
run("update characters set data=jsonb_set(data,'{skills}',(data->'skills')||'[{\"skillId\":\"slagsmal\",\"fv\":12}]') where id=%s",(character,))
aid=str(uuid.uuid4())
run("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,source_data) values(%s,%s,%s,%s,6,'normal','attack','primary','planned','{\"weapon_key\":\"unarmed\"}')",(aid,combat,campaign,actor))
check('unarmed attack uses trained Slagsmål FV',run('select combat_claim_weapon_action(%s,%s,null,null)',(aid,target))[0][0]['fv']==12)
run("update combat_actions set status='resolved' where id=%s",(aid,))

run("update combat_instances set round_number=7 where id=%s",(combat,))
bow_type=str(uuid.uuid4())
run("insert into rule_skills values('pilbagar','Pilbågar','0')")
run("insert into rule_weapons(id,category,name,handling,strength_group,skill_id,projectile_key) values(%s,'projectile','Kortbåge','2H',1,'pilbagar','arrow')",(bow_type,))
archer=dict(data,weapons=[{'equipId':'bow','weaponTypeId':bow_type,'name':'Kortbåge','weaponCategory':'projectile','handling':'2H','strengthGroup':1,'damage':'1T6+1'}],
            projectiles=[{'projectileKey':'arrow','count':3}],skills=[{'skillId':'pilbagar','fv':14}],
            currentEquipment={'rightHand':{'kind':'weapon','itemId':'bow','hands':2},'leftHand':{'kind':'weapon','itemId':'bow','hands':2}})
run('update characters set data=%s where id=%s',(Json(archer),character))
aid=str(uuid.uuid4())
run("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,source_data) values(%s,%s,%s,%s,7,'normal','attack','primary','planned','{\"weapon_key\":\"bow\"}')",(aid,combat,campaign,actor))
claim=run('select combat_claim_weapon_action(%s,%s,null,%s,%s)',(aid,target,'bow','arrow'))[0][0]
check('ranged claim atomically validates grip/FV and spends exactly one original projectile',claim['fv']==14 and claim['ammunition']['remaining']==2)
rejected('ranged claim cannot spend a second projectile for the same action','select combat_claim_weapon_action(%s,%s,null,%s,%s)',(aid,target,'bow','arrow'))
run("update combat_actions set status='resolved' where id=%s",(aid,))
check('explicit undo refunds a resolved shot once',run('select combat_undo_ammunition(%s)',(aid,))[0][0] is True)
check('repeated undo never duplicates ammunition',run('select combat_undo_ammunition(%s)',(aid,))[0][0] is False and run("select data#>>'{projectiles,0,count}' from characters where id=%s",(character,))[0][0]=='3')

run("update combat_instances set round_number=8 where id=%s",(combat,))
shielded=dict(data,shields=[{'equipId':'shield','name':'Sköld','fv':15}],currentEquipment={'rightHand':{'kind':'weapon','itemId':'sword'},'leftHand':{'kind':'shield','itemId':'shield'}})
run('update characters set data=%s where id=%s',(Json(shielded),character))
incoming_id=incoming();run('update combat_actions set round_number=8 where id=%s',(incoming_id,))
aid=str(uuid.uuid4())
run("insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,slot_key,status,source_data) values(%s,%s,%s,%s,8,'reaction','parry','primary','reserved',%s)",
    (aid,combat,campaign,actor,Json({'action_key':'parry','reaction_to_action_id':incoming_id,'hand':'leftHand'})))
claim=run('select combat_claim_weapon_action(%s,%s,%s,null)',(aid,target,'shield:shield'))[0][0]
check('normal sword/shield parry still uses its own shield FV and hand',claim['fv']==15 and claim['hand']=='leftHand')
rejected('normal shield parry remains single use','select combat_claim_weapon_action(%s,%s,%s,null)',(aid,target,'shield:shield'))
run("update combat_actions set status='resolved' where id=%s",(aid,))
check('anonymous cannot invoke new action RPCs',run("select not has_function_privilege('anon','public.combat_claim_weapon_action(uuid,uuid,text,text,text)','EXECUTE')")[0][0])

# Leave an independent fresh round for the browser integration test.
run('update characters set data=%s where id=%s',(Json(data),character))
run("update combat_instances set round_number=9,phase='movement',active_actor_id=%s where id=%s",(actor,combat))
(WORK/'browser-fixture.json').write_text(json.dumps({'uri':uri,'campaign':campaign,'combat':combat,'character':character,'actor':actor,'target':target,'gm':GM,'player':PLAYER}))

# SQL oracle is consumed by the JS parity tests; no production query is needed.
oracle = run("select h,r,g,rule_weapon_grip(h,r,g) from unnest(array['1H','1-2H','2H']) h cross join generate_series(0,8) r cross join generate_series(0,10) g")
(WORK/'grip-oracle.json').write_text(json.dumps(oracle))
subprocess.run(['node','--input-type=module','-e',r'''
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
const ctx={};runInNewContext(readFileSync('src/features/combat/hand-rules.js','utf8'),ctx);
for(const [h,r,g,sql] of JSON.parse(readFileSync(process.argv[1],'utf8'))){
 const local=ctx.aleaHandRules.grip(h,r,g);
 assert.deepEqual({can_use:local.canUse,hands:local.hands,gl_multiplier:local.glMultiplier,status:local.status},sql);
}
''',str(WORK/'grip-oracle.json')],cwd=ROOT,check=True)
checks.append('297 client grip results match executed original SQL function')
print(json.dumps({'passed':len(checks),'failed':0,'checks':checks,'oracle_cases':len(oracle)},ensure_ascii=False,indent=2))
