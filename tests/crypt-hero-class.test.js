import { describe, expect, it } from 'vitest';
import { HERO_PROFILES, heroPlacement, heroPortraitStyle, heroSwayWeights, readHeightCm } from '../features/crypt/hero-class.js';

describe('Hero Class visual profiles', () => {
  it('holds the body between head and foot at its physical size, including the duck crest', () => {
    for (const [id, cm] of [['astrid', 190], ['lyra', 180], ['evalin', 120]]) {
      const p = HERO_PROFILES[id], sprite = heroPlacement(id, { pixelsPerMeter: 50, heroFactor: 1 });
      expect(sprite.height * (p.anchor.y - p.crownY)).toBeCloseTo(cm / 2);
      expect(sprite.width / sprite.height).toBeCloseTo(p.width / p.height);
    }
    expect(heroPlacement('lyra').usesReferenceHeight).toBe(true);
    expect(heroPlacement('lyra', {heightCm: '165 cm'}).heightCm).toBe(165);
    expect(heroPlacement('astrid', {heightCm: ''}).heightCm).toBe(180);
    expect(readHeightCm('1,9 m')).toBe(190);
    expect(readHeightCm('190 år')).toBeNull();
  });

  it('pins feet, separates cloak lobes, and retains torch sockets across zoom', () => {
    expect(heroSwayWeights('lyra', .1, .77).clothLeft).toBeGreaterThan(.9);
    expect(heroSwayWeights('lyra', .1, .77).clothRight).toBe(0);
    expect(heroSwayWeights('lyra', .85, .77).clothRight).toBeGreaterThan(.9);
    expect(heroSwayWeights('evalin', .48, .93)).toEqual({body:0, gear:0, clothLeft:0, clothRight:0});
    const a = heroPlacement('evalin'), b = heroPlacement('evalin', {pixelsPerMeter: 64});
    expect(b.width).toBe(a.width * 2);
    expect(b.torchFlame).toEqual(a.torchFlame);
    expect(b.torchFlame.y).toBeLessThan(b.torchGrip.y);
    expect(heroPortraitStyle('astrid').backgroundImage).toContain('astrid.webp');
  });
});
