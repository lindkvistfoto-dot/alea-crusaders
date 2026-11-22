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
    await db.exec("set role anon");
    await expect(all()).rejects.toThrow(/permission denied/);
  }finally{await db.close();}
},20000);
