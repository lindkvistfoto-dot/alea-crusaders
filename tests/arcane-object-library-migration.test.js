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
      create function private.is_admin() returns boolean language sql as 'select false';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select current_setting(''test.role'', true) = ''gm''';
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
  } finally {
    await db.close();
  }
}, 15000);
