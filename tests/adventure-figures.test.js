import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { adventureCell, adventureGrid, hexCenter } from '../features/map/adventure-hex.js';

it('snaps both sides of sloped edges and rejects solid, occupied and clipped cells', () => {
  const map={width:600,height:300}, grid=adventureGrid(map,{pixelsPerMeter:12});
  const lookup=(point,rows=[],id)=>adventureCell(map,grid,point,rows,id);
  const a=hexCenter(grid,3,4), b=hexCenter(grid,3,5);
  const between=t=>a.map((x,i)=>x+(b[i]-x)*t);
  expect(lookup(between(.49))).toMatchObject({q:3,r:4});
  expect(lookup(between(.51))).toMatchObject({q:3,r:5});
  expect(lookup(hexCenter(grid,-2,8))).toMatchObject({q:-2,r:8});
  expect(lookup([1,1])).toBeNull();
  const rows=[{id:'astrid',q:3,r:4}];
  expect(lookup(a,rows)).toBeNull();
  expect(lookup(a,rows,'astrid')).toMatchObject({q:3,r:4});
  grid.movement=[{closed:true,movement:true,points:[[0,0],[200,0],[200,100],[0,100]]}];
  expect(lookup(a)).toBeNull();
  const mask=adventureGrid(map,{pixelsPerMeter:12,freeSight:{width:2,height:1,runs:[[1,1]]}});
  expect(adventureCell(map,mask,a,[])).toBeNull();
});

