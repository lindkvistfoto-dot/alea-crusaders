import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20261117070000_arcane_object_library.sql', import.meta.url), 'utf8');
const campaign = '11111111-1111-4111-8111-111111111111';
const map = '22222222-2222-4222-8222-222222222222';
const explored = '33333333-3333-4333-8333-333333333333';
const unexplored = '44444444-4444-4444-8444-444444444444';

it('shares objects only inside explored parts of a player-visible map', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema private;
      grant usage on schema private to authenticated;
      create function private.is_admin() returns boolean language sql as 'select current_setting(''test.role'',true) = ''admin''';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select $1 = ''${campaign}''::uuid and current_setting(''test.role'', true) = ''gm''';
      create function private.is_campaign_member(uuid) returns boolean language sql as
        'select current_setting(''test.role'', true) = ''member''';
      create function private.bump_campaign_map_signal() returns trigger language plpgsql as
        'begin return coalesce(new, old); end';
      create function public.alea_set_updated_at() returns trigger language plpgsql as
        'begin new.updated_at := now(); return new; end';
      create table campaigns (id uuid primary key);
      create table profiles (id uuid primary key);
      create table campaign_maps (id uuid, campaign_id uuid, player_visible boolean, unique(id,campaign_id));
      create table campaign_map_areas (map_id uuid, campaign_id uuid, location_id uuid, shape_type text, shape_data jsonb);
      create table campaign_location_state (location_id uuid, campaign_id uuid, status text);
      insert into campaigns values ('${campaign}');
      insert into campaign_maps values ('${map}', '${campaign}', true);
      insert into campaign_location_state values
        ('${explored}', '${campaign}', 'explored'),
        ('${unexplored}', '${campaign}', 'unexplored');
      insert into campaign_map_areas values
        ('${map}', '${campaign}', '${explored}', 'polygon','{"points":[[0,0],[12,0],[12,16],[0,16]]}'),
        ('${map}', '${campaign}', '${unexplored}', 'rect','{"x":5,"y":0,"width":1,"height":16}'),
        ('${map}', '${campaign}', null, 'rect','{"x":8,"y":0,"width":1,"height":16}');
    `);
    await db.exec(migration);
    await db.exec(`
      insert into campaign_map_objects (campaign_id,map_id,object_definition_id,x,y)
        select '${campaign}', '${map}', id, x, 1
        from arcane_object_definitions cross join (values (2), (5.5), (8.5), (18)) points(x)
        where object_key = 'wooden-table';
      set role authenticated;
    `);
    const readObjects = async () => (await db.query('select x::float8 as x from campaign_map_objects order by x')).rows.map(row => row.x);
    await db.exec("set test.role = 'gm'");
    expect(await readObjects()).toEqual([2, 5.5, 8.5, 18]);
    await db.exec("set test.role = 'member'");
    expect(await readObjects()).toEqual([2]);
    await db.exec(`reset role; update campaign_location_state set status='explored' where location_id='${unexplored}'; set role authenticated;`);
    expect(await readObjects()).toEqual([2, 5.5]);
    await db.exec('reset role; update campaign_maps set player_visible=false; set role authenticated;');
    expect(await readObjects()).toEqual([]);
    await db.exec('reset role; update campaign_maps set player_visible=true; set role authenticated;');
    await db.exec("set test.role = 'outsider'");
    expect(await readObjects()).toEqual([]);
    await db.exec('reset role; set role anon;');
    await expect(readObjects()).rejects.toThrow(/permission denied/);

    // Capture the exact map edition in the same transaction as the encounter insert.
    await db.exec(`reset role;
      create schema auth;
      create function auth.uid() returns uuid language sql as 'select ''${explored}''::uuid';
      alter table campaign_maps add width int default 24, add height int default 16, add image_path text default 'crypt.webp';
      update campaign_maps set pixels_per_meter=2;
      create table campaign_map_academy(map_id uuid,campaign_id uuid,configuration jsonb);
      insert into campaign_map_academy values ('${map}','${campaign}','{"lights":[{"name":"Hemlig fackla"}]}');
      create table combat_instances(id uuid primary key,map_id uuid,campaign_id uuid,settings jsonb,status text default 'setup',
        updated_at timestamptz default now());
      grant usage on schema auth to authenticated;
      grant select, update on combat_instances to authenticated;
      create table arcane_system_assets(asset_key text primary key,asset_path text);
      insert into arcane_system_assets values ('arcane-object-wooden-table','original-art');
    `);
    const snapshot = readFileSync(new URL('../supabase/migrations/20261119193000_combat_map_snapshots.sql', import.meta.url), 'utf8');
    await db.exec(snapshot);
    const create = scale => db.query('insert into combat_instances(id,map_id,campaign_id,settings) values ($1,$2,$3,$4)', [
      map, map, campaign, JSON.stringify({ academy_map:true, pixels_per_meter:scale, background_width:24, background_height:16 }),
    ]);
    await expect(create(3)).rejects.toThrow(/skala/);
    expect((await db.query('select count(*)::int as count from combat_instances')).rows[0].count).toBe(0);
    await create(2);
    const objects = async () => (await db.query('select read_combat_map_objects($1) as items',[map])).rows[0].items;
    const source = async () => (await db.query('select read_combat_map_source($1) as config',[map])).rows[0].config;
    await db.exec(`delete from campaign_map_objects;
      update campaign_map_academy set configuration='{}';
      update arcane_system_assets set asset_path='replacement';
      update arcane_object_definitions set width_m=5;
      set role authenticated; set test.role='gm';
    `);
    const lights = async (previous, next, id = map) =>
      (await db.query('select set_combat_map_lights_out($1,$2,$3) as saved',[id,previous,next])).rows[0].saved;
    // An unrelated initiative update landed between the GM reading the board and clicking.
    await db.query("update combat_instances set updated_at=clock_timestamp(), settings=settings || jsonb_build_object('initiative_done',true) where id=$1",[map]);
    expect(await lights(false,true)).toBe(true);
    expect(await lights(false,true)).toBe(false);
    expect((await db.query('select settings from combat_instances where id=$1',[map])).rows[0].settings)
      .toMatchObject({map_lights_out:true,initiative_done:true,pixels_per_meter:2});
    expect(await source()).toEqual({lights:[{name:'Hemlig fackla'}]});
    await db.exec("set test.role='member'");
    expect(await lights(true,false)).toBe(false);
    await db.exec("set test.role='outsider'");
    expect(await lights(true,false)).toBe(false);
    await db.exec("set test.role='admin'; update combat_instances set status='paused'");
    expect(await lights(true,false)).toBe(true);
    await db.exec("update combat_instances set status='completed'; set test.role='gm'");
    expect(await lights(false,true)).toBe(false);
    await db.exec("reset role; set role anon");
    await expect(lights(false,true)).rejects.toThrow(/permission denied/);
    await db.exec("reset role; update combat_instances set status='setup'; set role authenticated; set test.role='gm'");
    const original = await objects();
    expect(original.map(o=>o.x).sort((a,b)=>a-b)).toEqual([2,5.5,8.5,18]);
    expect(original.every(o=>o.definition.width_m===1.8 && o.asset_path==='original-art')).toBe(true);
    expect(await source()).toEqual({lights:[{name:'Hemlig fackla'}]});
    await expect(db.query('select * from private.combat_map_snapshots')).rejects.toThrow(/permission denied/);
    await db.exec("set test.role='member'");
    expect(await objects()).toEqual([]);
    await db.exec("reset role; update combat_instances set status='active'; set role authenticated;");
    expect((await objects()).map(o=>o.x).sort((a,b)=>a-b)).toEqual([2,5.5]);
    expect(await source()).toBeNull();
    await db.exec(`reset role; update campaign_location_state set status='unknown' where location_id='${unexplored}';
      set role authenticated; set test.role='member';`);
    expect((await objects()).map(o=>o.x)).toEqual([2]);
    await db.exec("set test.role='outsider'");
    expect(await objects()).toEqual([]);
    await db.exec("reset role; update campaign_maps set image_path='different.webp'; set role authenticated; set test.role='member'");
    await expect(objects()).rejects.toThrow(/Kartbilden har bytts/);
    await db.exec("reset role; update campaign_maps set player_visible=false; set role authenticated; set test.role='member'");
    expect(await objects()).toEqual([]);
    await db.exec('reset role; set role anon');
    await expect(objects()).rejects.toThrow(/permission denied/);
    await db.exec('reset role; delete from combat_instances');
    expect((await db.query('select count(*)::int as count from private.combat_map_snapshots')).rows[0].count).toBe(0);
  } finally {
    await db.close();
  }
}, 15000);
