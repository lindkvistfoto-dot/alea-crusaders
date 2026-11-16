// ARCANE AWARD SYSTEM V2.1 frames published through HERMES CORE.
// This classic-script module is shared by the admin and Trophy Room renderers.
(function (root) {
const AWARD_FRAME_KEYS = Object.freeze({
  bronze: 'arcane-award-frame-bronze',
  silver: 'arcane-award-frame-silver',
  gold: 'arcane-award-frame-gold'
});

const AWARD_TIERS = Object.freeze(['bronze', 'silver', 'gold']);

function awardFrameKey(tier) {
  return AWARD_FRAME_KEYS[tier] || AWARD_FRAME_KEYS.bronze;
}

function awardRenderLayers(imageAssetId, tier) {
  return Object.freeze({
    imageAssetId: imageAssetId || null,
    frameAssetKey: awardFrameKey(tier),
    tier: AWARD_TIERS.includes(tier) ? tier : 'bronze'
  });
}
root.ArcaneAwardRenderer = Object.freeze({ AWARD_FRAME_KEYS, AWARD_TIERS, awardFrameKey, awardRenderLayers });
})(typeof window !== 'undefined' ? window : globalThis);
