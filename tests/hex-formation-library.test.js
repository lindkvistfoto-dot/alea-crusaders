import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(
  readFileSync(new URL('../features/ui/arcane-geometry-engine.js', import.meta.url), 'utf8') + '\n' +
  readFileSync(new URL('../features/ui/arcane-hex-formation-library.js', import.meta.url), 'utf8'),
  context
);
const engine = context.aleaArcaneGeometryEngine;
const library = context.aleaHexFormationLibrary;
const appHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const geometryLabHtml = readFileSync(new URL('../geometry-lab.html', import.meta.url), 'utf8');
const positions = cells => cells.map(c => `${c.q},${c.r}`).sort().join(';');
const combatContext = {};
vm.runInNewContext(
  readFileSync(new URL('../features/ui/arcane-geometry-engine.js', import.meta.url), 'utf8') + '\n' +
  readFileSync(new URL('../features/ui/arcane-hex-formation-library.js', import.meta.url), 'utf8') + '\n' +
  readFileSync(new URL('../features/combat/footprint.js', import.meta.url), 'utf8') +
  '\nthis.footprints={offsets:COMBAT_FOOTPRINT_OFFSETS,cells:combatFootprintCells};',
  combatContext
);

describe('Universal hex formation library', () => {
  it('provides a useful, connected, duplicate-free catalog for every size from one to nine', () => {
    for (let count = 1; count <= 9; count++) {
      expect(library.byCount(count).length).toBeGreaterThan(0);
      for (const item of library.byCount(count)) {
        expect(item.cells).toHaveLength(count);
        expect(engine.validate(item.cells).valid).toBe(true);
        expect(item.contour).toHaveLength(6 * count - 2 * sharedPairs(item.cells));
      }
    }
    expect(new Set(library.catalog.map(item => item.canonical_key)).size).toBe(library.catalog.length);
  });

  it('keeps the occupied hexes correct through all six rotations and mirror transforms', () => {
    for (const item of library.catalog) {
      const zero = positions(library.orient(item, { steps: 0 }).cells);
      const six = positions(library.orient(item, { steps: 6 }).cells);
      expect(six).toBe(zero);
      for (let steps = 0; steps < 6; steps++) {
        for (const mirror of [false, true]) {
          const result = library.orient(item, { steps, mirror });
          expect(result.cells).toHaveLength(item.count);
          expect(engine.validate(result.cells).valid).toBe(true);
          expect(library.audit(item, { steps, mirror }).valid).toBe(true);
        }
      }
    }
  });

  it('stores stable IDs, axial centers, rotation anchors, contours and graphic profile references', () => {
    for (const item of library.catalog) {
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(item.directions).toEqual([0, 1, 2, 3, 4, 5]);
      expect(item.rotation_anchor).toEqual(item.cells[0]);
      expect(item.contour.length).toBeGreaterThan(0);
      expect(item.graphic_profile).toBe('arcane-bronze-ivory-base');
      expect(item.graphic_version).toBe('v1');
      expect(item.geometry_status).toBe('verified-prototype');
      expect(item.graphic_status).toBe('preview-only-not-published');
    }
  });

  it('sources combat footprints from the shared catalog without changing existing cell sets', () => {
    const expected = {
      single: [[0,0]], line2: [[0,0],[1,0]], triangle3: [[0,0],[1,0],[0,1]],
      line3: [[0,0],[1,0],[2,0]],
      giant7: [[0,0],[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]]
    };
    const catalogOffsets = combatContext.footprints.offsets;
    for (const [shape, cells] of Object.entries(expected)) {
      expect(positions(catalogOffsets[shape].map(([q,r]) => ({q,r})))).toBe(positions(cells.map(([q,r]) => ({q,r}))));
      for (let facing=0; facing<6; facing++) {
        const actor={q:0,r:0,state:{footprint:{shape,facing}}};
        expect(combatContext.footprints.cells(actor)).toHaveLength(cells.length);
      }
    }
    expect(appHtml.indexOf('arcane-geometry-engine.js')).toBeLessThan(appHtml.indexOf('features/combat/footprint.js'));
    expect(appHtml.indexOf('arcane-hex-formation-library.js')).toBeLessThan(appHtml.indexOf('features/combat/footprint.js'));
  });

  it('exports a full-size transparent PNG from the SVG viewBox', () => {
    expect(geometryLabHtml).toContain('const rasterScale=1536/Math.max(viewWidth,viewHeight)');
    expect(geometryLabHtml).toContain('const pixelWidth=Math.ceil(viewWidth*rasterScale),pixelHeight=Math.ceil(viewHeight*rasterScale)');
    expect(geometryLabHtml).toContain('canvas.width=pixelWidth;canvas.height=pixelHeight');
    expect(geometryLabHtml).toContain("canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG-exporten misslyckades')),'image/png')");
    expect(geometryLabHtml).toContain('for(const [x,y] of [[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]])');
    const viewWidth=4,viewHeight=5,rasterScale=1536/Math.max(viewWidth,viewHeight);
    expect(Math.ceil(viewHeight*rasterScale)).toBe(1536);
    expect(Math.ceil(viewWidth*rasterScale)).toBe(1229);
  });

  it('renders the reusable Arcane master in exact hex geometry with a single shared seam', () => {
    const one = engine.svg([1]);
    expect(one).toContain('data-components="marble,compass,bronze,sidewall,binding,lion"');
    expect(one).toContain('<feTurbulence');
    expect(one).toContain('data-outer-edge-count="6"');
    expect(one).toContain('data-internal-seam-count="0"');
    expect((one.match(/data-component="sidewall"/g) || [])).toHaveLength(6);
    expect((one.match(/data-component="outer-braid"/g) || [])).toHaveLength(6);
    expect((one.match(/data-component="ivory-marble"/g) || [])).toHaveLength(1);
    expect((one.match(/data-component="relief-compass"/g) || [])).toHaveLength(1);
    expect((one.match(/data-component="lion-relief"/g) || [])).toHaveLength(1);

    const two = engine.svg([2]);
    expect(two).toContain('data-outer-edge-count="10"');
    expect(two).toContain('data-internal-seam-count="1"');
    expect((two.match(/data-component="sidewall"/g) || [])).toHaveLength(10);
    expect((two.match(/data-component="single-internal-seam"/g) || [])).toHaveLength(1);
    expect((two.match(/data-component="outer-braid"/g) || [])).toHaveLength(10);
    expect((two.match(/data-component="relief-compass"/g) || [])).toHaveLength(2);
    expect((two.match(/data-component="lion-relief"/g) || [])).toHaveLength(2);
  });

});

function sharedPairs(cells) {
  const keys = new Set(cells.map(c => `${c.q},${c.r}`));
  return cells.reduce((sum, c) => sum + [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]]
    .filter(([q,r]) => keys.has(`${c.q+q},${c.r+r}`)).length, 0) / 2;
}
