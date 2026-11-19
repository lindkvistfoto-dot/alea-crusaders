import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {describe,test,expect} from 'vitest';
import {prepareMapSight,projectMapHexes} from '../features/combat/map-hex-projection.js';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const footprint=read('features/combat/footprint.js'),runtime=read('features/combat/runtime.js');
const section=(start,end)=>runtime.slice(runtime.indexOf('function '+start+'('),runtime.indexOf('function '+end+'('));
const settings={academy_map:true,hex_m:1.5,pixels_per_meter:40,background_width:240,background_height:180,offset_x:30,offset_y:30};
const map={width:240,height:180};
const hero={id:'astrid',q:0,r:0,movement_remaining:1};
const scene={
  geometry:[{points:[[60,0],[60,180]],closed:false,movement:true,sight:true}],
  freeSight:{width:24,height:18,runs:[[0,432]]},
};
function battle(config=scene,objects=[]){
 const ctx={
  activeCombat:{phase:'movement',settings},combatants:[],combatCanManage:()=>true,
  combatActiveEffects:[],combatEffectRegistry:[],combatCannotMove:()=>false,
  combatMovementAllowance:a=>a.movement_remaining,combatMentalMovementAllowed:()=>true,
 };
 runInNewContext(footprint+'\n'+section('combatHexNeighbors','combatSelectedCombatant')+
  section('combatAxialDistance','combatAttackProfile')+section('combatMovementOccupied','combatSetMovementPreview')+
  section('combatReachableHexes','combatEnteredHexKeys')+
  '\nthis.directions=COMBAT_MAP_DIRECTIONS;',ctx);
 const grid=ctx.combatMapHexGeometry(map,settings),cells=[...ctx.combatMapGridCells(grid)];
 ctx.combatRuntimeMapMeta={...map,academySight:prepareMapSight(map,config)};
 ctx.combatRuntimeGeometry=()=>grid;
 const rows=projectMapHexes({config,objects},grid,cells,ctx.directions);
 const indexed=new Map(rows.map(h=>[h.q+','+h.r,h]));
 ctx.combatRuntimeHexCells=()=>cells.map(c=>({...c,movement_mode:'free',sight_mode:'clear',...indexed.get(c.key)}));
 return {ctx,grid,rows};
}

describe('Kartakademin → HEXAGONIA',()=>{
 test('six metres contain four equal centre spacings on all six axes, invertible in intrinsic pixels',()=>{
  const {ctx,grid}=battle();
  expect(grid.xPitch).toBe(60);
  for(const [dq,dr] of ctx.directions){
   const a=ctx.combatMapHexCenter(grid,-3,5),b=ctx.combatMapHexCenter(grid,-3+dq,5+dr);
   expect(Math.hypot(a[0]-b[0],a[1]-b[1])/grid.pixelsPerMeter).toBeCloseTo(1.5,12);
   expect(ctx.combatMapPixelToHex(grid,b)).toEqual({q:-3+dq,r:5+dr});
  }
  expect(ctx.combatMapHexGeometry(map,{rows:10}).rowPitch).toBe(18);
  expect(ctx.combatMapHexGeometry(map,{academy_map:true})).toBeNull();
 });
 test('scene drag uses the SVG inverse at zoom and pan, rejecting image letterboxing',()=>{
  const {ctx,grid}=battle(),admin=read('features/combat/admin-scenes.js');
  const screen={scale:2.5,x:85,y:120};
  const svg={getScreenCTM:()=>({inverse:()=>screen}),createSVGPoint:()=>({
   matrixTransform(m){return {x:(this.x-m.x)/m.scale,y:(this.y-m.y)/m.scale}}
  })};
  ctx.$=()=>({querySelector:()=>svg});
  ctx.eventCombatHexGeometry=()=>grid;
  runInNewContext(section('combatSvgPoint','combatNearestRuntimeCell')+
    admin.slice(admin.indexOf('function eventCombatHexKeyFromClient('),admin.indexOf('function sceneCombatantMapDragOver(')),ctx);
  const [x,y]=ctx.combatMapHexCenter(grid,1,1);
  expect(ctx.eventCombatHexKeyFromClient(screen.x+x*screen.scale,screen.y+y*screen.scale)).toBe('1,1');
  expect(ctx.eventCombatHexKeyFromClient(screen.x-10,screen.y+10)).toBe('');
 });
 test('thin walls block attacks and crossing in both directions, including flight and multihex placement',()=>{
  const {ctx,rows}=battle(),target={id:'enemy',q:1,r:0};
  expect(rows.find(h=>h.q===0&&h.r===0).movement_mode).toBe('free');
  expect(ctx.combatHasLineOfSight(hero,target)).toBe(false);
  expect(ctx.combatHasLineOfSight(target,hero)).toBe(false);
  expect(ctx.combatReachableHexes(hero).has('1,0')).toBe(false);
  expect(ctx.combatReachableHexes({...hero,flying:true}).has('1,0')).toBe(false);
  expect(ctx.combatFootprintCanStand({...hero,name_snapshot:'Häst'},0,0)).toBe(false);
  expect(ctx.combatHasLineOfSight(hero,{q:-1,r:2})).toBe(true);
 });
 test('a wall aligned with a centre-to-centre step still blocks passage and sight',()=>{
  const {ctx}=battle({...scene,geometry:[{points:[[61,30],[72,30]],movement:true,sight:true,closed:false}]});
  expect(ctx.combatReachableHexes(hero).has('1,0')).toBe(false);
  expect(ctx.combatHasLineOfSight(hero,{q:1,r:0})).toBe(false);
 });
 test('object collision and sight are independent; painted Solid only restricts sight',()=>{
  const object={movement_blocking:true,footprint:[{x:65,y:20},{x:75,y:20},{x:75,y:40},{x:65,y:40}]};
  const {ctx}=battle(null,[object]),target={q:1,r:0};
  expect(ctx.combatHasLineOfSight(hero,target)).toBe(true);
  expect(ctx.combatReachableHexes(hero).has('1,0')).toBe(false);
  for(const config of [{geometry:[],freeSight:null},{geometry:[],freeSight:{width:4,height:3,runs:[[0,1],[2,10]]}}]){
   const {ctx}=battle(config);
   expect(ctx.combatHasLineOfSight(hero,target)).toBe(false);
   expect(ctx.combatReachableHexes(hero).has('1,0')).toBe(true);
  }
 });
});

