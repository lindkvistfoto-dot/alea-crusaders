import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

import { mapDistanceMeters } from '../features/map/kartakademin-geometry.js';

const source = name => readFileSync(new URL('../features/combat/' + name, import.meta.url), 'utf8');

async function paperDoll(highAngle = true) {
  const posePath = 'hermes/battle-pose/' + 'a'.repeat(64) + '.webp';
  const context = {
    SUPABASE_URL: 'https://example.test',
    Image: class {
      naturalWidth = 10;
      naturalHeight = 10;
      set src(value) { this.onload(); }
    },
    document: {
      createElement: () => ({ getContext: () => ({
        drawImage() {},
        getImageData() {
          const data = new Uint8Array(400);
          for (let y=1; y<=8; y++) for (let x=3; x<=6; x++) data[(y*10+x)*4+3]=255;
          return { data };
        },
      }) }),
    },
    dbJson: async path => path.startsWith('combatant_battle_poses?') ? [{
      combatant_type: 'character', combatant_id: 'evalin', pose_key: 'standard',
      image_path: posePath, mounting_profile: { cutout: { scale: 75 } },
    }] : [],
    aleaArcanePaperDollAssets: {
      load: async () => ({
        assets: [{ id: 'base', verified: true, src: '/base.png' }],
        systemArt: { [highAngle ? 'arcane-bronze-ivory-pointed-hex-high-angle' : 'arcane-paper-doll-hexagon-base']: 'base' },
      }),
    },
  };
  runInNewContext(source('paper-doll-resolver.js'), context);
  runInNewContext(source('paper-doll-map.js'), context);
  await context.aleaCombatPaperDollMap.loadMapTokens();
  return { render: context.aleaCombatPaperDollMap.renderMapToken, posePath, prepare: context.aleaCombatPaperDollMap.prepareMapToken };
}

it('skalar High Angle-basens bredd till 60 cm och bevarar den publicerade posens montering', async () => {
  const { render, posePath } = await paperDoll();
  for (const pixelsPerMeter of [40, 80]) {
    const svg = render('evalin', .6 * pixelsPerMeter);
    const scale = Number(svg.match(/scale\(([^)]+)\)/)[1]);
    const base = Number(svg.match(/href="\/base\.png"[^>]+width="([^"]+)"/)[1]);
    const pose = Number(svg.match(/width="([^"]+)" height="[^"]+" preserveAspectRatio="xMidYMid meet"\/><\/g>$/)[1]);
    expect(base * scale).toBeCloseTo(pixelsPerMeter === 40 ? 24 : 48);
    expect(pose).toBeCloseTo(66 * 75 / 65);
    expect(svg).toContain(posePath);
  }
});

it('ger ingen battlepose när godkänd High Angle-bas eller registrerad pose saknas', async () => {
  expect((await paperDoll(false)).render('evalin', 24)).toBe('');
  expect((await paperDoll()).render('missing', 24)).toBe('');
});

it('mäter 60 cm i Grottsystemets kartskala och placerar ett trimmat utsnitt i monteringen', async () => {
  const { render, prepare } = await paperDoll();
  await prepare('evalin');
  const svg = render('evalin', 43.44);
  const scale = Number(svg.match(/scale\(([^)]+)\)/)[1]);
  const widths = [...svg.matchAll(/<svg [^>]+width="([^"]+)"[^>]+viewBox="3 1 4 8"/g)];
  expect(widths).toHaveLength(2);
  expect(Number(widths[0][1]) * scale).toBeCloseTo(43.44);
  expect(mapDistanceMeters([0, 0], [43.44, 0], 1448 / 20)).toBeCloseTo(.60);
  expect(mapDistanceMeters([1, 4], [4, 8], 2.5)).toBe(2);
});
