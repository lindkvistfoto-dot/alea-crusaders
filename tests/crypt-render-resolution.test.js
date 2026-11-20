import { describe, expect, it } from 'vitest';
import { backingResolution } from '../features/crypt/surface.js';

function clock(native=1) {
  const sample=backingResolution(native);
  let now=100,resolution=sample(now,false);
  return {
    draw(interval, frames=1) {
      for(let i=0;i<frames;i++){now+=interval;resolution=sample(now,false);}
      return resolution;
    },
    still(){return sample(0,true);},
  };
}

describe('crypt physical backing resolution', () => {
  it('keeps native pixels through a one-off expensive update and a suspended tab', () => {
    const c=clock(2);
    c.draw(33,25);c.draw(420);c.draw(33,50);c.draw(90000);
    expect(c.draw(33,60)).toBe(2);
  });
  it('reduces physical pixels to a floor under sustained pressure and restores still detail', () => {
    const c=clock();
    expect(c.draw(76,17)).toBe(.8);
    expect(c.draw(76,100)).toBe(.6);
    expect(c.still()).toBe(1);
  });
  it('waits for sustained recovery, and backs off after a failed upgrade', () => {
    const c=clock();
    c.draw(75,100);
    expect(c.draw(30,250)).toBe(.6);
    // Switch back to a slow device immediately after the first upward probe.
    expect(c.draw(30,125)).toBe(.8);
    expect(c.draw(76,35)).toBe(.6);
    expect(c.draw(30,400)).toBe(.6);
    expect(c.draw(30,2100)).toBeGreaterThan(.6);
  });
});