test('PostgreSQL movement RPC commits a legal route, rolls back wall crossings and hides projected terrain under member RLS',async()=>{
 const baseline=read('supabase/migrations/20261030091654_development_schema_baseline.sql');
 const tables=['combat_hexes','combat_instances','combatants','combatant_effects','rule_effects','combat_area_effects'];
 const funcs=['alea_footprint_cells','alea_footprint_shape','alea_move_multhex','haj_move_combatant','alea_rotate_multhex'];
 const battleId='11111111-0000-4000-8000-000000000001',campaign='11111111-0000-4000-8000-000000000002',actor='11111111-0000-4000-8000-000000000003';
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema private;
   create function private.is_admin() returns boolean language sql as $$ select false $$;
   create function private.is_campaign_gm(uuid) returns boolean language sql as $$ select current_setting('test.role',true)='gm' $$;
   grant usage on schema private to authenticated;`);
  for(const name of tables){
   const start=baseline.indexOf('CREATE TABLE IF NOT EXISTS "public"."'+name+'"');
   await db.exec(baseline.slice(start,baseline.indexOf('\n);',start)+3));
  }
  for(const name of funcs){
   const start=baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."'+name+'"');
   await db.exec(baseline.slice(start,baseline.indexOf('ALTER FUNCTION',start)));
  }
  await db.exec(`alter table combat_hexes enable row level security;
   grant select on combat_hexes to authenticated;
   create policy fixture_campaign_member on combat_hexes for select to authenticated using (true);`);
  const projection=read('supabase/migrations/20261119200000_arcane_combat_map_projection.sql');
  await db.exec(projection.slice(0,projection.indexOf('create function private.battle_actor_explored')));
  await db.exec(read('supabase/migrations/20261119231500_combat_academy_barriers.sql'));
  await db.query("insert into combat_instances(id,campaign_id,settings,active_actor_id,status,phase) values ($1,$2,$3,$4,'active','movement')",
    [battleId,campaign,JSON.stringify(settings),actor]);
  for(const row of battle().rows)await db.query('insert into combat_hexes(combat_id,campaign_id,q,r,movement_mode,sight_mode,academy_barriers) values($1,$2,$3,$4,$5,$6,$7)',
   [battleId,campaign,row.q,row.r,row.movement_mode,row.sight_mode,JSON.stringify(row.academy_barriers)]);
  await db.query("insert into combatants(id,combat_id,campaign_id,source_type,source_id,name_snapshot,movement_remaining) values($1,$2,$3,'character',$1,'Astrid',4)",[actor,battleId,campaign]);
  await db.exec("set test.role='gm'; set role authenticated");
  expect((await db.query('select * from combat_hexes')).rows.length).toBeGreaterThan(0);
  const move=(from,remaining,path)=>db.query('select alea_move_multhex($1,$2,$3,$4,$5) as result',[actor,from.q,from.r,remaining,JSON.stringify(path)]);
  await expect(move(hero,4,[{q:1,r:0}])).rejects.toThrow(/hinder/);
  const diagonal={q:-1,r:1};
  expect((await move(hero,4,[diagonal])).rows[0].result).toMatchObject({q:-1,r:1,spent:1,movement_remaining:3});
  await expect(move(diagonal,3,[{q:-2,r:1}])).rejects.toThrow(/kant/);
  await db.exec("reset role");
  const restore=()=>db.query("update combatants set q=0,r=0,movement_remaining=4 where id=$1",[actor]);
  await restore();
  await expect(db.query("update combatants set state=$2 where id=$1",[actor,JSON.stringify({footprint:{shape:'line2',facing:0}})])).rejects.toThrow(/hexavtryck/);
  await db.exec("set role authenticated; set test.role='member'");
  expect((await db.query('select * from combat_hexes')).rows).toEqual([]);
  await expect(move(hero,4,[diagonal])).rejects.toThrow(/GM/);
 }finally{await db.close()}
},20000);
