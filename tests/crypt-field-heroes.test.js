import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { fieldHeroId, fieldHeroSvg } from '../features/crypt/hero-field.js';
import { heroPlacement } from '../features/crypt/hero-class.js';

const astrid = { _dbId: 'character-01', identity: { namn: 'Astrid Eldhjärta', langd: '172 cm' } };
const classic = '<circle class="combat-token"/>';
const defeated = classic + '<text>☠</text>';
const cell = { x: 62, y: 91 };
const geometry = { size: 28, pixelsPerMeter: 32 };
const actor = { source_id: astrid._dbId, source_type: 'character', name_snapshot: 'Astrid Eldhjärta' };
const url = '/storage/v1/object/public/alea-hermes-public/hermes/system-asset/arcane-hero-class-astrid/approved.webp';

async function map(withAsset) {
  const registry = withAsset ? { 'arcane-hero-class-astrid': { src: url } } : {};
  const ctx = {
    aleaHeroClassField: { fieldHeroId, fieldHeroSvg },
    aleaCombatPaperDollResolver: { assetsByKey: x => x, resolve: () => ({ mode: 'classic' }) },
    aleaArcanePaperDollAssets: { load: async () => registry },
    SUPABASE_URL: 'https://example.test', dbJson: async () => [],
    Image: class { set src(_) { this.onload(); } },
    combatFootprintShape: () => 'single',
    chars: [astrid],
  };
  runInNewContext(readFileSync(new URL('../features/combat/paper-doll-map.js', import.meta.url), 'utf8'), ctx);
  await ctx.aleaCombatPaperDollMap.loadMapTokens();
  return ctx.aleaCombatPaperDollMap;
}

describe('Hero Class on linked campaign maps and the legacy SVG battlefield', () => {
  it('reuses actual height and foot anchor on both maps, and retains click geometry under the sprite', async () => {
    const adapter = await map(true), pose = heroPlacement('astrid', { heightCm: 172, pixelsPerMeter: 32 });
    const expected = adapter.renderHeroMapToken(astrid, 32, true);
    expect(expected).toContain('href="' + url + '"');
    expect(expected).toContain('y="' + (-pose.anchor.y * pose.height) + '"');
    expect(expected).toContain('<polygon');
    expect(expected).not.toMatch(/base|preview\/crypt-heroes/);
    const svg = adapter.renderBattleToken(classic, actor, cell, geometry, ' active-turn', true);
    expect(svg).toContain(expected);
    expect(svg).toContain('<g class="combat-paper-doll-classic">' + classic);
    expect(svg).toContain('translate(62 91)');
    expect(adapter.renderHeroMapToken(astrid, 32)).not.toContain('<polygon');
  });

  it('requires opt-in and linked scale, isolates generic actors and preserves the defeated skull', async () => {
    const adapter = await map(true);
    expect(adapter.renderBattleToken(classic, actor, cell, geometry, '')).toBe(classic);
    expect(adapter.renderBattleToken(classic, actor, cell, { size: 28 }, '', true)).toBe(classic);
    expect(adapter.renderBattleToken(classic, { source_id: 'other', source_type: 'npc', name_snapshot: 'Astrid Eldhjärta' }, cell, geometry, '', true)).toBe(classic);
    expect(adapter.renderBattleToken(classic, { ...actor, source_id: 'other', name_snapshot: 'Astrid den andra' }, cell, geometry, '', true)).toBe(classic);
    expect(adapter.renderBattleToken(defeated, { ...actor, status: 'dead' }, cell, geometry, '', true)).toBe(defeated);
  });

  it('uses a floor marker and campaign portrait fallback until publication; never requests pilot files', async () => {
    const adapter = await map(false);
    const svg = adapter.renderBattleToken(classic, actor, cell, geometry, '', true);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('>A</text>');
    expect(svg).not.toMatch(/<image|preview\/crypt-heroes/);
    expect(adapter.renderHeroMapToken(astrid, 32)).toBe('');
    expect(fieldHeroId({ name: 'Evalin Hugger' })).toBe('evalin');
    expect(fieldHeroId({ name: 'Astrid' })).toBeUndefined();
  });
});
