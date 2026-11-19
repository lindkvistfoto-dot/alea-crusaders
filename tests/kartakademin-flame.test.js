import { describe, expect, it } from 'vitest';
import { flameOrigins, flameWeights, featherVisibility, flames } from '../features/map/kartakademin-flame.js';
import { createMask, isFree } from '../features/map/kartakademin-mask.js';

describe('Kartakademin flame projections', () => {
  const origin = Object.freeze([10, 10]);
  const positions = flameOrigins(origin, 40, flames.fackla, [], null);
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
    expect(flameWeights(7, 0, flames.fackla)).toEqual([1/3, 1/3, 1/3]);
  });
  it('stops a sample before a thin Solid cell or an open vector wall', () => {
    const mask = createMask(30, 30);
    mask.cells.fill(1);
    mask.cells.fill(0, 8 * 30, 9 * 30);
    const [north] = flameOrigins(origin, 100, flames.eldstad, [], mask);
    expect(north[1]).toBeGreaterThan(9);
    expect(isFree(mask,north)).toBe(true);
    const [limited] = flameOrigins(origin, 100, flames.eldstad, [[[0,9.5],[30,9.5]]], mask);
    expect(limited[1]).toBeCloseTo(9.5, 3);
    expect(limited[1]).toBeGreaterThan(9.5);
  });
  it('feathers inward from a corner, without adding any coverage to the umbra', () => {
    const size = 32, image = new Uint8ClampedArray(size * size * 4);
    const alpha = (x,y) => 4 * (y * size + x) + 3;
    for (let y=0;y<size;y++) for(let x=0;x<size;x++) if(x<12 || y<12) image[alpha(x,y)]=255;
    featherVisibility(image,size,size,6);
    for(let y=12;y<size;y++) for(let x=12;x<size;x++) expect(image[alpha(x,y)]).toBe(0);
    const ramp = Array.from({ length:7 }, (_,i)=>image[alpha(12-i,22)]);
    expect(ramp[0]).toBe(0); expect(ramp[6]).toBe(255);
    expect(new Set(ramp).size).toBe(7);
    expect(image[alpha(10,10)]).toBeGreaterThan(image[alpha(11,11)]);
  });
});