it('isolates session and campaign state with real SQL constraints and authenticated RLS',async()=>{
  const db=new PGlite();
  const [campaign,other,map,secretMap,session,otherSession,hero,monster,npc]=Array.from({length:9},()=>crypto.randomUUID());
  const dir=new URL('../supabase/migrations/',import.meta.url);
  const migration=readFileSync(new URL(readdirSync(dir).find(f=>f.endsWith('_adventure_map_figures.sql')),dir),'utf8');
  const all=()=>db.query('select name,q,r,player_visible from adventure_map_figures order by name');
  try{
    await db.exec(`
      create role anon; create role authenticated; create schema private;
      grant usage on schema private to authenticated;
      create function private.is_admin() returns boolean language sql as 'select false';
      create function private.is_campaign_gm(uuid) returns boolean language sql as
        'select $1=current_setting(''test.campaign'')::uuid and current_setting(''test.role'')=''gm''';
      create function private.is_campaign_member(uuid) returns boolean language sql as
        'select $1=current_setting(''test.campaign'')::uuid';
      create function private.bump_campaign_map_signal() returns trigger language plpgsql as
        'begin return coalesce(new,old); end';
      create table campaign_maps(id uuid,campaign_id uuid,width int,height int,player_visible boolean,unique(id,campaign_id));
      create table campaign_map_academy(map_id uuid, configuration jsonb);
      create table game_sessions(id uuid,campaign_id uuid,status text,unique(id,campaign_id));
      create table characters(id uuid,campaign_id uuid,is_npc boolean,unique(id,campaign_id));
      create table campaign_npcs(id uuid,campaign_id uuid,unique(id,campaign_id));
      create table campaign_monsters(id uuid,campaign_id uuid,unique(id,campaign_id));
      insert into campaign_maps values ('${map}','${campaign}',600,300,true),('${secretMap}','${campaign}',600,300,false);
      insert into game_sessions values ('${session}','${campaign}','active'),('${otherSession}','${other}','active');
      insert into characters values ('${hero}','${campaign}',false),('${npc}','${campaign}',true);
      insert into campaign_monsters values ('${monster}','${campaign}');
      grant select on all tables in schema public to authenticated;
    `);
    await db.exec(migration);
    await db.exec(`set role authenticated;set test.role='gm';set test.campaign='${campaign}'`);
    const place=(field,id,name,q,visible=true,board=map,meeting=session)=>db.query(
      'insert into adventure_map_figures (campaign_id,session_id,map_id,'+field+',name,q,r,player_visible) values ($1,$2,$3,$4,$5,$6,4,$7) returning id',
      [campaign,meeting,board,id,name,q,visible]);
    const initial=(await place('character_id',hero,'Astrid',3)).rows[0].id;
    const moved=await db.query(`insert into adventure_map_figures(campaign_id,session_id,map_id,character_id,name,q,r)
      values ($1,$2,$3,$4,'Astrid',5,4) on conflict(session_id,character_id) do update set q=excluded.q,r=excluded.r returning id`,
      [campaign,session,map,hero]);
    expect(moved.rows[0].id).toBe(initial);
    await place('monster_id',monster,'Vakt A',2,false);
    await place('monster_id',monster,'Vakt B',3,false);
    await place('npc_character_id',npc,'Spejare',4);
    await place('npc_character_id',npc,'Spejare på hemlig karta',4,true,secretMap);
    await expect(place('monster_id',monster,'Kollision',5)).rejects.toThrow(/unique/i);
    await expect(place('monster_id',monster,'Utanför',4000)).rejects.toThrow(/utanför/);
    await expect(place('character_id',npc,'Fel typ',7)).rejects.toThrow(/register/);
    await expect(place('monster_id',monster,'Fel möte',8,true,map,otherSession)).rejects.toThrow();
    expect((await all()).rows).toHaveLength(5);
    await db.exec("set test.role='player'");
    expect((await all()).rows.map(f=>f.name)).toEqual(['Astrid','Spejare']);
    expect((await db.query('delete from adventure_map_figures returning id')).rows).toEqual([]);
    await expect(place('monster_id',monster,'Förbjuden',9)).rejects.toThrow(/row-level security/);
    await db.exec(`set test.campaign='${other}'`);
    expect((await all()).rows).toEqual([]);
    await db.exec(`set test.campaign='${campaign}';set test.role='gm';delete from adventure_map_figures where name='Vakt A'`);
    expect((await db.query('select count(*)::int n from campaign_monsters')).rows[0].n).toBe(1);
    // Install the adventure projection over existing V1.0 placements.
    const projection=readFileSync(new URL(readdirSync(dir).find(f=>f.endsWith('_adventure_player_projection.sql')),dir),'utf8');
    const room=crypto.randomUUID(),closed=crypto.randomUUID();
    await db.exec(`reset role;
      create role service_role;create schema storage;
      create table storage.objects(bucket_id text,name text);
      alter table storage.objects enable row level security;
      create policy legacy_map_read on storage.objects for select to authenticated using(true);
      grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
      insert into storage.objects values ('campaign-maps','original'),('other','allowed');
      alter table campaign_maps add column image_path text;update campaign_maps set image_path='original';
      alter table campaign_map_academy add column campaign_id uuid;
      create table campaign_map_areas(id uuid,campaign_id uuid,map_id uuid,location_id uuid,shape_type text,shape_data jsonb,sort_order int);
      create table campaign_location_state(campaign_id uuid,location_id uuid,status text);
      create table campaign_locations(id uuid,campaign_id uuid,location_key text,name text);
      create table campaign_location_assets(location_id uuid,campaign_id uuid);
      create table campaign_location_player_texts(location_id uuid,campaign_id uuid);
      create table campaign_image_links(object_id uuid,object_type text,campaign_id uuid);
      grant select on all tables in schema public to authenticated;
      alter table campaign_map_areas enable row level security;
      create policy legacy_area_read on campaign_map_areas for select to authenticated using(true);
      insert into campaign_locations values ('${room}','${campaign}','1','Rum'),('${closed}','${campaign}','2','Dolt');
      insert into campaign_location_state values ('${campaign}','${room}','explored'),('${campaign}','${closed}','unexplored');
      insert into campaign_map_areas values
       (gen_random_uuid(),'${campaign}','${map}','${room}','rect','{"x":0,"y":0,"width":160,"height":100}',0),
       (gen_random_uuid(),'${campaign}','${map}','${closed}','rect','{"x":60,"y":0,"width":14,"height":100}',1);
    `);
    await db.exec(projection);
    const projected=()=>db.query('select name from read_adventure_player_figures($1,$2)',[map,session]);
    await db.exec("set role authenticated;set test.role='gm'");
    expect((await projected()).rows).toEqual([{name:'Astrid'}]);
    await db.exec("set test.role='player'");
    expect((await projected()).rows).toEqual([{name:'Astrid'}]);
    expect((await all()).rows.map(row=>row.name)).toEqual(['Astrid']);
    expect((await db.query('select name from read_adventure_player_areas($1)',[map])).rows).toEqual([{name:'1. Rum'}]);
    expect((await db.query('select location_id from campaign_map_areas')).rows).toEqual([{location_id:room}]);
    expect((await db.query('select name from storage.objects')).rows).toEqual([{name:'allowed'}]);
    await expect(db.query('select adventure_raster_plan($1)',[map])).rejects.toThrow(/permission denied/);
    await db.exec("set role anon");
    await expect(all()).rejects.toThrow(/permission denied/);
  }finally{await db.close();}
},20000);
