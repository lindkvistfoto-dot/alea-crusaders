import {describe,it,expect} from 'vitest';
import {area,splitPolygons,findHoles,mergeHole,moveSharedVertex} from '../features/map/polygon-topology.js';
const square=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
describe('Smart Polygon Editor topology',()=>{
 it('never reports the exterior as a hole',()=>{
  expect(findHoles([square(0,0,10,10)])).toEqual([]);
  expect(findHoles([square(0,0,10,10),square(20,0,10,10)])).toEqual([]);
 });
 it('detects a bounded gap between four surrounding polygons',()=>{
  const strips=[
   square(0,0,30,10),square(0,20,30,10),
   square(0,10,10,10),square(20,10,10,10)
  ];
  const gaps=findHoles(strips);
  expect(gaps).toHaveLength(1);
  expect(gaps[0].area).toBeCloseTo(100);
  expect(Math.abs(area(mergeHole(strips[0],gaps[0].points)))).toBeCloseTo(400);
 });
 it('splits a neighbor edge at shared intermediate vertices',()=>{
  const [top,bottom]=splitPolygons([
   square(0,0,20,10),square(0,10,10,10)
  ]);
  expect(top.some(p=>p[0]===10&&p[1]===10)).toBe(true);
  expect(bottom).toHaveLength(4);
 });
 it('can move a vertex shared by three polygons without leaving a gap',()=>{
  const polys=[[[0,0],[10,0],[10,10]],[[10,0],[20,0],[20,10],[10,10]],[[10,10],[20,10],[20,20]]];
  const changed=moveSharedVertex(polys,[10,10],[12,9]);
  expect(changed.flat().filter(p=>p[0]===12&&p[1]===9)).toHaveLength(3);
  expect(polys[0][2]).toEqual([10,10]);
 });
 it('does not merge polygons without a common boundary',()=>{
  expect(mergeHole(square(0,0,10,10),square(20,20,5,5))).toBeNull();
 });
});
