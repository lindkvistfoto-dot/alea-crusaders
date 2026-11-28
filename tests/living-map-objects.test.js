import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import {roomInstances,containsObjectPoint} from '../features/map/room-objects.js';
import {objectCategories} from '../features/map/object-categories.js';

const migration=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const folder=new URL('../supabase/migrations/',import.meta.url);
const collections=migration(readdirSync(folder).find(name=>name.endsWith('_object_library_collections.sql')));
const old=migration('20261117070000_arcane_object_library.sql');
const current=migration('20261123224005_arcane_living_objects.sql');
const discovery=migration('20261122224535_adventure_player_projection.sql').split('-- All API clients')[0];

it.each([false,true])('persists independently and protects the player projection (legacy library %s)',async legacy=>{
  const db=new PGlite(),campaign=crypto.randomUUID(),map=crypto.randomUUID(),room=crypto.randomUUID();
  const query=async(sql,params=[]) => (await db.query(sql,params)).rows;
  const command=async(live,action,id,values={})=>(await query('select edit_living_map_object($1,$2,$3,$4,$5) id',[map,live,action,id,JSON.stringify(values)]))[0].id;
  const rows=live=>query('select * from read_living_map_objects($1,$2)',[map,live]);
  const player=async()=>(await query('select read_adventure_player_objects($1) list',[map]))[0].list;
  try{
    await db.exec(`
      create role authenticated; create role anon; create schema private; grant usage on schema private to authenticated;
      create function private.is_admin() returns boolean language sql as 'select current_setting(''test.role'',true)=''admin''';
      create function private.is_campaign_gm(uuid) returns boolean language sql as 'select current_setting(''test.role'',true)=''gm'' and $1=current_setting(''test.campaign'',true)::uuid';
      create function private.is_campaign_member(uuid) returns boolean language sql as 'select current_setting(''test.role'')=''player''';
      create function private.bump_campaign_map_signal() returns trigger language plpgsql as 'begin return coalesce(new,old); end';
      create function public.alea_set_updated_at() returns trigger language plpgsql as 'begin new.updated_at=now(); return new; end';
      create table campaigns(id uuid primary key);create table profiles(id uuid primary key);
      create table campaign_maps(id uuid primary key,campaign_id uuid,width int,height int,player_visible boolean);
      create table campaign_map_areas(map_id uuid,campaign_id uuid,location_id uuid,shape_type text,shape_data jsonb);
      create table campaign_location_state(location_id uuid,campaign_id uuid,status text);
      create table arcane_battlefield_library(object_key text primary key,name text,category text,asset_key text,description text,max_damage int,active boolean);
      insert into arcane_battlefield_library values('wall','Mur','Murar','arcane-battlefield-wall','',10,true);
      insert into campaigns values('${campaign}');
      insert into campaign_maps values('${map}','${campaign}',300,200,true);
      insert into campaign_map_areas values('${map}','${campaign}','${room}','rect','{"x":0,"y":0,"width":100,"height":100}');
      insert into campaign_location_state values('${room}','${campaign}','explored');
      grant select on all tables in schema public to authenticated;
    `);
    if(legacy)await db.exec(old);
    await db.exec(discovery);await db.exec(current);
    const before=await query('select id,image_asset_key from arcane_object_definitions order by id');
    await db.exec(collections);
    await db.exec(migration('20261124223537_object_factory_categories.sql'));
    expect(await query('select id,image_asset_key from arcane_object_definitions order by id')).toEqual(before);
    const levels=await query('select unnest(enum_range(null::map_object_category)) label');
    expect(levels.map(r=>r.label)).toEqual(objectCategories);
    await query("select set_config('test.campaign',$1,false)",[campaign]);
    await db.exec("set role authenticated;set test.role='gm'");
    const defs=await query('select * from arcane_object_definitions');
    const table=defs.find(d=>d.object_key==='wooden-table'),wall=defs.find(d=>d.battle_object_key==='wall');
    expect(Object.fromEntries(defs.map(d=>[d.object_key,d.library_category]))).toEqual({
      'wooden-table':'Möbler','wooden-chair':'Möbler','wooden-chest-closed':'Förvaring och gods',
      'woven-rug':'Inredning och bruksföremål','timber-barricade':'Hinder och försvar','battle:wall':'Byggnadsdelar',
    });
    expect(defs.every(d=>d.campaign_id===null)).toBe(true);
    const foreignCampaign=crypto.randomUUID();
    await db.exec('reset role');
    await query('insert into campaigns values($1)',[foreignCampaign]);
    await db.exec("insert into arcane_battlefield_library values('bell','Klocka','unclassified','arcane-bell','',null,true)");
    const [bell]=await query("select * from arcane_object_definitions where battle_object_key='bell'");
    expect(bell.library_category).toBe('Övrigt');
    await db.exec("set role authenticated;set test.role='admin'");
    await query("update arcane_object_definitions set library_category='Monument och ritualföremål' where id=$1",[bell.id]);
    const copy=async c=>(await query(`insert into arcane_object_definitions
      (object_key,campaign_id,name,object_type,image_asset_key,width_m,depth_m,height_m,library_category)
      select $1,$2,'Kampanjbord',object_type,image_asset_key,width_m,depth_m,height_m,library_category
      from arcane_object_definitions where id=$3 returning id`,[crypto.randomUUID(),c,table.id]))[0].id;
    const local=await copy(campaign),foreign=await copy(foreignCampaign);
    await expect(query('update arcane_object_definitions set campaign_id=$1 where id=$2',[foreignCampaign,local])).rejects.toThrow(/Samlingen/);
    await db.exec("reset role;update arcane_battlefield_library set name='Bronsklocka' where object_key='bell'");
    expect((await query('select name,library_category from arcane_object_definitions where id=$1',[bell.id]))[0])
      .toEqual({name:'Bronsklocka',library_category:'Monument och ritualföremål'});
    await db.exec("set role authenticated;set test.role='gm'");
    expect((await query('select id from arcane_object_definitions where campaign_id is not null')).map(r=>r.id)).toEqual([local]);
    await expect(copy(campaign)).rejects.toThrow();
    await expect(command(false,'place',crypto.randomUUID(),{definition:foreign,x:5,y:5})).rejects.toThrow();
    const localPlacement=await command(false,'place',crypto.randomUUID(),{definition:local,x:5,y:5});
    await command(false,'remove',localPlacement);
    expect(wall.width_m).toBeNull();
    await expect(command(false,'place',crypto.randomUUID(),{definition:wall.id,x:1,y:1})).rejects.toThrow(/mått/);
    const id=crypto.randomUUID(),outside=crypto.randomUUID();
    await command(false,'place',id,{definition:table.id,x:31.25,y:18.75});
    await command(false,'edit',id,{max_bep:20,current_bep:7});
    await command(false,'place',outside,{definition:table.id,x:150,y:150});
    expect((await rows(true)).map(r=>r.id)).toEqual([id,outside]);
    // An invalid first live edit rolls its snapshot back.
    await expect(command(true,'edit',id,{x:-1})).rejects.toThrow(/position/);
    const liveId=await command(true,'edit',id,{rotation:-20,scale_factor:1.5});
    const duplicate=crypto.randomUUID();
    await command(true,'duplicate',liveId,{new_id:duplicate});
    await command(true,'edit',duplicate,{current_bep:0,player_visible:false});
    await command(true,'edit',liveId,{locked:true});
    await expect(command(true,'edit',liveId,{rotation:25})).rejects.toThrow(/låst/);
    await command(true,'edit',liveId,{locked:false});
    expect((await rows(true))[0]).toMatchObject({id:liveId,rotation:'340.00',current_bep:7});
    expect((await rows(false))[0]).toMatchObject({id,rotation:'0.00'});
    for (const [action,index] of [['back',0],['forward',1],['front',2],['backward',1]]) {
      await command(true,action,duplicate);
      expect((await rows(true))[index].id).toBe(duplicate);
    }
    // The live room switches change one instance and leave its siblings and preparation intact.
    const [prepared]=await rows(false);
    await command(true,'edit',liveId,{movement_blocking:true,player_visible:false});
    expect(await player()).toEqual([]);
    await command(true,'edit',liveId,{player_visible:true});
    expect((await rows(true)).find(o=>o.id===liveId).movement_blocking).toBe(true);
    expect((await rows(true)).find(o=>o.id===duplicate).player_visible).toBe(false);
    await command(true,'edit',liveId,{movement_blocking:false});
    expect((await rows(true)).find(o=>o.id===liveId).player_visible).toBe(true);
    expect((await rows(false))[0]).toEqual(prepared);
    const expected=await player();
    expect(expected.map(o=>o.id)).toEqual([liveId]);
    expect(expected[0]).not.toHaveProperty('current_bep');
    expect(expected[0].definition).not.toHaveProperty('max_bep');
    await db.exec("set test.role='player'");
    expect(await player()).toEqual(expected);
    expect(await query('select * from campaign_map_objects')).toEqual([]);
    expect(await query('select * from arcane_object_definitions')).toEqual([]);
    expect(await rows(false)).toEqual([]);
    await expect(command(true,'edit',liveId,{x:1})).rejects.toThrow();
    await db.exec("set test.role='outsider'");
    expect(await player()).toEqual([]);
    await db.exec("set test.role='gm'");
    for(const row of await rows(true))await command(true,'remove',row.id);
    expect(await rows(true)).toEqual([]);
    expect(await rows(false)).toHaveLength(2);
    expect(await query('select id from arcane_object_definitions where id=$1',[table.id])).toHaveLength(1);
  } finally{await db.close();}
},20000);

