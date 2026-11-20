// Portraits, field sprites and workshop previews use the same untrimmed image coordinates.
// The reference height runs from the skull to ground contact, excluding a feather crest or equipment.
const profiles = {
  astrid: {
    name: 'Astrid Eldhjärta', width: 1200, height: 1311, heightCm: 190,
    anchor: { x: .61, y: .903 }, crownY: .024,
    face: { x: .595, y: .119, width: .26 },
    assetUrl: new URL('../../preview/crypt-heroes/astrid.webp', import.meta.url).href,
    assetKey: 'arcane-hero-class-astrid',
    pose: 'Beredskap · svärd och sköld',
  },
  lyra: {
    name: 'Lyra Gråväv', width: 1086, height: 1448, heightCm: null,
    anchor: { x: .563, y: .961 }, crownY: .043,
    face: { x: .496, y: .170, width: .32 },
    assetUrl: new URL('../../preview/crypt-heroes/lyra.webp', import.meta.url).href,
    assetKey: 'arcane-hero-class-lyra',
    pose: 'Besvärjelse · mantel',
  },
  evalin: {
    name: 'Evalin Hugger från Caddo', width: 1086, height: 1448, heightCm: 120,
    anchor: { x: .477, y: .925 }, crownY: .243,
    face: { x: .472, y: .297, width: .40 },
    torchGrip: { x: .788, y: .633 }, torchFlame: { x: .875, y: .455 },
    assetUrl: new URL('../../preview/crypt-heroes/evalin.webp', import.meta.url).href,
    assetKey: 'arcane-hero-class-evalin',
    pose: 'Stående · fäste för fackla',
  },
};
export const HERO_PROFILES = Object.freeze(profiles);
export const REFERENCE_HEIGHT_CM = 180;
export const DEFAULT_HERO_FACTOR = 1.10;

export function readHeightCm(value) {
  const match = /^([0-9]+(?:[.,][0-9]+)?)\s*(cm|m)?$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const cm = Number(match[1].replace(',', '.')) * (match[2]?.toLowerCase() === 'm' ? 100 : 1);
  return Number.isFinite(cm) && cm > 0 ? cm : null;
}

// Coordinates are independent of texture encoding, floor-grid orientation and occupancy.
// An explicit null or empty character height uses the workshop reference, never overwrites the character.
export function heroPlacement(id, options = {}) {
  const profile = HERO_PROFILES[id];
  if (!profile) throw new RangeError('Okänd Hero Class-figur.');
  const { pixelsPerMeter = 32, heroFactor = DEFAULT_HERO_FACTOR } = options;
  if (!(Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0 && Number.isFinite(heroFactor) && heroFactor > 0)) {
    throw new RangeError('Figurens bildskala måste vara positiv.');
  }
  const cm = readHeightCm(options.heightCm === undefined ? profile.heightCm : options.heightCm);
  const bodyPixels = (cm ?? REFERENCE_HEIGHT_CM) * pixelsPerMeter * heroFactor / 100;
  const height = bodyPixels / (profile.anchor.y - profile.crownY);
  return {
    width: height * profile.width / profile.height, height, bodyPixels,
    anchor: profile.anchor, torchGrip: profile.torchGrip, torchFlame: profile.torchFlame,
    heightCm: cm ?? REFERENCE_HEIGHT_CM, usesReferenceHeight: cm === null,
  };
}

export function heroPortraitStyle(id) {
  const p = HERO_PROFILES[id];
  const { x, y, width } = p.face;
  const cropHeight = width * p.width / p.height;
  const left = (x - width / 2) / (1 - width);
  const top = (y - cropHeight / 2) / (1 - cropHeight);
  return {
    backgroundImage: 'url("' + p.assetUrl + '")',
    backgroundSize: (100 / width) + '% auto',
    backgroundPosition: (100 * left) + '% ' + (100 * top) + '%',
    backgroundRepeat: 'no-repeat',
  };
}

function smooth(from, to, value) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

// Coarse texture-space weights for a single quad mesh. The hands and foot contacts
// stay still; cloth lobes and shield can receive different phases of a very short displacement.
export function heroSwayWeights(id, u, v) {
  const body = (1 - smooth(.55, .83, v)) * (.58 + .42 * smooth(.04, .22, v));
  const mantle = id === 'lyra' ? smooth(.46, .76, v) * (1 - smooth(.88, .98, v)) : 0;
  const gear = id === 'astrid' ? smooth(.63, .80, u) * (1 - smooth(.62, .80, v)) : 0;
  return {
    body, gear,
    clothLeft: mantle * (1 - smooth(.24, .47, u)),
    clothRight: mantle * smooth(.56, .76, u),
  };
}
