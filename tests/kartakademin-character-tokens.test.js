import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const source = name => readFileSync(new URL('../features/combat/' + name, import.meta.url), 'utf8');

async function paperDoll(highAngle = true) {
  const posePath = 'hermes/battle-pose/' + 'a'.repeat(64) + '.webp';
  const context = {
    SUPABASE_URL: 'https://example.test',
    Image: class { set src(value) { this.onload(); } },
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
  return { render: context.aleaCombatPaperDollMap.renderMapToken, posePath };
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
