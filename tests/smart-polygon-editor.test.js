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
 it('does not confuse a concave polygon notch with a sealed gap',()=>{
  const notch=[[0,0],[30,0],[30,30],[20,30],[20,10],[10,10],[10,30],[0,30]];
  expect(findHoles([notch])).toEqual([]);
 });
 it('fills a notch only once adjoining polygons close its entrance',()=>{
  const frame=[square(0,0,30,10),square(0,20,30,10),square(0,10,10,10),square(20,10,10,10)];
  const holes=findHoles(frame);
  expect(holes).toHaveLength(1);
  const merged=mergeHole(frame[2],holes[0].points);
  expect(merged).not.toBeNull();
  expect(Math.abs(area(merged))).toBeCloseTo(200);
  expect(findHoles([frame[0],frame[1],merged,frame[3]])).toEqual([]);
 });
 it('does not merge polygons without a common boundary',()=>{
  expect(mergeHole(square(0,0,10,10),square(20,20,5,5))).toBeNull();
 });
});

describe('Fill Gap proposes only unoccupied, closed vector faces', () => {
  const frame = [
    square(0, 0, 30, 10), square(0, 20, 30, 10),
    square(0, 10, 10, 10), square(20, 10, 10, 10),
  ];

  it('leaves a real narrow opening open even below the previous node-rounding precision', () => {
    const open = [...frame.slice(0, 3), square(20, 10.000003, 10, 9.999997)];
    expect(findHoles(open)).toEqual([]);
  });

  it('does not cover an occupied island or a room crossing the candidate boundary', () => {
    expect(findHoles([...frame, square(12, 12, 2, 2)])).toEqual([]);
    expect(findHoles([...frame, square(17, 13, 10, 4)])).toEqual([]);
  });

  it('follows a concave recess and a T-junction without rounding source coordinates', () => {
    const shifted = [...frame, square(12, 10, 2, 2)]
      .map((ring, index) => {
        const points = ring.map(([x, y]) => [x + 0.00381639, y + 0.00000123]);
        return index % 2 ? points.reverse() : points;
      });
    const before = structuredClone(shifted);
    const gaps = findHoles(shifted);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].points).toHaveLength(8);
    expect(gaps[0].area).toBeCloseTo(96, 10);
    const sourceCoordinates = new Set(shifted.flat().map(point => point.join(',')));
    expect(gaps[0].points.every(point => sourceCoordinates.has(point.join(',')))).toBe(true);
    expect(findHoles([...shifted, gaps[0].points])).toEqual([]);
    expect(shifted).toEqual(before);
  });

  it('detects a triangular void between rooms touching at individual vertices', () => {
    const a = [13, 21], b = [19, 21], c = [16, 25];
    const rings = [[a, b, [16, 15]], [b, c, [24, 23]], [c, a, [9, 24]]];
    const gaps = findHoles(rings);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].area).toBeCloseTo(12);
    expect(gaps[0].points).toEqual(expect.arrayContaining([a, b, c]));
  });

  it('keeps separate candidates when one hole has an occupied island', () => {
    const other = frame.map(poly => poly.map(([x, y]) => [x + 40, y]));
    const gaps = findHoles([...frame, ...other, square(12, 12, 2, 2)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].points.every(([x]) => x >= 50)).toBe(true);
  });
});
