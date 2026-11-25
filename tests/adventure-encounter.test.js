import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';

const sql=readFileSync(new URL('../supabase/migrations/20261125183150_adventure_encounters.sql',import.meta.url),'utf8');
it('pins two independent fights, preserves instance identities and commits map movement atomically',async()=>{
  const db=new PGlite();
  const [campaign,map,session,scene,hero,monster,reference]=Array.from({length:7},()=>crypto.randomUUID());
  try{
    // Mirror the fields used by the integration. Movement legality and cost
    // belong to the existing engine, represented here by its SQL contract.
    await db.exec(`
      create role authenticated;create role anon;create schema private;create schema auth;
      create function auth.uid() returns uuid language sql as 'select null::uuid';
      create function private.is_admin() returns bool language sql as 'select false';
      create function private.is_campaign_gm(uuid) returns bool language sql as
        'select current_setting(''test.role'')=''gm''';
      create table campaign_maps(id uuid primary key,campaign_id uuid,name text,height int);
      create table campaign_map_settings(campaign_id uuid,active_map_id uuid);
      create table campaign_map_academy(map_id uuid,configuration jsonb);
      create table game_sessions(id uuid,campaign_id uuid,status text);
      create table characters(id uuid,is_npc boolean);
      create table campaign_combat_scenes(id uuid,campaign_id uuid);
      create table campaign_combat_scene_combatants(id uuid,scene_id uuid,campaign_id uuid,name text,
        source_type text,source_id uuid,start_q int,start_r int,visible_to_players boolean);
      create table campaign_combat_scene_hexes(scene_id uuid,q int,r int,movement_mode text,sight_mode text,movement_cost numeric,notes text);
      create table adventure_map_figures(id uuid primary key,campaign_id uuid,session_id uuid,map_id uuid,
        q int,r int,name text,player_visible bool,character_id uuid,npc_character_id uuid,npc_id uuid,monster_id uuid,
        unique(session_id,character_id),unique(session_id,map_id,q,r));
      create table adventure_hex_state(campaign_id uuid,map_id uuid,session_id uuid,round_no int,paused_round int,spent jsonb,epoch int default 0,unique(session_id,map_id));
      create table combat_instances(id uuid primary key,campaign_id uuid,session_id uuid,map_id uuid,name text,status text,
        round_number int,phase text,initiative jsonb,settings jsonb,started_by uuid,started_at timestamptz,active_actor_id uuid);
      create table combatants(id uuid primary key,combat_id uuid,campaign_id uuid,source_type text,source_id uuid,
        source_instance_key text,name_snapshot text,side text,controller_user_id uuid,q int,r int,flying bool,
        visible_to_players bool,current_kp int,max_kp int,current_psy int,max_psy int,movement_max numeric,
        movement_remaining numeric,status text,state jsonb,sort_order int);
      create table combat_hexes(combat_id uuid,campaign_id uuid,q int,r int,movement_mode text,sight_mode text,movement_cost numeric,notes text);
      create function private.adventure_check_path(campaign_maps,adventure_map_figures,jsonb) returns void language plpgsql as
        'begin if $3 @> ''[[88,6]]''::jsonb then raise exception ''blocked''; end if; end';
      create function public.alea_move_multhex(uuid,int,int,numeric,jsonb) returns jsonb language sql as
        'update public.combatants set q=($5->-1->>''q'')::int,r=($5->-1->>''r'')::int,movement_remaining=movement_remaining-1
           where id=$1 and q=$2 and r=$3 and movement_remaining=$4 returning to_jsonb(combatants.*)';
      alter table combat_instances enable row level security;
      create policy members on combat_instances for all to authenticated using(true) with check(true);
      grant usage on schema auth,private to authenticated;grant all on all tables in schema public to authenticated;
      insert into campaign_maps values('${map}','${campaign}','Skelettbyn',1024);
      insert into campaign_map_settings values('${campaign}','${map}');
      insert into game_sessions values('${session}','${campaign}','active');
      insert into characters values('${hero}',false);
      insert into campaign_combat_scenes values('${scene}','${campaign}');
      insert into combat_instances(id,campaign_id,status) values('${reference}','${campaign}','active');
    `);
    await db.exec(sql);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261125194403_adventure_encounter_pause.sql',import.meta.url),'utf8'));
    const actors=[];
    for(const [i,key] of [hero,monster,monster].entries()){
      const sceneActor=crypto.randomUUID(),id=crypto.randomUUID(),figure=crypto.randomUUID();
      const type=i?'monster':'character';
      await db.query('insert into campaign_combat_scene_combatants values($1,$2,$3,$4,$5,$6,$7,6,true)',
        [sceneActor,scene,campaign,'Aktör '+i,type,key,i-1]);
      actors.push({id,scene_actor_id:sceneActor,figure_id:figure,source_id:key,q:i-1,r:6,movement_max:18,
        side:i?'enemies':'heroes',current_kp:10,max_kp:10,current_psy:2,max_psy:2,flying:false,state:{},sort_order:i});
    }
    const start=()=>db.query('select start_adventure_encounter($1,$2,$3,$4,$5) id',
      [map,session,scene,JSON.stringify(actors),JSON.stringify({order:actors.map(a=>a.id)})]);
    await db.exec(`set role authenticated;set test.role='player';set request.headers='{"x-client-info":"alea-adventure-combat"}'`);
    await expect(start()).rejects.toThrow(/Endast SL/);
    await db.exec("set test.role='gm'");
    const fight=(await start()).rows[0].id;
    expect((await start()).rows[0].id).toBe(fight);
    expect((await db.query('select distinct source_instance_key from combatants')).rows).toHaveLength(3);
    await db.exec("set request.headers='{}'");
    expect((await db.query('select id from combat_instances')).rows).toEqual([{id:reference}]);
    await db.exec(`set request.headers='{"x-client-info":"alea-adventure-combat"}'`);
    const move=(path)=>db.query('select move_adventure_combatant($1,-1,6,18,$2)',[actors[0].id,JSON.stringify(path)]);
    await expect(move([{q:88,r:6},{q:-2,r:6}])).rejects.toThrow(/blocked/);
    await move([{q:-2,r:6}]);
    expect((await db.query('select q,r from adventure_map_figures where character_id=$1',[hero])).rows).toEqual([{q:-2,r:6}]);
    await expect(move([{q:-3,r:6}])).rejects.toThrow(/flyttats/);
    const pause=value=>db.query('select set_adventure_encounter_paused($1,$2)',[fight,value]);
    await db.exec("set test.role='player'");
    await expect(pause(true)).rejects.toThrow(/Endast SL/);
    await db.exec("set test.role='gm'");
    await pause(true);await pause(true);
    await expect(move([{q:-3,r:6}])).rejects.toThrow();
    await db.query('update adventure_map_figures set q=-3 where character_id=$1',[hero]);
    await pause(false);await pause(false);
    expect((await db.query('select q,movement_remaining from combatants where id=$1',[actors[0].id])).rows[0]).toEqual({q:-3,movement_remaining:'17'});
    expect((await db.query('select active_actor_id,round_number,status from combat_instances where id=$1',[fight])).rows[0]).toEqual({active_actor_id:actors[0].id,round_number:1,status:'active'});
    await db.query("update combat_instances set status='completed' where id=$1",[fight]);
    actors.forEach(a=>{a.id=crypto.randomUUID();});
    actors[0].q=-3;
    const restart=(await start()).rows[0].id;
    expect(restart).not.toBe(fight);
    expect((await db.query('select q from combatants where combat_id=$1 and source_id=$2',[restart,hero])).rows[0].q).toBe(-3);
    expect((await db.query('select status from combat_instances where id=$1',[reference])).rows[0].status).toBe('active');
  }finally{await db.close();}
},30000);