it('lists every instance centered inside the selected room, including hidden objects and boundaries',()=>{
 const instances=[{id:'A',x:'5',y:'5',player_visible:false},{id:'B',x:10,y:7},{id:'C',x:14,y:8}];
 const rect={id:'room',shape_type:'rect',shape_data:{x:2,y:3,width:8,height:5}};
 const polygon={id:'room',shape_type:'polygon',shape_data:{points:[[2,3],[10,3],[10,8],[2,8],[2,3]]}};
 for(const area of [rect,polygon])expect(roomInstances(area,instances).map(r=>r.id)).toEqual(['A','B']);
});

it('includes multiple polygons of the same room once and excludes adjoining locations',()=>{
 const room={id:'west',location_id:'crypt',shape_type:'rect',shape_data:{x:0,y:0,width:10,height:10}};
 const east={...room,id:'east',shape_data:{x:10,y:0,width:10,height:10}};
 const next={...room,id:'next',location_id:'chapel',shape_data:{x:20,y:0,width:10,height:10}};
 const rows=[5,10,15,25].map(x=>({x,y:5}));
 expect(roomInstances(room,rows,[room,east,next])).toEqual(rows.slice(0,3));
});
it('uses the rotated and scaled object footprint for solid hex placement',()=>{
 const row={x:'50',y:'90',rotation:90},size={width:40,depth:10};
 expect(containsObjectPoint(row,size,[54,108])).toBe(true);
 expect(containsObjectPoint(row,size,[65,93])).toBe(false);
 expect(containsObjectPoint({...row,rotation:0},size,[65,93])).toBe(true);
 expect(containsObjectPoint(row,{width:80,depth:20},[59,118])).toBe(true);
 expect(containsObjectPoint(row,null,[50,90])).toBe(false);
});
