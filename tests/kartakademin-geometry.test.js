import { describe, expect, it } from 'vitest';
import { blockers, canMove, contains, directionalReach, knownAreas, parallelBeamQuads, resolveOrigin, visibilityPolygon } from '../features/map/kartakademin-geometry.js';

import { createMask } from '../features/map/kartakademin-mask.js';

const wall = { points: [[10, 0], [10, 20]], closed: false, light: true, sight: true, movement: true };
const pit = { points: [[2, 8], [8, 8], [8, 12], [2, 12]], closed: true, movement: true };
const geometry = [wall, pit];

describe('Kartakademins oberoende kartlager', () => {
  it('bevarar upptäckt utan en ljuskälla eller position', () => {
    expect(knownAreas([{ status: 'unknown' }, { status: 'unexplored' }, { status: 'explored' }]))
      .toEqual([{ status: 'unexplored' }, { status: 'explored' }]);
  });

  it('stoppar ljus och sikt bakom väggen och släpper runt ändpunkten', () => {
    for (const property of ['light', 'sight']) {
      const polygon = visibilityPolygon([5, 5], 50, blockers(geometry, property));
      expect(contains(polygon, [15, 5])).toBe(false);
      expect(contains(polygon, [10.01, 19.99])).toBe(false);
      expect(contains(polygon, [15, 40])).toBe(true);
      expect(contains(polygon, [5, 10])).toBe(true);
    }
  });

  it('blockerar rörelse genom avgrunden eller väggen utan att avgrunden blockerar sikt', () => {
    expect(canMove(geometry, [5, 5], [5, 15])).toBe(false);
    expect(canMove(geometry, [5, 5], [15, 5])).toBe(false);
    expect(canMove(geometry, [5, 5], [9, 5])).toBe(true);
    expect(blockers(geometry, 'sight')).toEqual([wall.points]);
  });

  it('uppdaterar bärarens ljus individuellt och släcker det när positionen försvinner', () => {
    const light = { characterId: 'a', position: [0, 0] };
    expect(resolveOrigin(light, [{ character_id: 'a', position: [3, 4] }])).toEqual([3, 4]);
    expect(resolveOrigin(light, [{ character_id: 'a', position: [4, 6] }])).toEqual([4, 6]);
    expect(resolveOrigin(light, [{ character_id: 'b', position: [4, 6] }])).toBeUndefined();
  });

  it('begränsar riktat ljus till sektorn och räckvidden', () => {
    const polygon = visibilityPolygon([0, 0], 20, [], 0, 60);
    expect(contains(polygon, [15, 0])).toBe(true);
    expect(contains(polygon, [4, 15])).toBe(false);
    expect(contains(polygon, [25, 0])).toBe(false);
    expect(directionalReach({ type: 'solljus', range: 12, height: 3, inclination: 45 })).toBeCloseTo(3);
  });
});

it('assigns separate display treatments without using lighting or room information', async () => {
  const { roomVisibility } = await import('../features/map/kartakademin-geometry.js');
  expect(['unknown', 'unexplored', 'explored', undefined].map(roomVisibility)).toEqual([
    'black', 'blur', 'sharp', 'black',
  ]);
});

it('stoppar parallella ljusstrålar vid första Solid-cellen', () => {
  const mask = createMask(20, 20);
  mask.cells.fill(1);
  for (let y = 0; y < 20; y++) mask.cells[y * 20 + 10] = 0;
  const quads = parallelBeamQuads([4, 10], 14, 6, 0, [], mask);
  expect(quads.length).toBeGreaterThan(0);
  expect(quads.every(quad => quad[4] === 10 && quad[6] === 10)).toBe(true);
});
