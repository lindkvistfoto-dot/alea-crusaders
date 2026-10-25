/**
 * ARCANE LAUREL BADGE – relief catalogue domain model.
 * No database writes or player-facing publication occur in this module.
 * A variant is an image asset; the bronze/silver/gold frame is independent.
 */
export const HONOR_CATEGORIES = Object.freeze(['medal', 'award', 'badge']);
export const HONOR_STATUSES = Object.freeze(['draft', 'active', 'archived']);
export const BADGE_METALS = Object.freeze(['bronze', 'silver', 'gold']);
export const RELIEF_MATERIALS = Object.freeze(['enamel', 'metal', 'wood', 'stone', 'other']);

export const LAUREL_FRAME_ASSET_KEYS = Object.freeze({
  bronze: 'arcane_laurel_badge_bronze',
  silver: 'arcane_laurel_badge_silver',
  gold: 'arcane_laurel_badge_gold',
});

export function createHonorDraft({ name, category = 'badge', description = '' }) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Honor name is required');
  if (!HONOR_CATEGORIES.includes(category)) throw new Error('Invalid honor category');
  return {
    name: name.trim(),
    type: category,
    description: String(description).trim(),
    status: 'draft',
    grant_mode: 'manual',
  };
}

export function createReliefVariant({ name, material, imageAssetId, honorId }) {
  if (!name?.trim() || !honorId || !imageAssetId?.trim()) {
    throw new Error('Relief variant requires name, honorId and imageAssetId');
  }
  if (!RELIEF_MATERIALS.includes(material)) throw new Error('Invalid relief material');
  return {
    honor_id: honorId,
    name: name.trim(),
    material,
    image_asset_id: imageAssetId.trim(),
    status: 'draft',
    // Rendering may overflow the mounting circle. Never clip at the circle.
    allow_overhang: true,
  };
}

export function resolveBadgeComposition({ metal, variant, frameAssets = LAUREL_FRAME_ASSET_KEYS }) {
  if (!BADGE_METALS.includes(metal)) throw new Error('Invalid badge metal');
  if (!variant?.image_asset_id) throw new Error('Missing relief image');
  return {
    frameAssetId: frameAssets[metal],
    reliefAssetId: variant.image_asset_id,
    allowOverhang: variant.allow_overhang !== false,
    // Image placement and scale will be calibrated against the approved master.
    mountingShape: 'circle',
  };
}

export function playerVisibleHonors(honors) {
  return honors.filter((honor) => honor.status === 'active');
}
