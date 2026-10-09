import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../features/combat/footprint.js',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const scene=readFileSync(new URL('../features/combat/admin-scenes.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/migrations/20261009164500_multihex_area_and_terrain.sql',import.meta.url),'utf8');
const geo=runInNewContext(source+`
this.geo={shape:combatFootprintShape,face:combatFootprintFacing,cells:combatFootprintCells,
 overlap:combatFootprintOverlaps,distance:combatFootprintDistance,area:combatFootprintIntersectsRadius};`,{});
const actor=(name,shape,q,r,facing=0)=>({id:name,name_snapshot:name,q,r,state:{footprint:{shape,facing}}});
const positions=c=>Array.from(c,x=>x.q+','+x.r);
describe('Flerhex · geometri och expertmallar',()=>{
 it('åsnan markerar gränsen, medan mindre djur stannar på en hex',()=>{
  for(const name of ['varg','lodjur','hund','räv','örn'])expect(geo.cells({name_snapshot:name,q:0,r:0})).toHaveLength(1);
  for(const name of ['Åsna','Ridhäst','Lejon','Tiger'])expect(geo.cells({name_snapshot:name,q:0,r:0})).toHaveLength(2);
  expect(geo.cells({name_snapshot:'Rese',q:0,r:0})).toHaveLength(3);
 });
 it('häst är två sammanhängande hex som roteras till sex riktningar',()=>{
  const a=actor('Häst','line2',1,1);
  const tails=[];
  for(let facing=0;facing<6;facing++){
   const cells=geo.cells(a,1,1,facing);
   expect(cells).toHaveLength(2);
   expect(geo.distance({...a,q:cells[0].q,r:cells[0].r,state:{footprint:{shape:'single'}}},{...a,q:cells[1].q,r:cells[1].r,state:{footprint:{shape:'single'}}})).toBe(1);
   tails.push(positions([cells[1]])[0]);
  }
  expect(new Set(tails).size).toBe(6);
 });
 it('rese är 3 hex i triangel och inte en linje',()=>{
  for(let facing=0;facing<6;facing++){
   const c=geo.cells(actor('Rese','triangle3',0,0,facing));
   expect(c).toHaveLength(3);
   for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)
    expect(geo.distance(actor('A','single',c[i].q,c[i].r),actor('B','single',c[j].q,c[j].r))).toBe(1);
  }
 });
 it('upptar alla rutor vid kollision, räckvidd och område men är bara en varelse',()=>{
  const horse=actor('Häst','line2',0,0),rese=actor('Rese','triangle3',2,0);
  expect(geo.distance(horse,rese)).toBe(1);
  expect(geo.overlap(horse,actor('Fiende','single',1,0))).toBe(true);
  expect(geo.overlap(horse,actor('Fiende','single',3,0))).toBe(false);
  expect(geo.area(horse,{q:1,r:0},0)).toBe(true);
  expect(geo.area(horse,{q:3,r:0},1)).toBe(false);
  expect(geo.cells(horse)).toHaveLength(2);
 });
});
describe('Flerhex · inbyggd stridsmekanik',()=>{
 it('rörelse och uppställning kontrollerar hela avtrycket',()=>{
  const begin=runtime.indexOf('function combatMovementOccupied(');
  const end=runtime.indexOf('function combatSetMovementPreview(',begin);
  expect(begin).toBeGreaterThan(-1);expect(end).toBeGreaterThan(begin);
  const ctx={};
  runInNewContext(source+`
this.expose={combatFootprintCells,combatFootprintKey,combatFootprintOverlaps,combatFootprintShape,combatFootprintFacing};`,ctx);
  const map=[];
  for(let q=-1;q<=4;q++)for(let r=-1;r<=3;r++)map.push({q,r,key:q+','+r,movement_mode:'free',notes:''});
  const enemy=actor('Fiende','single',2,1),horse=actor('Häst','line2',0,1);
  Object.assign(ctx,ctx.expose,{combatants:[horse,enemy],combatRuntimeHexCells:()=>map,
    combatFlightCapabilities:()=>({ignore_terrain:false}),combatTerrainIsWall:cell=>!!cell&&cell.notes==='wall'});
  runInNewContext(runtime.slice(begin,end)+'this.stand=combatFootprintCanStand;',ctx);
  expect(ctx.stand(horse,0,1)).toBe(true);
  expect(ctx.stand(horse,1,1)).toBe(false); // Tail overlaps enemy.
  expect(ctx.stand(horse,2,1)).toBe(false);
  expect(ctx.stand(horse,4,1)).toBe(false); // Tail outside map.
  map.find(c=>c.q===1&&c.r===1).notes='wall';
  expect(ctx.stand(horse,0,1)).toBe(false);
 });
 it('målangivelse, sikt och områdesskada använder hela varelsen',()=>{
  for(const marker of [
    'combatFootprintDistance(actor,target)',
    'combatFootprintIntersectsRadius(row,center,radius)',
    'combatFootprintCells(row).some(cell=>combatBeskyddareContains(cubeArea,cell))',
    'combatFootprintCanStand(combatant,nq,nr)',
    'rpc/alea_move_multhex',
    'rpc/alea_rotate_multhex',
    'combat-footprint-hex'
  ])expect(runtime).toContain(marker);
  expect(sql).toContain('public.alea_footprint_cells');
  expect(sql).toContain("v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END;");
  expect(sql).toContain("private.haj_area_event(v_area.id,p_combatant_id,p_round,'stay')");
 });
 it('scenadministrationen sparar form och riktning utan schemaändring',()=>{
  expect(scene).toContain('sceneCombatantShape_');
  expect(scene).toContain('sceneCombatantFacing_');
  expect(scene).toContain('sceneCombatantCanFit');
  expect(scene).toContain('footprint:{shape,facing}');
  expect(html.indexOf('features/combat/footprint.js')).toBeLessThan(html.indexOf('features/combat/admin-scenes.js'));
  expect(html.indexOf('features/combat/footprint.js')).toBeLessThan(html.indexOf('features/combat/runtime.js'));
 });
});
