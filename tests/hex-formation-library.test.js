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
const positions = cells => cells.map(c => `${c.q},${c.r}`).sort().join(';');

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
});

function sharedPairs(cells) {
  const keys = new Set(cells.map(c => `${c.q},${c.r}`));
  return cells.reduce((sum, c) => sum + [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]]
    .filter(([q,r]) => keys.has(`${c.q+q},${c.r+r}`)).length, 0) / 2;
}
