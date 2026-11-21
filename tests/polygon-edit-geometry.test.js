import { describe, expect, it } from 'vitest';
import {
  areaPoints, hitPolygons, insertSharedVertex, mapPointer, mapScreenScale, movePreparedVertices, nearestEdge,
  onSegment, polygonsOverlap, prepareVertexMove, snapPoint, validPolygon,
} from '../features/map/polygon-edit-geometry.js';

const box = (x, y, width, height) => [[x,y], [x+width,y], [x+width,y+height], [x,y+height]];

describe('Polygon Studio room coordinates', () => {
  it('adapts legacy rectangles and explicitly closed polygons without modifying either row', () => {
    const row = { shape_type: 'rect', shape_data: { x: 2, y: 4, width: 10, height: 5 } };
    const corners = box(2, 4, 10, 5);
    expect(areaPoints(row)).toEqual(corners);
    const closed = { shape_type: 'polygon', shape_data: { points: [...corners, corners[0]] } };
    expect(areaPoints(closed)).toEqual(corners);
    expect(closed.shape_data.points).toHaveLength(5);
    expect(areaPoints({ shape_data: { points: [[2,4], [null, 1], [4,8]] } })).toEqual([]);
  });

  it('uses the inverse SVG matrix for panning, map zoom and letterboxing', () => {
    const original = globalThis.DOMPoint;
    try {
      globalThis.DOMPoint = class {
        constructor(x, y) { this.x = x; this.y = y; }
        matrixTransform(m) { return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }; }
      };
      const svg = { getScreenCTM: () => ({
        a: 2, b: 0, c: 0, d: 4, inverse: () => ({ a: 0.5, d: 0.25, e: -80, f: -10 }),
      }) };
      expect(mapPointer({ clientX: 201, clientY: 55 }, svg)).toEqual([20.5, 3.75]);
      expect(mapScreenScale(svg)).toEqual({ scaleX: 2, scaleY: 4 });
    } finally {
      if (original) globalThis.DOMPoint = original;
      else delete globalThis.DOMPoint;
    }
  });
});

describe('simple room boundaries and intersections', () => {
  it('keeps forward collinear subdivisions and rejects crossings, pinches, spikes and near-zero edges', () => {
    expect(validPolygon([[0,0], [5,0], [10,0], [10,10], [0,10]])).toBe(true);
    expect(validPolygon([[0,0], [10,10], [10,0], [0,10]])).toBe(false);
    expect(validPolygon([[0,0], [10,0], [10,10], [5,0], [0,10]])).toBe(false);
    expect(validPolygon([[0,0], [10,0], [7,0], [8,12], [0,8]])).toBe(false);
    expect(validPolygon([[0,0], [1e-9,1e-9], [10,0], [0,5]])).toBe(false);
    expect(validPolygon(box(2000, 1000, 1e-5, 1e-5))).toBe(true);
    expect(validPolygon([[0,0], [1,1], [2,2]])).toBe(false);
  });

  it('allows opposite sides of one wall and detects aligned, identical, inscribed and crossing areas', () => {
    const a = box(0,0,10,10);
    expect(polygonsOverlap(a, box(10,2,4,8))).toBe(false);
    expect(polygonsOverlap(a, box(10,10,4,8))).toBe(false);
    expect(polygonsOverlap(a, box(9.999999,2,4,8))).toBe(true);
    expect(polygonsOverlap(a, [...a].reverse())).toBe(true);
    expect(polygonsOverlap(a, box(5,0,12,10))).toBe(true);
    expect(polygonsOverlap(a, [[5,0], [10,5], [5,10], [0,5]])).toBe(true);
    expect(polygonsOverlap(a, [[-1,4], [11,4], [11,6], [-1,6]])).toBe(true);
  });

  it('allows a concave room with a separate polygon in the notch, including common walls', () => {
    const room = [[0,0], [9,0], [9,9], [8,9], [8,1], [1,1], [1,9], [0,9]];
    expect(polygonsOverlap(room, box(1,1,7,8))).toBe(false);
    expect(polygonsOverlap(room, box(2,2,5,4))).toBe(false);
  });
});

