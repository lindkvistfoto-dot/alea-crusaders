import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {it, expect} from 'vitest';
import {createPolygonHistory, locationsForPolygonMap} from '../features/map/polygon-session.js';

const migration = readFileSync(new URL('../supabase/migrations/20261121162549_arcane_polygon_studio_operations.sql', import.meta.url), 'utf8');
const replayMigration = readFileSync(new URL('../supabase/migrations/20261121164630_arcane_polygon_explicit_replay.sql', import.meta.url), 'utf8');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const campaign = uuid(1), foreign = uuid(2), mapId = uuid(3), oldMap = uuid(4);
const church = uuid(5), floor = uuid(6), village = uuid(7), crypt = uuid(8), tunnel = uuid(9), foreignRoom = uuid(10);
const room = uuid(11), neighbor = uuid(12), newRoom = uuid(13);
const rect = {shape_type:'rect', shape_data:{x:0,y:0,width:8,height:4,legacy:'bevara'}, sort_order:1, location_id:null};
const edited = {...rect,shape_type:'polygon',shape_data:{points:[[0,0],[8,0],[8,2],[8,4],[0,4]],legacy:'bevara'}};
const added = {...edited,sort_order:3,shape_data:{points:[[8,0],[12,2],[8,2]]}};

it('filters by campaign, the map’s own structure and descendants, including cyclic historical hierarchies', () => {
  const sites = [
    {id:church,campaign_id:campaign,parent_site_id:floor}, {id:floor,campaign_id:campaign,parent_site_id:church},
    {id:village,campaign_id:campaign,parent_site_id:null}, {id:foreign,campaign_id:foreign,parent_site_id:church},
  ];
  const locations = [
    {id:'a',site_id:church,campaign_id:campaign},{id:'b',site_id:floor,campaign_id:campaign},
    {id:'c',site_id:village,campaign_id:campaign},{id:'d',site_id:foreign,campaign_id:foreign},
  ];
  expect(locationsForPolygonMap({site_id:church,campaign_id:campaign},sites,locations)).toEqual(locations.slice(0,2));
  expect(locationsForPolygonMap({site_id:null,campaign_id:campaign},sites,locations)).toEqual(locations.slice(0,3));
  expect(locationsForPolygonMap({},sites,locations)).toEqual([]);
});

