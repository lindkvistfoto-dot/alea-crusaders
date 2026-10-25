import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('function combatBeskyddareSideCells(');
const end=runtime.indexOf('function combatMagicAreaCells(',start);
if(start<0||end<start)throw Error('Beskyddares hexring- och gränslogik saknas');
const code=runtime.slice(start,end);

function setup(areas=[]){
 const ctx={activeCombat:{round_number:1},combatAreaEffects:areas,combatAreaActive:()=>true,
  combatEffectDefinition:({effect_id})=>effect_id==='beskyddare'?{code:'area_beskyddare'}:null,
  combatAxialDistance:(a,b)=>Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r)),
  combatHexLine:(from,to)=>{
   const steps=Math.max(Math.abs(to.q-from.q),Math.abs(to.r-from.r));
   return Array.from({length:steps+1},(_,i)=>({
    q:Math.round(from.q+(to.q-from.q)*i/Math.max(1,steps)),
    r:Math.round(from.r+(to.r-from.r)*i/Math.max(1,steps))
   }))
  }
 };
 runInNewContext(code+'this.api={dimensions:combatBeskyddareDimensions,parameters:combatBeskyddareAreaParameters,side:combatBeskyddareStoredSideCells,contains:combatBeskyddareContains,crossings:combatBeskyddareCrossings};',ctx);
 return ctx.api
}
function ward(eg){
 const api=setup();
 return {id:'ward',effect_id:'beskyddare',center_q:0,center_r:0,
  parameters:api.parameters({effect_grade:eg},'cast')}
}

describe('BESKYDDARE · höjd förenklad till hexringar',()=>{
 test.each([[1,1,7],[2,2,19],[3,3,37],[5,5,91],[15,15,721]])(
  'EG %i ger radie %i och %i hexar',(eg,radius,hexCount)=>{
   const api=setup(),area=ward(eg);
   expect(api.dimensions({effect_grade:eg})).toEqual({radius,hexes:hexCount});
   expect(area.parameters).toMatchObject({shape:'hex_radius',radius_hexes:radius,effect_grade:eg,barrier_eg:1});
   expect(api.side(area.parameters)).toBe(radius);
   let count=0;
   for(let q=-20;q<=20;q++)for(let r=-20;r<=20;r++)if(api.contains(area,{q,r}))count++;
   expect(count).toBe(hexCount);
  }
 );
 test('EG 1 covers the center and adjacent ring, but not the next ring',()=>{
  const api=setup(),area=ward(1);
  expect(api.contains(area,{q:0,r:0})).toBe(true);
  expect(api.contains(area,{q:1,r:0})).toBe(true);
  expect(api.contains(area,{q:1,r:-1})).toBe(true);
  expect(api.contains(area,{q:2,r:0})).toBe(false);
 });
 test('legacy stored cube keeps its prior square footprint until recast',()=>{
  const api=setup(),area={effect_id:'beskyddare',center_q:0,center_r:0,
   parameters:{shape:'cube',cube_side_cells:3}};
  expect(api.side(area.parameters)).toBe(3);
  expect(api.contains(area,{q:1,r:1})).toBe(true);
  expect(api.contains(area,{q:2,r:0})).toBe(false);
  expect(api.side({cube_dimensions_m:{x:6,y:3,z:3}})).toBe(4);
 });
 test('magic crossing the new zone boundary is checked both ways',()=>{
  const area=ward(1),api=setup([area]);
  expect(api.crossings({q:-2,r:0},{q:0,r:0})).toHaveLength(1);
  expect(api.crossings({q:0,r:0},{q:2,r:0})).toHaveLength(1);
  expect(api.crossings({q:-1,r:0},{q:1,r:0})).toHaveLength(0);
  expect(api.crossings({q:2,r:0},{q:3,r:0})).toHaveLength(0);
 });
 test('the UI describes the map projection without a cube height control',()=>{
  expect(runtime).toContain('Varje extra EG lägger till en ring. Höjd visas inte på kartan.');
  expect(runtime).not.toContain('Kubens sida = EG + 2 rutor');
  expect(runtime).toContain(