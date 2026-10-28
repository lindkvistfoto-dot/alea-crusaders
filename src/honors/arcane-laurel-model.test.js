import { describe, expect, it } from 'vitest';
import {
  createHonorDraft, createReliefVariant, resolveBadgeComposition,
  canPublishReliefVariant, playerVisibleHonors, BADGE_METALS, BADGE_FRAME_ASSET_KEYS
} from './arcane-laurel-model.js';

describe('ARCANE LAUREL BADGE model', () => {
  it('creates category-correct hidden manual drafts by default', () => {
    expect(createHonorDraft({ name: ' Sir Robin Award ' })).toMatchObject({
      name: 'Sir Robin Award', category:'badge', status:'draft', grant_mode:'manual', type:'honor'
    });
    expect(createHonorDraft({name:'Campaign medal',category:'medal'}).type).toBe('adventure');
  });
  it('rejects invalid category and empty name', () => {
    expect(() => createHonorDraft({ name: ' ' })).toThrow();
    expect(() => createHonorDraft({ name: 'X', category: 'unknown' })).toThrow();
  });
  it('keeps relief and frame independent for all three metals and allows overhang', () => {
    const variant = createReliefVariant({
      honorId: 'honor-id', name: 'Carved wood', material: 'wood', imageAssetId: 'sir-robin-wood'
    });
    expect(variant.status).toBe('draft');
    for (const metal of BADGE_METALS) {
      const composition = resolveBadgeComposition({ metal, variant });
      expect(composition.frameAssetId).toBe(BADGE_FRAME_ASSET_KEYS[metal]);
      expect(composition.reliefAssetId).toBe('sir-robin-wood');
      expect(composition.allowOverhang).toBe(true);
      expect(composition.mountingShape).toBe('circle');
    }
  });
  it('keeps an image-less concept as a draft but cannot publish it', () => {
    const variant=createReliefVariant({honorId:'h1',name:'Enamel',material:'enamel'});
    expect(variant.image_asset_id).toBeNull();
    expect(canPublishReliefVariant(variant,[])).toBe(false);
  });
  it('requires a verified published alpha asset to publish a relief', () => {
    const variant=createReliefVariant({honorId:'h1',name:'Metal',material:'metal',imageAssetId:'relief-metal'});
    expect(canPublishReliefVariant(variant,[{asset_key:'relief-metal',asset_path:null,alpha_preserved:true}])).toBe(false);
    expect(canPublishReliefVariant(variant,[{asset_key:'relief-metal',asset_path:'hermes/system-asset/relief-metal/x.webp',alpha_preserved:true}])).toBe(true);
    expect(canPublishReliefVariant(variant,[{asset_key:'relief-metal',asset_path:'x',alpha_preserved:false}])).toBe(false);
  });
  it('does not expose drafts to players', () => {
    expect(playerVisibleHonors([{status:'draft'}, {status:'active'}, {status:'archived'}])).toHaveLength(1);
  });
});
