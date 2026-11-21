import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const scripts = ['object-library-geometry', 'object-library'].map(file =>
  readFileSync(new URL('../features/map/' + file + '.js', import.meta.url), 'utf8'));
const map = { id: 'crypt', width: 600, height: 400, pixels_per_meter: 100 };
const table = {
  id: 'table', x: '300', y: '200', rotation: '90',
  movement_blocking: true, light_blocking: false, shadow_casting: true,
  definition: {
    name: 'Träbord', image_asset_key: 'arcane-object-wooden-table',
    width_m: '1.8', depth_m: '.9', height_m: '.75',
    image_crop: { x: 25, y: 342, width: 1204, height: 573 },
  },
};
const registry = [{
  asset_key: table.definition.image_asset_key,
  asset_path: 'hermes/system-asset/arcane-object-wooden-table/' + 'a'.repeat(64) + '.webp',
}];

function setup(dbJson) {
  const window = {};
  const context = { window, document: { addEventListener() {} }, dbJson,
    SUPABASE_URL: 'https://assets.example', console,
    mapShapeTag: (area, fill) => '<path ' + fill + ' data-area="' + area.id + '"/>',
  };
  for (const script of scripts) runInNewContext(script, context);
  return window.aleaMapBattleObjects;
}

describe('map furniture in a linked battle', () => {
  it('loads published art and preserves the same rotated 1.8 × 0.9 metre footprint for drawing and movement', async () => {
    const dbJson = vi.fn(async path => path.startsWith('campaign_map_objects?') ? [table] : registry);
    const api = setup(dbJson);
    const [object] = await api.load(map);
    expect(object).toMatchObject({ x: 300, y: 200, widthPx: 180, depthPx: 90, rotation: 90,
      movement_blocking: true, light_blocking: false, shadow_casting: true });
    expect(object.footprint).toEqual([
      { x: 345, y: 110 }, { x: 345, y: 290 }, { x: 255, y: 290 }, { x: 255, y: 110 },
    ]);
    const markup = api.render([object]);
    expect(markup).toContain('translate(300 200) rotate(90)');
    expect(markup).toContain('x="-90" y="-45" width="180" height="90"');
    expect(markup).toContain('viewBox="25 342 1204 573"');
    expect(markup).toContain('/storage/v1/object/public/alea-hermes-public/' + registry[0].asset_path);
    expect(dbJson.mock.calls[0][0]).toContain('map_id=eq.crypt');
    expect(dbJson.mock.calls.every(call => call.length === 1)).toBe(true);
  });

  it('reloads placements under each viewer and clips unexplored overlaps above the explored part', async () => {
    let gm = true;
    const db = vi.fn(async path => path.startsWith('campaign_map_objects?') ? (gm ? [table] : []) : registry);
    const api = setup(db);
    await api.load(map);
    gm = false;
    expect(await api.load(map)).toEqual([]);
    expect(db).toHaveBeenCalledTimes(3);
    const mask = api.discoveryMask([
      { id: 'overlap', status: 'unknown' }, { id: 'hall', status: 'explored' },
      { id: 'cellar', status: 'unexplored' },
    ], map, 'battleObjects');
    expect(mask).toContain('width="600" height="400"');
    expect(mask).toMatch(/white" data-area="hall".*black" data-area="overlap".*black" data-area="cellar"/);
    expect(api.discoveryMask([], map, 'battleObjects')).not.toContain('white');
  });

  it('loads the fight edition directly, including its immutable art path', async () => {
    const db = vi.fn(async () => [{ ...table, asset_path: registry[0].asset_path }]);
    const api = setup(db);
    const [object] = await api.load(map, 'combat');
    expect(db).toHaveBeenCalledExactlyOnceWith('rpc/read_combat_map_objects',
      { method: 'POST', body: '{"p_combat_id":"combat"}' });
    expect(api.render([object])).toContain(registry[0].asset_path);
  });

  it('retains geometry if artwork is unavailable and surfaces missing rule data', async () => {
    const api = setup(async path => path.startsWith('campaign_map_objects?')
      ? [{ ...table, definition: { ...table.definition, name: '<Bord>' } }]
      : [{ ...registry[0], asset_path: '../other-bucket/image.svg' }]);
    const objects = await api.load(map);
    expect(objects[0].movement_blocking).toBe(true);
    expect(api.render(objects)).toContain('<title>&lt;Bord&gt;</title><rect');
    expect(api.render(objects)).not.toContain('<image');
    const unavailable = setup(async () => { throw new Error('PGRST205'); });
    await expect(unavailable.load(map)).rejects.toThrow(/databasmigrering/);
    await expect(unavailable.load({ ...map, pixels_per_meter: null })).rejects.toThrow(/Kalibrera/);
  });
});