describe('selection, snap and nearest edges in CSS pixels', () => {
  const shapes = [{ id: 'left', points: box(0,0,10,10) }, { id: 'right', points: box(10,0,10,10) }];

  it('offers both rooms at a shared boundary and honors screen tolerance', () => {
    expect(hitPolygons([10,4], shapes)).toEqual(['right', 'left']);
    expect(hitPolygons([11,4], shapes, { scaleX: 10, tolerance: 9 })).toEqual(['right']);
    expect(hitPolygons([11,4], shapes, { scaleX: 10, tolerance: 10 })).toEqual(['right', 'left']);
  });

  it('returns the closest edge with its distance, and preserves exact endpoints', () => {
    expect(nearestEdge([5,11], shapes[0].points)).toEqual({ index: 2, point: [5,10], t: 0.5, distance: 1 });
    const point = [2.123456789,3.987654321];
    const room = { id: 'other', points: [point, [100,5], [60,100]] };
    for (const scale of [0.25,1,7,30]) {
      const snap = snapPoint([point[0] - 6 / scale, point[1]], [room], { scaleX: scale, scaleY: scale, tolerance: 8 });
      expect(snap).toMatchObject({ kind: 'vertex', id: 'other', index: 0, point });
      expect(snap.distance).toBeCloseTo(6);
      expect(snapPoint([point[0] - 12 / scale, point[1]], [room], { scaleX: scale, scaleY: scale, tolerance: 8 })).toBeNull();
    }
  });

  it('keeps a fixed wall available when moving a room vertex along it', () => {
    const origin = [10, 0], wall = { id: 'wall', closed: false, points: [[-20,0], [40,0]] };
    const snap = snapPoint([15, 0.4], [...shapes, wall], {
      scaleX: 10, scaleY: 10, tolerance: 8, excludePoint: origin, excludeIds: new Set(['right', 'left']),
    });
    expect(snap).toMatchObject({ id:'wall', kind:'edge', point:[15,0] });
  });

  it('projects onto open walls using screen distances, and excludes moving incident edges', () => {
    const wall = { id: 'wall', closed: false, points: [[0,0], [100,100], [100,0]] };
    const options = { scaleX: 3, scaleY: 1, tolerance: 15 };
    expect(snapPoint([50,60], [wall], options)).toMatchObject({ kind: 'edge', index: 0, point: [51,51] });
    expect(snapPoint([50,0], [wall], options)).toBeNull();
    expect(snapPoint([1,2], shapes, { scaleX: 10, scaleY: 10, tolerance: 12, excludePoint: [0,0] })).toBeNull();
  });
});

describe('shared room walls', () => {
  const left = { id: 'left', points: box(0,0,10,10) };
  const right = { id: 'right', points: [[10,0], [20,0], [20,10], [10,10], [10,3.3456789]] };
  const far = { id: 'far', points: box(100,100,5,5) };

  it('inserts the same unrounded point on both sides without changing the input', () => {
    const point = [10,6.4321987654];
    const changes = insertSharedVertex([left,right,far], point);
    expect(changes.map(x => x.id)).toEqual(['left','right']);
    for (const shape of changes) expect(shape.points).toContainEqual(point);
    expect(left.points).toHaveLength(4);
    expect(insertSharedVertex([left,right], [10.0000001,7])).toEqual([]);
  });

  it('moves a shared corner once and preserves intermediate nodes present on just one side', () => {
    const move = prepareVertexMove([left,right,far], [10,0]);
    const changes = movePreparedVertices(move, [9,1]);
    expect(changes.map(change => change.id)).toEqual(['left','right']);
    for (const change of changes) {
      expect(change.points).toContainEqual([9,1]);
      expect(change.points).toContainEqual([10,3.3456789]);
      expect(validPolygon(change.points)).toBe(true);
    }
    expect(polygonsOverlap(changes[0].points,changes[1].points)).toBe(false);
    expect(left.points).toEqual(box(0,0,10,10));
  });

  it('materializes a T junction during movement without pulling a nearby independent wall', () => {
    const touching = { id: 'smaller', points: box(10,3,3,3) };
    const offset = { id: 'separate', points: box(10.0000001,2,3,4) };
    const move = prepareVertexMove([left,touching,offset], [10,3]);
    expect(move.map(change => change.id)).toEqual(['left','smaller']);
    expect(move[0].points).toContainEqual([10,6]);
    const changes = movePreparedVertices(move, [9.5,3]);
    expect(onSegment([9.75,4.5], changes[0].points[move[0].index], [10,6])).toBe(true);
    expect(polygonsOverlap(changes[0].points, changes[1].points)).toBe(false);
  });
});