it('persists complete reversible operations under GM privileges, rejecting concurrent edits and invalid links atomically', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema private; create schema auth;
      grant usage on schema private, auth to authenticated;
      create function auth.uid() returns uuid language sql as $$ select '${uuid(77)}'::uuid $$;
      create function private.is_admin() returns boolean language sql as 'select false';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select current_setting(''test.role'',true) = ''gm''';
      create table campaign_maps(id uuid primary key, campaign_id uuid, site_id uuid, unique(id,campaign_id));
      create table campaign_sites(id uuid primary key, campaign_id uuid, parent_site_id uuid);
      create table campaign_locations(id uuid primary key, campaign_id uuid, site_id uuid, unique(id,campaign_id));
      create table campaign_map_areas(
        id uuid primary key, map_id uuid not null, campaign_id uuid not null,
        location_id uuid, shape_type text not null, shape_data jsonb not null, sort_order int not null,
        updated_at timestamptz not null default now(),
        foreign key (map_id,campaign_id) references campaign_maps(id,campaign_id),
        foreign key (location_id,campaign_id) references campaign_locations(id,campaign_id)
      );
      create function private.touch_area() returns trigger language plpgsql as
        'begin new.updated_at = now(); return new; end';
      create trigger touch_area before update on campaign_map_areas for each row execute function private.touch_area();
      insert into campaign_maps values ('${mapId}','${campaign}','${church}'),('${oldMap}','${campaign}',null);
      insert into campaign_sites values ('${church}','${campaign}',null),('${floor}','${campaign}','${church}'),('${village}','${campaign}',null);
      insert into campaign_locations values ('${crypt}','${campaign}','${floor}'),('${tunnel}','${campaign}','${village}'),('${foreignRoom}','${foreign}','${foreign}');
      insert into campaign_map_areas values ('${room}','${mapId}','${campaign}',null,'rect','${JSON.stringify(rect.shape_data)}',1),
        ('${neighbor}','${mapId}','${campaign}','${tunnel}','rect','{"x":21,"y":0,"width":2,"height":2}',2);
      grant select,update on campaign_maps to authenticated;
      grant select on campaign_sites,campaign_locations to authenticated;
      grant select,insert,update,delete on campaign_map_areas to authenticated;
      alter table campaign_map_areas enable row level security;
      create policy manage on campaign_map_areas to authenticated using (private.is_campaign_gm(campaign_id))
        with check (private.is_campaign_gm(campaign_id));
    `);
    const rows = async () => (await db.query(`select id,shape_type,shape_data,sort_order,location_id,
      to_jsonb(updated_at) as updated_at from campaign_map_areas where map_id=$1 order by sort_order,id`, [mapId])).rows;
    const initial = await rows();
    await db.exec(migration);
    const installed = () => db.query("select 'apply_map_polygon_operation(uuid,jsonb,jsonb)'::regprocedure::oid as id");
    const original = await installed();
    await db.exec(replayMigration);
    expect((await installed()).rows).toEqual(original.rows);
    expect(await rows()).toEqual(initial); // The historical link outside the structure stays untouched.
    await db.exec("set role authenticated; set test.role = 'gm'");
    let dropAcknowledgement = false;
    const writes = [];
    const dbJson = async (path, {body}) => {
      expect(path).toBe('rpc/apply_map_polygon_operation');
      const params = JSON.parse(body);
      writes.push(params);
      const result = await db.query('select apply_map_polygon_operation($1,$2,$3) as versions',
        [params.p_map_id,JSON.stringify(params.p_changes),JSON.stringify(params.p_versions)]);
      if (dropAcknowledgement) {dropAcknowledgement = false; throw new TypeError('Failed to fetch');}
      return result.rows[0].versions;
    };
    const session = createPolygonHistory({mapId,dbJson,areas:initial});
    const stale = createPolygonHistory({mapId,dbJson,areas:initial});
    const creation = [{id:room,before:initial[0],after:edited}, {id:newRoom,before:null,after:added}];
    dropAcknowledgement = true;
    await expect(session.commit(creation)).resolves.toBe(true);
    expect(writes[1]).toEqual({...writes[0], p_changes:[{...writes[0].p_changes[0], replay:true}, writes[0].p_changes[1]]});
    expect(session.canUndo).toBe(true);
    expect(session.lastChanges[1].after).toMatchObject({id:newRoom, ...added});
    expect(session.lastChanges[1].after.updated_at).toBeTruthy();
    expect((await rows()).length).toBe(3);
    await expect(session.undo()).resolves.toBe(true);
    expect((await rows())[0]).toMatchObject(rect);
    expect((await rows()).length).toBe(2);
    expect(session.lastChanges[1].after).toBeNull();
    await expect(session.redo()).resolves.toBe(true);
    expect((await rows())[0]).toMatchObject(edited);
    expect((await rows())[2]).toMatchObject(added);

    // A different GM changed these rooms; even a change only to an untouched
    // neighbor, or a new polygon ID, must not use the stale layout.
    await expect(stale.commit([{id:uuid(88),before:null,after:added}])).rejects.toMatchObject({code:'POLYGON_CONFLICT'});
    const beforeRejected = await rows();
    await expect(session.commit([
      {id:room,before:edited,after:{...edited, location_id:crypt}},
      {id:newRoom,before:added,after:{...added, location_id:tunnel}},
    ])).rejects.toThrow(/kartans struktur/);
    expect(await rows()).toEqual(beforeRejected);
    // Descendant links are valid, sibling and foreign campaign links are not.
    const linked = {...added, location_id:crypt};
    await session.commit([{id:newRoom,before:added,after:linked}]);
    await expect(session.commit([{id:newRoom,before:linked,after:{...linked,location_id:foreignRoom}}])).rejects.toThrow(/struktur/);
    await session.undo();
    expect((await rows())[2].location_id).toBeNull();
    await session.redo();
    const competing = createPolygonHistory({mapId,dbJson,areas:await rows()});
    const remove = [{id:newRoom,before:linked,after:null}];
    await session.commit(remove);
    await expect(competing.commit(remove)).rejects.toMatchObject({code:'POLYGON_CONFLICT'});
    expect(competing.canUndo).toBe(false);
    await session.undo();
    expect((await rows())[2]).toMatchObject({id:newRoom,...linked});
    await session.undo();
    await session.commit([{id:newRoom,before:added,after:null}]);
    expect(session.canRedo).toBe(false);

    const deletion = writes.at(-1);
    // Replay after another writer touched a different area must require reload,
    // even though the newly deleted row is still absent.
    await db.exec(`update campaign_map_areas set sort_order=9 where id='${neighbor}'`);
    await expect(dbJson('rpc/apply_map_polygon_operation', {body:JSON.stringify({...deletion,p_changes:[{...deletion.p_changes[0],replay:true}]})})).rejects.toThrow(/öppna kartan igen/i);
    await expect(db.exec(`update campaign_map_areas set location_id='${tunnel}' where id='${room}'`)).rejects.toThrow(/kartans struktur/);

    const unscoped = createPolygonHistory({mapId:oldMap,dbJson,areas:[]});
    await unscoped.commit([{id:uuid(71),before:null,after:{...added,location_id:tunnel}}]);
    await expect(unscoped.commit([{id:uuid(72),before:null,after:{...added,location_id:foreignRoom}}])).rejects.toThrow(/foreign key/);
    await db.exec("set test.role = 'player'");
    await expect(unscoped.undo()).rejects.toThrow(/spelledare|administratör/);
    await db.exec('reset role; set role anon');
    await expect(db.query("select apply_map_polygon_operation($1,'[]','{}')",[mapId])).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
}, 30000);

it('prevents overlapping gestures during a write and blocks edits when both acknowledgements are lost', async () => {
  let rejectFirst, attempts = 0;
  const dbJson = () => {
    attempts++;
    if (attempts === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    throw new TypeError('Failed to fetch');
  };
  const session = createPolygonHistory({mapId, dbJson, areas:[]});
  const create = [{id:newRoom,before:null,after:added}];
  const writing = session.commit(create);
  expect(session.busy).toBe(true);
  await expect(session.commit(create)).resolves.toBe(false);
  expect(attempts).toBe(1);
  rejectFirst(new TypeError('Failed to fetch'));
  await expect(writing).rejects.toMatchObject({code:'POLYGON_UNCERTAIN'});
  expect(session.busy).toBe(false);
  expect(session.canUndo).toBe(false);
  await expect(session.commit(create)).rejects.toMatchObject({code:'POLYGON_CONFLICT'});
  expect(attempts).toBe(2);
});

it('reads complete editor versions and batches linked locations on maps with more than one API page', async () => {
  const {runInNewContext} = await import('node:vm');
  const legacy = readFileSync(new URL('../legacy/app.js', import.meta.url), 'utf8');
  const loader = legacy.slice(legacy.indexOf('function isUuid('), legacy.indexOf('async function viewCampaignMap('));
  const rows = Array.from({length:1003}, (_, index) => ({id:uuid(index),location_id:uuid(index+2000),updated_at:'2026-11-21'}));
  const requests = [];
  const dbJson = async path => {
    const url = new URL('https://example.test/' + path);
    requests.push(url);
    if (url.pathname === '/campaign_map_areas') {
      const start = Number(url.searchParams.get('offset'));
      return rows.slice(start, start + Number(url.searchParams.get('limit') || 1000));
    }
    const column = url.pathname === '/campaign_location_state' ? 'location_id' : 'id';
    const ids = url.searchParams.get(column).slice(4,-1).split(',');
    expect(ids.length).toBeLessThanOrEqual(100);
    return ids.map(id => column === 'id' ? {id,name:'Rum'} : {location_id:id,status:'explored'});
  };
  const load = runInNewContext(loader+'\nloadCampaignMapAreas', {dbJson});
  const observed = await load(mapId,true);
  expect(observed.length).toBe(rows.length);
  expect(observed.at(-1)).toMatchObject({name:'Rum',status:'explored',...rows.at(-1)});
  const pages = requests.filter(url => url.pathname === '/campaign_map_areas');
  expect(pages.map(url => Number(url.searchParams.get('offset')))).toEqual([0,250,500,750,1000]);
  expect(pages.every(url => url.searchParams.get('order') === 'sort_order.asc,id.asc')).toBe(true);
});
