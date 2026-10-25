import { describe, expect, it } from 'vitest';
import {
  createHonorDraft, createReliefVariant, resolveBadgeComposition,
  playerVisibleHonors, BADGE_METALS
} from './arcane-laurel-model.js';

describe('ARCANE LAUREL BADGE model', () => {
  it('creates hidden manual drafts by default', () => {
    expect(createHonorDraft({ name: ' Sir Robin Award ' })).toMatchObject({
      name: 'Sir Robin Award', status: 'draft', grant_mode: 'manual', type: 'badge'
    });
  });
  it('rejects invalid category and empty name', () => {
    expect(() => createHonorDraft({ name: ' ' })).toThrow();
    expect(() => createHonorDraft({ name: 'X', category: 'unknown' })).toThrow();
  });
  it('keeps relief and frame independent for all three metals', () => {
    const variant = createReliefVariant({
      honorId: 'honor-id', name: 'Carved wood', material: 'wood',
      imageAssetId: 'sir_robin_wood'
    });
    expect(variant.status).toBe('draft');
    for (const metal of BADGE_METALS) {
      const composition = resolveBadgeComposition({ metal, variant });
      expect(composition.frameAssetId).toContain(metal);
      expect(composition.reliefAssetId).toBe('sir_robin_wood');
      expect(composition.allowOverhang).toBe(true);
      expect(composition.mountingShape).toBe('circle');
    }
  });
  it('does not expose drafts to players', () => {
    expect(playerVisibleHonors([{status:'draft'}, {status:'active'}, {status:'archived'}])).toHaveLength(1);
  });
});
