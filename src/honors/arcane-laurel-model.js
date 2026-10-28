/**
 * ARCANE LAUREL BADGE – relief catalogue domain model.
 * Frames are shared HERMES assets; reliefs remain independent transparent overlays.
 */
export const HONOR_CATEGORIES = Object.freeze(['medal', 'award', 'badge']);
export const HONOR_STATUSES = Object.freeze(['draft', 'active', 'inactive']);
export const BADGE_METALS = Object.freeze(['bronze', 'silver', 'gold']);
export const RELIEF_MATERIALS = Object.freeze(['enamel', 'metal', 'wood', 'stone', 'other']);
export const BADGE_FRAME_ASSET_PREFIX = 'arcane-badge-frame-';
export const BADGE_FRAME_ASSET_KEYS = Object.freeze({});
export const LAUREL_FRAME_ASSET_KEYS = Object.freeze({
  bronze: 'arcane-laurel-badge-bronze',
  silver: 'arcane-laurel-badge-silver',
  gold: 'arcane-laurel-badge-gold',
});
export function createHonorDraft({ name, category = 'badge', description = '' }) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Honor name is required');
  if (!HONOR_CATEGORIES.includes(category)) throw new Error('Invalid honor category');
  return {
    name: name.trim(), category, type: category === 'medal' ? 'adventure' : 'honor',
    description: String(description).trim(), tier_criteria: {},
    status: 'draft', grant_mode: 'manual',
  };
}
export function createReliefVariant({ name, material, imageAssetId = null, honorId }) {
  if (!name?.trim() || !honorId) throw new Error('Relief variant requires name and honorId');
  if (!RELIEF_MATERIALS.includes(material)) throw new Error('Invalid relief material');
  return {
    honor_id: honorId, name: name.trim(), material,
    image_asset_id: imageAssetId?.trim() || null, status: 'draft', allow_overhang: true,
  };
}
export function canPublishReliefVariant(variant, imageAssets = []) {
  if (!variant?.image_asset_id) return false;
  return imageAssets.some(asset => asset?.asset_key === variant.image_asset_id &&
    typeof asset.asset_path === 'string' && (asset.alpha_preserved === true || variant.allow_overhang === false));
}
export function resolveBadgeComposition({ metal, variant, frameAssets = {} }) {
  if (!BADGE_METALS.includes(metal)) throw new Error('Invalid badge tier');
  if (!variant) throw new Error('Missing relief variant');
  const frameAssetId = variant.frame_asset_id || frameAssets[variant.id] || null;
  return {
    frameAssetId, reliefAssetId: variant.image_asset_id || null,
    stars: BADGE_METALS.indexOf(metal) + 1,
    allowOverhang: variant.allow_overhang !== false, mountingShape: 'square',
  };
}
export function playerVisibleHonors(honors) {
  return honors.filter(honor => honor.status === 'active');
}
