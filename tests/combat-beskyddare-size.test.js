import {describe,expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const runtime=readFileSync(new URL('../features/combat/runtime.js',import.meta.url),'utf8');
const start=runtime.indexOf('function combatBeskyddareSideCells(');
const end=runtime.indexOf('function combatMagicAreaCells(',start);
if(start<0||end<start)throw Error('Beskyddares kub- och gränslogik saknas');
const code=runtime.slice(start,end);

function setup(areas=[]){
 const ctx={
  activeCombat:{round_number:1},
  combatAreaEffects:areas,
  combatAreaActive:()=>true,
  combatEffectDefinition:({effect_id})=>effect_id==='beskyddare'?{code:'area_beskyddare'}:null,
  combatHexLine:(from,to)=>{
   const steps=Math.max(Math.abs(to.q-from.q),Math.abs(to.r-from.r));
   return Array.from({length:steps+1},(_,i)=>({
    q:Math.round(from.q+(to.q-from.q)*i/Math.max(1,steps)),
    r:Math.round(from.r+(to.r-from.r)*i/Math.max(1,steps))
   }))
  }
 };
 runInNewContext(code+'\nthis.api={dimensions:combatBeskyddareDimensions,parameters:combatBeskyddareAreaParameters,side:combatBeskyddareStoredSideCells,contains:combatBeskyddareContains,crossings:combatBeskyddareCrossings};',ctx);
 return ctx.api
}
function ward(eg,old=false){
 const api=setup();
 return {id:'ward',effect_id:'beskyddare',center_q:0,center_r:0,
  parameters:old?{shape:'cube',cube_axes:Array.from({length:eg-1},()=> 'x'),cube_dimensions_m:{x:3*eg,y:3,z:3}}:api.parameters({effect_grade:eg},'cast')}
}

describe('BESKYDDARE: varje sida har EG + 2 rutor',()=>{
 test.each([[1,3,27,9],[2,4,64,16],[3,5,125,25],[5,7,343,49],[15,17,4913,289]])(
  'EG %i skapar %i×%i×%i rutor med korrekt kartyta',(eg,side,volume,footprint)=>{
   const api=setup(),area=ward(eg);
   expect(api.dimensions({effect_grade:eg})).toEqual({x:side,y:side,z:side});
   expect(api.side(area.parameters)).toBe(side);
   expect(side**3).toBe(volume);
   let count=0;
   for(let q=-20;q<=20;q++)for(let r=-20;r<=20;r++)if(api.contains(area,{q,r}))count++;
   expect(count).toBe(footprint);
  }
 );
 test('EG 1 täcker 3×3 hex runt centrum, men inte intilliggande fjärde kolumn',()=>{
  const api=setup(),area=ward(1);
  expect(api.contains(area,{q:-1,r:-1})).toBe(true);
  expect(api.contains(area,{q:1,r:1})).toBe(true);
  expect(api.contains(area,{q:2,r:0})).toBe(false);
  expect(api.contains(area,{q:0,r:-2})).toBe(false);
 });
 test('jämna sidmått omfattar exakt fyra rutor per axel',()=>{
  const api=setup(),area=ward(2);
  expect(api.contains(area,{q:-1,r:-1})).toBe(true);
  expect(api.contains(area,{q:2,r:2})).toBe(true);
  expect(api.contains(area,{q:-2,r:0})).toBe(false);
  expect(api.contains(area,{q:0,r:3})).toBe(false);
 });
 test('redan utplacerade kuber med gammal axelmodell följer samma EG+2-regel',()=>{
  for(const eg of [1,2,3,5]){
   const api=setup(),area=ward(eg,true);
   expect(api.side(area.parameters)).toBe(eg+2);
   expect(api.contains(area,{q:eg+1,r:0})).toBe(false);
  }
 });
 test('magi som passerar kubens gräns inåt eller utåt ger spärrkontroll',()=>{
  const area=ward(1),api=setup([area]);
  expect(api.crossings({q:-2,r:0},{q:0,r:0})).toHaveLength(1);
  expect(api.crossings({q:0,r:0},{q:2,r:0})).toHaveLength(1);
  expect(api.crossings({q:-1,r:0},{q:1,r:0})).toHaveLength(0);
  expect(api.crossings({q:2,r:0},{q:3,r:0})).toHaveLength(0);
 });
 test('nya kuber visar rutor utan gamla axelval',()=>{
  expect(runtime).toContain('Kubens sida = EG + 2 rutor');
  expect(runtime).not.toContain('combatSetBeskyddareAxis');
  expect(runtime).toContain('cube_dimensions_cells:');
 })
});
