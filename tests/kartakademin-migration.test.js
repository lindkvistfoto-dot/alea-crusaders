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
    await db.exec(`
      alter table campaign_maps add column image_path text default 'crypt';
      create table private.combat_map_snapshots (combat_id uuid, configuration jsonb, map_id uuid, campaign_id uuid, image_path text, width int, height int);
      create table combat_instances (id uuid, map_id uuid, campaign_id uuid, settings jsonb, status text default 'active');
      create table combatants (id uuid, combat_id uuid, campaign_id uuid, source_type text, source_id uuid,
        visible_to_players boolean, status text, state jsonb, q int, r int, name_snapshot text);
      insert into combat_instances values ('${npc}','${map}','${campaign}',
        '{"academy_map":true,"pixels_per_meter":2,"offset_x":1,"offset_y":1}');
      insert into combatants values ('${character}','${npc}','${campaign}','character','${character}',true,'active','{}',1,0,'Astrid');
    `);
    const battleProjection = readFileSync(new URL('../supabase/migrations/20261119200000_arcane_combat_map_projection.sql', import.meta.url), 'utf8');
    const baseline = readFileSync(new URL('../supabase/migrations/20261030091654_development_schema_baseline.sql', import.meta.url), 'utf8');
    await db.exec(baseline.slice(baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."alea_footprint_cells"'), baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."alea_move_multhex"')));
    const objectMigration = readFileSync(new URL('../supabase/migrations/20261117070000_arcane_object_library.sql', import.meta.url), 'utf8');
    await db.exec(objectMigration.slice(objectMigration.indexOf('create function private.is_campaign_map_object_discovered'), objectMigration.indexOf('drop policy if exists campaign_map_objects_select')));
    await db.exec(battleProjection);
    const config = {
      version: 1, darkness: .7, pixelsPerMeter: 40, north: 115,
      secretObjects: ['hidden'],
      characterTokenStyles: { [character]: 'battlepose' },
      lights: [
        { name: 'SL notes', on: true, playerVisible: true, position: [2, 1], beam: 'parallel', beamWidth: 2, edgeSoftness: 45, type: 'solljus', direction: 10 },
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
    await db.query('reset role');
    await db.query("insert into private.combat_map_snapshots values ($1,$2,$3,$4,'crypt',24,16)", [npc, JSON.stringify(config),map,campaign]);
    await db.exec("set role authenticated; set test.role = 'member'");
    expect((await db.query('select position from campaign_map_character_positions')).rows).toEqual([]);
    expect((await db.query('select configuration from campaign_map_academy')).rows).toEqual([]);
    const render = () => db.query('select read_campaign_map_academy_player($1) as data', [map]);
    const { data } = (await render()).rows[0];
    expect(data.lights.map(light => light.position)).toEqual([[2, 1], [3, 4]]);
    expect(data.lights[0]).toMatchObject({ beam: 'parallel', beamWidth: 2, edgeSoftness: 45, direction: 35 });
    expect(data).not.toHaveProperty('north');
    expect(data.lights.every(light => !('name' in light) && !('characterId' in light))).toBe(true);
    expect(data).not.toHaveProperty('secretObjects');
    expect(data).not.toHaveProperty('characterTokenStyles');
    expect(data).not.toHaveProperty('positions');
    expect(data.geometry).toEqual([]);
    const cells = new Set(data.freeSight.runs.flatMap(([start,len]) => Array.from({length:len}, (_, i) => start+i)));
    expect(cells.has(2)).toBe(true);
    for (const hidden of [5,8,9,10,18]) expect(cells.has(hidden)).toBe(false);
    const battle = async () => (await db.query('select read_combat_map_academy_player($1) as data', [npc])).rows[0].data;
    const projected = await battle();
    expect(projected.lights.map(light => light.position)).toEqual([[2,1],[4,1]]);
    expect(projected).toMatchObject({ pixelsPerMeter: 2, environment: 'indoor', freeSight: data.freeSight, geometry: [] });
    expect(JSON.stringify(projected)).not.toContain(character);
    await db.exec("reset role; update combat_instances set status='setup'; set role authenticated");
    expect(await battle()).toBeNull();
    await db.exec("reset role; update combat_instances set status='active'; set role authenticated");
    await expect(db.query('select private.project_map_academy($1,$2)', [map,npc])).rejects.toThrow(/permission denied/);
    // Centre 7 is explored, but the third cell of this footprint lies beyond room 1.
    await db.exec(`reset role; update combatants set q=2, state='{"footprint":{"shape":"line3"}}'; set role authenticated`);
    expect((await battle()).lights.map(light => light.position)).toEqual([[2,1]]);
    await db.exec("reset role; update combatants set q=1,state='{}'; update campaign_maps set image_path='replacement'; set role authenticated");
    expect(await battle()).toBeNull();
    await db.exec("reset role; update campaign_maps set image_path='crypt',player_visible=false; set role authenticated");
    expect(await battle()).toBeNull();
    await db.exec("reset role; update campaign_maps set player_visible=true; set role authenticated");
    await db.exec("reset role; update combatants set visible_to_players=false; set role authenticated");
    expect((await battle()).lights.map(light => light.position)).toEqual([[2,1]]);
    await db.exec("reset role; update combatants set visible_to_players=true, q=6; set role authenticated");
    expect((await battle()).lights.map(light => light.position)).toEqual([[2,1]]);
    await expect(save(1, [])).rejects.toThrow(/ändrats/);
    await db.exec("set test.role = 'outsider'");
    expect((await render()).rows).toEqual([{ data: null }]);
    expect(await battle()).toBeNull();
    expect((await db.query('select configuration from campaign_map_academy')).rows).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(db.query('select configuration from campaign_map_academy')).rejects.toThrow(/permission denied/);
    await expect(render()).rejects.toThrow(/permission denied/);
    await expect(battle()).rejects.toThrow(/permission denied/);
    // Upgrade a map that was calibrated in the academy before the fields were shared.
    await db.exec(`reset role;
      alter table campaign_maps add column pixels_per_meter numeric(12,4), add column scale_point_a jsonb,
        add column scale_point_b jsonb, add column scale_distance_m numeric;
      grant update on campaign_maps to authenticated;`);
    const scaleMigration = readFileSync(new URL('../supabase/migrations/20261119190000_unified_map_calibration.sql', import.meta.url), 'utf8');
    await db.exec(scaleMigration);
    const scale = async () => (await db.query('select pixels_per_meter::float8 as ppm, scale_point_a from campaign_maps')).rows[0];
    expect(await scale()).toEqual({ ppm: 40, scale_point_a: null });
    await db.exec("set role authenticated; set test.role = 'gm'");
    await db.exec(`update campaign_maps set pixels_per_meter=60, scale_point_a='[0,0]',
      scale_point_b='[360,0]', scale_distance_m=6`);
    await expect(save(1, [])).rejects.toThrow(/ändrats/);
    expect((await render()).rows[0].data.pixelsPerMeter).toBe(60);
    expect((await save(2, [], { ...config, pixelsPerMeter: 60 })).rows[0].revision).toBe(3);
    expect(await scale()).toEqual({ ppm: 60, scale_point_a: [0,0] });
    expect((await save(3, [], { ...config, pixelsPerMeter: 48.12349 })).rows[0].revision).toBe(4);
    expect(await scale()).toEqual({ ppm: 48.1235, scale_point_a: null });
    expect((await render()).rows[0].data.pixelsPerMeter).toBe(48.1235);
    await expect(save(4, [{ character_id: npc, position: [2, 5] }])).rejects.toThrow(/row-level security/i);
    expect((await scale()).ppm).toBe(48.1235);
    await expect(save(4, [], { ...config, expectedMapScale: 40 })).rejects.toThrow(/skala har ändrats/);
    await save(4, [], { ...config, expectedMapScale: 48.1235 });
    expect((await db.query('select configuration from campaign_map_academy')).rows[0].configuration)
      .not.toHaveProperty('expectedMapScale');
  } finally {
    await db.close();
  }
}, 15000);
