import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/20261117225000_arcane_kartakademin.sql', import.meta.url), 'utf8');
const map = '11111111-1111-4111-8111-111111111111';
const campaign = '22222222-2222-4222-8222-222222222222';
const character = '33333333-3333-4333-8333-333333333333';
const npc = '44444444-4444-4444-8444-444444444444';

it('keeps map settings and party position changes atomic and protects access by campaign role', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema private;
      create schema auth;
      create function auth.uid() returns uuid language sql as 'select ''55555555-5555-4555-8555-555555555555''::uuid';
      grant usage on schema private to authenticated;
      create function private.is_admin() returns boolean language sql as 'select false';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select current_setting(''test.role'', true) = ''gm''';
      create function private.is_campaign_member(uuid) returns boolean language sql as
        'select current_setting(''test.role'', true) in (''member'', ''gm'')';
      create function private.bump_campaign_map_signal() returns trigger language plpgsql as
        'begin return coalesce(new, old); end';
      create table campaign_maps (id uuid, campaign_id uuid, player_visible boolean, width int, height int, unique(id,campaign_id));
      create table characters (id uuid, campaign_id uuid, is_npc boolean not null, unique(id,campaign_id));
      insert into campaign_maps values ('${map}', '${campaign}', true, 24, 16);
      create table campaign_map_areas (map_id uuid, campaign_id uuid, location_id uuid, shape_type text, shape_data jsonb);
      create table campaign_location_state (location_id uuid, campaign_id uuid, status text);
      insert into campaign_location_state values ('${character}', '${campaign}', 'explored'),
        ('${npc}', '${campaign}', 'unexplored');
      insert into campaign_map_areas values
        ('${map}', '${campaign}', '${character}', 'polygon','{"points":[[0,0],[12,0],[12,16],[0,16]]}'),
        ('${map}', '${campaign}', '${npc}', 'rect','{"x":5,"y":0,"width":1,"height":16}'),
        ('${map}', '${campaign}', null, 'rect','{"x":8,"y":0,"width":1,"height":16}');
      insert into characters values ('${character}', '${campaign}', false), ('${npc}', '${campaign}', true);
      grant select on campaign_maps, characters to authenticated;
    `);
    await db.exec(migration);
    const config = {
      version: 1, darkness: .7, pixelsPerMeter: 40,
      secretObjects: ['hidden'],
      lights: [
        { name: 'SL notes', on: true, playerVisible: true, position: [2, 1] },
        { on: true, playerVisible: true, position: [18, 1] },
        { on: true, playerVisible: true, position: [5.5, 1] },
        { on: true, playerVisible: true, position: [8.5, 1] },
        { on: true, position: [3, 1] },
        { on: true, playerVisible: true, characterId: character },
      ],
      geometry: [{ points: [[10,0],[10,16]], light: true }],
      freeSight: { width: 24, height: 16, runs: [[0, 384]] },
    };
    const save = (revision, positions, settings = config) => db.query(
      'select save_campaign_map_academy($1,$2,$3,$4,$5) as revision',
      [map, campaign, JSON.stringify(settings), revision, JSON.stringify(positions)],
    );
    await db.exec("set role authenticated; set test.role = 'gm'");
    expect((await save(0, [{ character_id: character, position: [3, 4] }])).rows).toEqual([{ revision: 1 }]);
    await expect(save(1, [{ character_id: npc, position: [2, 5] }], { ...config, darkness: .8 })).rejects.toThrow(/row-level security/i);
    expect((await db.query('select revision, configuration from campaign_map_academy')).rows)
      .toEqual([{ revision: 1, configuration: config }]);
    await expect(save(0, [])).rejects.toThrow(/ändrats/);
    await db.exec("set test.role = 'member'");
    expect((await db.query('select position from campaign_map_character_positions')).rows).toEqual([]);
    expect((await db.query('select configuration from campaign_map_academy')).rows).toEqual([]);
    const render = () => db.query('select read_campaign_map_academy_player($1) as data', [map]);
    const { data } = (await render()).rows[0];
    expect(data.lights.map(light => light.position)).toEqual([[2, 1], [3, 4]]);
    expect(data.lights.every(light => !('name' in light) && !('characterId' in light))).toBe(true);
    expect(data).not.toHaveProperty('secretObjects');
    expect(data.geometry).toEqual([]);
    const cells = new Set(data.freeSight.runs.flatMap(([start,len]) => Array.from({length:len}, (_, i) => start+i)));
    expect(cells.has(2)).toBe(true);
    for (const hidden of [5,8,9,10,18]) expect(cells.has(hidden)).toBe(false);
    await expect(save(1, [])).rejects.toThrow(/ändrats/);
    await db.exec("set test.role = 'outsider'");
    expect((await render()).rows).toEqual([{ data: null }]);
    expect((await db.query('select configuration from campaign_map_academy')).rows).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(db.query('select configuration from campaign_map_academy')).rejects.toThrow(/permission denied/);
    await expect(render()).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
}, 15000);
