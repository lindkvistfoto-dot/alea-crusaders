import { HERO_PROFILES, heroPlacement } from './hero-class.js';

const nameIds = new Map(Object.entries(HERO_PROFILES).map(([id, profile]) => [profile.name.toLocaleLowerCase('sv'), id]));
nameIds.set('evalin hugger', 'evalin'); // Name in the original ALEA character record.

export function fieldHeroId(character) {
  const name = character?.identity?.namn || character?.name || '';
  return nameIds.get(String(name).normalize('NFC').trim().toLocaleLowerCase('sv'));
}

function attr(value) {
  return String(value).replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
}

// Field art is exclusively supplied by the verified system asset registry.
// An unpublished figure in combat gets a floor marker; Kartakademin can use its own portrait fallback.
export function fieldHeroSvg(character, pixelsPerMeter, assets, { active = false, markerFallback = false } = {}) {
  const id = fieldHeroId(character);
  if (!id || !Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return '';
  const profile = HERO_PROFILES[id], url = assets[profile.assetKey]?.src;
  if (!url && !markerFallback) return '';
  const { width, height, anchor } = heroPlacement(id, { pixelsPerMeter, heightCm: character?.identity?.langd });
  const radius = 1.5 * pixelsPerMeter / Math.sqrt(3);
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * 60 - 30) * Math.PI / 180;
    return (radius * Math.cos(angle)).toFixed(2) + ',' + (radius * Math.sin(angle)).toFixed(2);
  }).join(' ');
  const floor = active || !url
    ? '<polygon points="' + points + '" fill="#f6c86e" fill-opacity=".15" stroke="#f6c86e" stroke-width="1.5" vector-effect="non-scaling-stroke"/>'
    : '';
  const figure = url
    ? '<image href="' + attr(url) + '" x="' + (-anchor.x * width) + '" y="' + (-anchor.y * height) +
      '" width="' + width + '" height="' + height + '" preserveAspectRatio="none"/>'
    : '<text text-anchor="middle" dominant-baseline="central" fill="#fff2d4" font-weight="bold" font-size="' +
      (pixelsPerMeter * .52) + '">' + profile.name.charAt(0) + '</text>';
  return '<g class="combat-hero-floor" pointer-events="none" aria-hidden="true">' + floor + figure + '</g>';
}
