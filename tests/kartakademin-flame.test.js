import { describe, expect, it } from 'vitest';
import { flameOrigins, flameWeights, visibleArea, flames } from '../features/map/kartakademin-flame.js';
import { contains, visibilityPolygon } from '../features/map/kartakademin-geometry.js';
import { createMask, isFree, maskEdges } from '../features/map/kartakademin-mask.js';

describe('Kartakademin flame projections', () => {
  const origin = Object.freeze([10, 10]);
  const samples = flameOrigins(origin, 40, flames.fackla, [], null);
  const positions = [[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]].map(indices =>
    origin.map((_, axis) => indices.reduce((sum, i) => sum + samples[i][axis], 0) / 4));
  it('moves the virtual torch coherently within five centimetres at its preset', () => {
    let max = 0;
    for (let phase = 0; phase < 50; phase += .1) {
      const weights = flameWeights(phase, .18, flames.fackla);
      expect(weights.reduce((a,b) => a+b, 0)).toBeCloseTo(1, 12);
      expect(Math.min(...weights)).toBeGreaterThanOrEqual(0);
      const displacement = origin.map((coord, axis) =>
        positions.reduce((v, p, i) => v + weights[i] * (p[axis] - coord), 0));
      max = Math.max(max, Math.hypot(...displacement) / 40);
      const next = flameWeights(phase + .001, .18, flames.fackla);
      expect(Math.abs(next[0] - weights[0])).toBeLessThan(.001);
    }
    expect(max).toBeCloseTo(.05, 3);
    expect(flameWeights(7, 0, flames.fackla)).toEqual([.25, .25, .25, .25]);
  });
  it('stops a sample before a thin Solid cell or an open vector wall', () => {
    const mask = createMask(30, 30);
    mask.cells.fill(1);
    mask.cells.fill(0, 8 * 30, 9 * 30);
    const [, north] = flameOrigins(origin, 100, flames.eldstad, [], mask);
    expect(north[1]).toBeGreaterThan(9);
    expect(isFree(mask,north)).toBe(true);
    const [, limited] = flameOrigins(origin, 100, flames.eldstad, [[[0,9.5],[30,9.5]]], mask);
    expect(limited[1]).toBeCloseTo(9.5, 3);
    expect(limited[1]).toBeGreaterThan(9.5);
  });
  it('retains visible silhouettes when hidden mask corners are skipped', () => {
    const mask = createMask(27, 25);
    mask.cells.fill(1);
    for (const [x, y] of [[8,7],[9,7],[8,8],[11,11],[13,12],[14,12],[18,6],[18,7]]) mask.cells[y*27+x]=0;
    mask.edges = maskEdges(mask);
    const edges = [[[12,15],[22,16]]];
    for (const aperture of [70,360]) {
      const args = [[3.5,5.5],40,edges,35,aperture,mask];
      const full = visibilityPolygon(...args), fast = visibilityPolygon(...args,true);
      expect(fast.length).toBeLessThan(full.length);
      for (let y=0; y<25; y++) for (let x=0; x<27; x++) {
        const point = [x+.37,y+.41];
        expect(contains(fast,point)).toBe(contains(full,point));
      }
    }
  });
  it('integrates partial visibility continuously, including zero-area corner contacts', () => {
    expect(visibleArea(-1, -4, 0)).toBe(0);
    expect(visibleArea(1, 0, 2)).toBe(1);
    for (const t of [.01, .1, .25, .5, .75, .99]) {
      const a = t, b = t - 1;
      for (const v of [[a,b,b],[b,a,b],[b,b,a]]) {
        expect(visibleArea(...v)).toBeCloseTo(t*t, 12);
        expect(visibleArea(...v.map(x=>-x))).toBeCloseTo(1-t*t, 12);
      }
    }
  });
});
