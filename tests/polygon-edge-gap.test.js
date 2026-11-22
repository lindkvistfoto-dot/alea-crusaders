import { describe, expect, it } from 'vitest';
import { edgeGapRepair } from '../features/map/polygon-edge-gap.js';
import { polygonsOverlap, signedArea, validPolygon } from '../features/map/polygon-edit-geometry.js';

const box = (id, x, y, w, h) => ({ id, points:[[x,y], [x+w,y], [x+w,y+h], [x,y+h]] });
const left = box('left', 0, 0, 100, 100);
const right = box('right', 104, 0, 100, 100);
const fix = (shapes, from = { id:'left', index:1 }, to = { id:'right', index:3 }) => edgeGapRepair(shapes, from, to);

describe('repair an explicitly chosen open seam', () => {
  it('returns an exact preview strip plus one modified room, keeping the target unchanged', () => {
    const shapes = [left, right], original = structuredClone(shapes);
    const result = fix(shapes);
    expect(result.id).toBe('left');
    expect(result.targetId).toBe('right');
    expect(Math.abs(signedArea(result.patch))).toBe(400);
    expect(Math.abs(signedArea(result.points))).toBe(10400);
    expect(result.points).toContainEqual(right.points[0]);
    expect(result.points).toContainEqual(right.points[3]);
    expect(shapes).toEqual(original);
    expect(polygonsOverlap(result.points, right.points)).toBe(false);
  });

  it('clips to the overlapping span without extending either end, even on unequal edges', () => {
    const partial = box('right', 104, -10, 100, 90);
    const result = fix([left,partial]);
    expect(result.patch).toEqual([[100,0], [104,0], [104,80], [100,80]]);
    expect(Math.abs(signedArea(result.points))).toBe(10320);
    expect(result.points.slice(0,2)).toEqual(left.points.slice(0,2));
    expect(result.points.at(-1)).toEqual(left.points.at(-1));
  });

  it('handles a modestly angled target, both windings, and an exact triangular taper', () => {
    const tilted = { id:'right', points:[[102,0],[205,0],[205,100],[108,100]] };
    const result = fix([left,tilted]);
    expect(result.patch).toEqual([[100,0], [102,0], [108,100], [100,100]]);
    const reversed = { ...left, points:[...left.points].reverse() };
    const opposite = fix([reversed,tilted]);
    expect(signedArea(opposite.points)).toBe(-Math.abs(signedArea(result.points)));
    const tip = { id:'right', points:[[100,0],[205,0],[205,100],[108,100]] };
    const triangle = fix([left,tip]);
    expect(triangle.patch).toHaveLength(3);
    expect(Math.abs(signedArea(triangle.patch))).toBe(400);
  });

  it('keeps rotated target end coordinates exact after projection on the source axis', () => {
    const tilt = ([x,y]) => [431.123 + x*Math.cos(0.44) - y*Math.sin(0.44), 219.765 + x*Math.sin(0.44) + y*Math.cos(0.44)];
    const shapes = [left,right].map(shape => ({...shape, points:shape.points.map(tilt)}));
    const result = fix(shapes);
    expect(result).not.toBeNull();
    expect(result.patch).toContainEqual(shapes[1].points[0]);
    expect(result.patch).toContainEqual(shapes[1].points[3]);
    expect(validPolygon(result.points)).toBe(true);
    expect(polygonsOverlap(result.points,shapes[1].points)).toBe(false);
  });

  it('refuses unbounded extrapolation, a wide opening, an occupied strip, and a room crossing behind the seam', () => {
    expect(fix([left,box('right', 104, 110, 100, 100)])).toBeNull();
    expect(fix([left,box('right', 181, 0, 100, 100)])).toBeNull();
    expect(fix([left,right,box('island', 101, 40, 2, 5)])).toBeNull();
    expect(fix([left,right,box('crossing', 90, 40, 22, 5)])).toBeNull();
  });

  it('refuses a backward, transverse, coincident, crossing or missing target', () => {
    expect(fix([left,right], {id:'left',index:3})).toBeNull();
    expect(fix([left,right], {id:'left',index:1}, {id:'right',index:0})).toBeNull();
    expect(fix([left,box('right',100,0,50,100)])).toBeNull();
    expect(fix([left,{id:'right',points:[[98,0],[160,0],[160,100],[105,100]]}])).toBeNull();
    expect(fix([left], {id:'left',index:1}, {id:'left',index:2})).toBeNull();
    expect(fix([left,right], {id:'left',index:4})).toBeNull();
  });
});
