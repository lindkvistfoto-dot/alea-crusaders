import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = await readFile(new URL('../features/honors/arcane-award-mount.js', import.meta.url), 'utf8');
const context = { module: { exports: {} } };
context.globalThis = context;
vm.runInNewContext(source, context);
const mount = context.module.exports;

describe('ARCANE award mounting profile', () => {
  it('keeps the approved simulator coordinates exact', () => {
    expect(JSON.parse(JSON.stringify(mount.POSITIONS))).toEqual({
      top: { x: 49.955223945159325, y: 7.3, s: 11.6, form: 'diamond' },
      right: { x: 91.6, y: 49.3, s: 9.8, form: 'diamond' },
      bottom: { x: 50.038125624977305, y: 94, s: 8.2, form: 'diamond' },
      left: { x: 8.245696851589353, y: 49.1, s: 9.4, form: 'diamond' },
      round: { x: 50.4, y: 84.99007316678366, s: 18.4, form: 'round' }
    });
  });

  it('resolves all 45 metal and accent combinations to the common asset family', () => {
    for (const metal of mount.METALS) {
      expect(mount.frameAssetKey(metal)).toBe(`arcane-award-frame-${metal}`);
      for (const accent of mount.ACCENTS) {
        expect(mount.gemAssetKey('diamond', accent)).toBe(`arcane-award-gem-diamond-${accent}`);
        expect(mount.gemAssetKey('round', accent)).toBe(`arcane-award-gem-round-${accent}`);
      }
    }
  });

  it('uses the simulator sizing model and the approved front to back order', () => {
    const makeNode = tag => ({
      tag, style: {}, dataset: {}, attributes: {}, classList: { add() {} },
      setAttribute(key, value) { this.attributes[key] = value; }
    });
    const art = {
      ownerDocument: { createElement: makeNode }, classList: { add() {} }, dataset: {}, children: [],
      replaceChildren() { this.children = []; }, append(node) { this.children.push(node); }
    };
    const asset = key => `/${key}.webp`;
    mount.mountAward(art, { metal: 'silver', accent: 'cyan', motifUrl: '/motif.png', resolveAsset: asset });
    expect(art.children.map(node => node.attributes['data-award-layer'])).toEqual([
      'motif', 'gem top', 'gem right', 'gem bottom', 'gem left', 'gem round', 'frame'
    ]);
    const top = art.children[1];
    expect(top.style.left).toBe('49.955223945159325%');
    expect(top.style.top).toBe('7.3%');
    expect(top.style.width).toBe('11.6%');
    expect(top.style.height).toBe('11.6%');
    expect(top.style.transform).toBe('translate(-50%, -50%)');
    expect(art.children.at(-1).src).toBe('/arcane-award-frame-silver.webp');
    expect(art.children[5].src).toBe('/arcane-award-gem-round-cyan.webp');
  });
});
