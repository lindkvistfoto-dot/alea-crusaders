import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
const baseline = migration('20261030091654_development_schema_baseline.sql');
const runtime = readFileSync(new URL('../features/combat/runtime.js', import.meta.url), 'utf8');
function runtimeFunction(name) {
  const start = runtime.indexOf('function ' + name + '(');
  return runtime.slice(start, runtime.indexOf('\nfunction ', start + 1));
}
const dbFunction = (source, start) => {
  const from = source.toLowerCase().indexOf(start.toLowerCase());
  if (from < 0) throw Error('Missing database function ' + start);
  return source.slice(from, source.indexOf('$$;', source.indexOf('$$', from) + 2) + 3);
};
const rawTables = ['combatants','combat_hexes','combat_actions','combat_log','combatant_effects',
  'combat_area_effects','combat_area_events','combat_ammunition_spends','combat_instances'];
const campaign = '00000000-0000-4000-8000-000000000001', map = '00000000-0000-4000-8000-000000000002';
const combat = '00000000-0000-4000-8000-000000000003', legacy = '00000000-0000-4000-8000-000000000004';
const hero = '00000000-0000-4000-8000-000000000005', hidden = '00000000-0000-4000-8000-000000000006';
const victim = '00000000-0000-4000-8000-000000000007', overlap = '00000000-0000-4000-8000-000000000008';
const lamp = '00000000-0000-4000-8000-000000000009';
it('withholds raw linked records and projects only authorized actors, hit events and actions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema private; create schema auth;
      create function auth.uid() returns uuid language sql as 'select ''${hero}''::uuid';
      create function private.is_admin() returns boolean language sql as 'select false';
      create function private.is_campaign_member(uuid) returns boolean language sql as
        'select $1=''${campaign}''::uuid and current_setting(''test.role'',true) in (''gm'',''member'')';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select $1=''${campaign}''::uuid and current_setting(''test.role'',true)=''gm''';
      grant usage on schema private,auth to authenticated;
      create table campaign_maps(id uuid,campaign_id uuid,player_visible boolean,image_path text,width int,height int);
      create table private.combat_map_snapshots(combat_id uuid,campaign_id uuid,map_id uuid,image_path text,width int,height int);
      create table campaign_map_areas(map_id uuid,campaign_id uuid,location_id uuid,shape_type text,shape_data jsonb);
      create table campaign_location_state(location_id uuid,campaign_id uuid,status text);
      create table campaign_map_signals(campaign_id uuid,revision bigint);
      create table combat_battlefield_objects(id uuid,combat_id uuid,campaign_id uuid,object_key text,asset_key text,
        name_snapshot text,q int,r int,rotation int,footprint jsonb,damage int,max_damage int,visible_to_players boolean);
    `);
    for (const table of [...rawTables, 'campaign_journal_entries']) {
      const start = baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."' + table + '"');
      await db.exec(baseline.slice(start, baseline.indexOf('\n);',start) + 3));
    }
    for (const table of [...rawTables,'combat_battlefield_objects','campaign_journal_entries']) {
      await db.exec('alter table '+table+' enable row level security; grant select on '+table+
        ' to authenticated; create policy existing_read on '+table+
        ' for select to authenticated using ('+(table==='combat_ammunition_spends'?'true':'private.is_campaign_member(campaign_id)')+
        (table==='campaign_journal_entries'?' and (player_visible or private.is_campaign_gm(campaign_id))':'')+')');
    }
    await db.exec(dbFunction(baseline,'create or replace function "public"."alea_footprint_cells"'));
    await db.exec(dbFunction(baseline,'create or replace function "public"."alea_footprint_shape"'));
    await db.exec(dbFunction(migration('20261117070000_arcane_object_library.sql'),'create function private.is_campaign_map_object_discovered'));
    await db.exec(dbFunction(migration('20261119200000_arcane_combat_map_projection.sql'),'create function private.battle_map_center'));
    await db.exec(dbFunction(migration('20261119200000_arcane_combat_map_projection.sql'),'create function private.battle_actor_explored'));
    await db.exec(migration('20261119223000_linked_battle_member_read.sql'));
    await db.exec(`
      insert into campaign_maps values ('${map}','${campaign}',true,'crypt.png',120,45);
      insert into private.combat_map_snapshots values ('${combat}','${campaign}','${map}','crypt.png',120,45);
      insert into campaign_map_areas values
        ('${map}','${campaign}','${hero}','rect','{"x":-5,"y":-5,"width":125,"height":45}'),
        ('${map}','${campaign}','${hidden}','rect','{"x":75,"y":-5,"width":40,"height":45}');
      insert into campaign_location_state values ('${hero}','${campaign}','explored'),('${hidden}','${campaign}','unknown');
      insert into combat_instances(id,campaign_id,map_id,status,settings,initiative,active_actor_id) values
        ('${combat}','${campaign}','${map}','active','{"academy_map":true,"pixels_per_meter":20,"gm_note":"SECRET"}',
          '{"order":["${hidden}","${hero}","${victim}"],"results":[{"gm_note":"SECRET"}]}','${hidden}'),
        ('${legacy}','${campaign}','${map}','active','{"old_schema":true}','{}',null);
      insert into combatants(id,combat_id,campaign_id,source_type,name_snapshot,q,r,visible_to_players,state) values
        ('${hero}','${combat}','${campaign}','quick_enemy','Astrid',0,0,true,'{"gm_note":"SECRET"}'),
        ('${victim}','${combat}','${campaign}','quick_enemy','Väktare',1,0,true,'{}'),
        ('${hidden}','${combat}','${campaign}','quick_enemy','SECRET',1,0,false,'{}'),
        ('${overlap}','${combat}','${campaign}','quick_enemy','SECRET',2,0,true,'{"footprint":{"shape":"line2","facing":0}}'),
        ('${lamp}','${combat}','${campaign}','quick_enemy','SECRET',0,0,true,'{"in_reserve":true}');
      insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,target_combatant_id,source_data)
      values(gen_random_uuid(),'${combat}','${campaign}','${hero}',1,'magic','spell','${victim}','{"notes":"SECRET"}'),
        (gen_random_uuid(),'${combat}','${campaign}','${hero}',1,'magic','spell','${hidden}','{}');
      insert into combat_actions(id,combat_id,campaign_id,combatant_id,round_number,phase,action_type,target_combatant_id,
        sequence,source_data,result,status)
      select gen_random_uuid(),'${combat}','${campaign}','${victim}',1,'normal','attack',target,5,
        '{"action_key":"attack","mode":"ranged","weapon_name":"SECRET"}',
        '{"outcome":"success","roll":7,"fv":13,"confirmation_roll":{"private":"SECRET"},"full_damage":false,
          "hit_location":{"key":"head","label":"SECRET","die":"1T8","table":"A","roll":8},
          "damage":{"net_damage":4,"weapon_damage_value":6,"damage_bonus_value":1,"armor_absorption":3,
            "kp_before":17,"kp_after":13,"armor_names":["SECRET"]},"private":"SECRET"}','resolved'
      from (values ('${hero}'::uuid),('${hidden}'::uuid)) as targets(target);
      insert into combat_log(id,combat_id,campaign_id,actor_id,target_id,round_number,phase,event_type,message,details) values
        (1,'${combat}','${campaign}','${hero}','${victim}',1,'magic','spell_attack','SECRET',
          '{"success":true,"hit_resolved":true,"target_results":[{"target_id":"${hidden}","damage":{"secret":"SECRET"}},{"target_id":"${victim}","damage":{"secret":"SECRET"}}]}'),
        (2,'${combat}','${campaign}','${hidden}','${hero}',1,'magic','attack','SECRET','{}');
      insert into campaign_journal_entries(campaign_id,event_type,title,message,details) values
        ('${campaign}','combat','Strid','SECRET','{"combat_id":"${combat}"}');
      insert into combat_battlefield_objects values
        (gen_random_uuid(),'${combat}','${campaign}','wall','wall','Mur',1,0,0,'[{"q":0,"r":0}]',0,10,true),
        (gen_random_uuid(),'${combat}','${campaign}','trap','trap','SECRET',3,0,0,'[{"q":0,"r":0}]',0,10,true);
      insert into combat_hexes(id,campaign_id,combat_id,q,r,notes) values
        (gen_random_uuid(),'${campaign}','${combat}',2,3,'SECRET');
      set role authenticated; set test.role='member';
    `);
    const read = async id => (await db.query('select read_battle_player($1,$2) as data',[campaign,id])).rows[0].data;
    const data = await read(combat);
    expect(JSON.stringify(data)).not.toMatch(new RegExp(['SECRET',hidden,overlap,lamp].join('|')));
    expect(data.combatants.map(c=>c.name_snapshot).sort()).toEqual(['Astrid','Väktare']);
    expect(data.instance).toMatchObject({active_actor_id:null,initiative:{order:[hero,victim]}});
    expect(data.combatants.map(c=>[c.state.initiative_rank,c.sort_order])).toEqual([[1,0],[2,1]]);
    expect(data.objects.map(o=>o.name_snapshot)).toEqual(['Mur']);
    expect(data.actions.map(a=>a.target_combatant_id).sort()).toEqual([hero,victim].sort());
    const attack = data.actions.find(a=>a.action_type==='attack');
    expect(attack.sequence).toBe(1);
    expect(attack.source_data).toEqual({action_key:'attack',mode:'ranged'});
    expect(attack.result).toMatchObject({outcome:'success',roll:7,fv:13,hit_location:{key:'head',label:'Huvud',roll:8},
      damage:{net_damage:4,kp_before:17,kp_after:13}});
    expect(attack.result.confirmation_roll).toBeUndefined();
    const ui = {escAttr:String,window:{},COMBAT_HIT_CAMERA:{},combatFumbleResultHtml:()=>''};
    runInNewContext(['combatOutcomeMeta','combatAttackResultHtml','combatHitLocationResultHtml','combatHitLocationCameraHtml',
      'combatHitLocationFigureHtml','combatParryResultHtml','combatDamageResultHtml'].map(runtimeFunction).join('\n'),ui);
    const panel=ui.combatAttackResultHtml(attack);
    expect(panel).toContain('LYCKAT SLAG');
    expect(panel).toContain('T20 <b>7</b> mot FV <b>13</b>');
    expect(panel).toContain('Huvud');
    expect(panel).toContain('17 − 4 = 13');

    expect(data.events.map(e=>e.details.target_results)).toEqual([[{target_id:victim,damage:true}]]);
    for (const table of ['combat_log','combat_actions','combatants','combat_hexes','combat_battlefield_objects','campaign_journal_entries'])
      expect((await db.query('select * from '+table)).rows).toEqual([]);
    expect((await db.query('select id from combat_instances')).rows).toEqual([{id:legacy}]);
    expect((await read(legacy)).instance.settings.old_schema).toBe(true);
    await db.exec("set test.role='gm'");
    expect((await db.query('select id from combatants')).rows).toHaveLength(5);
    expect((await db.query('select message from campaign_journal_entries')).rows[0].message).toBe('SECRET');
    await db.exec("set test.role='outsider'");
    expect(await read(combat)).toBeNull();
    await db.exec("reset role; update campaign_maps set player_visible=false; set role authenticated; set test.role='member'");
    expect(await read(combat)).toBeNull();
    await db.exec("reset role; update campaign_maps set player_visible=true,image_path='replacement.png'; set role authenticated; set test.role='member'");
    expect(await read(combat)).toBeNull();
    await db.exec('reset role; set role anon');
    await expect(read(combat)).rejects.toThrow(/permission denied/i);
  } finally { await db.close(); }
},20000);
