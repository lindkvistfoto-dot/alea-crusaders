/* Shared renderer for award production and the Award Workshop preview. */
(function (root) {
  'use strict';

  const ACCENTS = Object.freeze([
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'turquoise',
    'cyan', 'black', 'white', 'brown', 'light-gray', 'dark-gray', 'amber'
  ]);
  const POSITIONS = Object.freeze({
    top: Object.freeze({ x: 49.955223945159325, y: 7.3, s: 11.6, form: 'diamond' }),
    right: Object.freeze({ x: 91.6, y: 49.3, s: 9.8, form: 'diamond' }),
    bottom: Object.freeze({ x: 50.038125624977305, y: 94.0, s: 8.2, form: 'diamond' }),
    left: Object.freeze({ x: 8.245696851589353, y: 49.1, s: 9.4, form: 'diamond' }),
    round: Object.freeze({ x: 50.4, y: 84.99007316678366, s: 18.4, form: 'round' })
  });
  const METALS = Object.freeze(['bronze', 'silver', 'gold']);
  const validAccent = value => ACCENTS.includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'red';
  const validMetal = value => METALS.includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'bronze';
  const frameAssetKey = metal => `arcane-award-frame-${validMetal(metal)}`;
  const gemAssetKey = (form, accent) => `arcane-award-gem-${form === 'round' ? 'round' : 'diamond'}-${validAccent(accent)}`;
  const imageUrl = (resolveAsset, key) => typeof resolveAsset === 'function' ? resolveAsset(key) : '';

  function mountAward(art, options = {}) {
    if (!art || !art.ownerDocument) throw new TypeError('Award mount needs an element');
    const doc = art.ownerDocument;
    const metal = validMetal(options.metal);
    const accent = validAccent(options.accent);
    const positions = options.positions || POSITIONS;
    const resolveAsset = options.resolveAsset;
    const motifUrl = options.motifUrl || '';
    const frameUrl = options.frameUrl || imageUrl(resolveAsset, frameAssetKey(metal));
    const gemUrls = options.gemUrls || {};
    const layers = [];
    art.classList.add('arcane-award-mount');
    art.replaceChildren();

    function addImage(role, src, zIndex, alt = '') {
      if (!src) return null;
      const node = doc.createElement('img');
      node.className = `arcane-award-layer arcane-award-${role}`;
      node.src = src;
      node.alt = alt;
      node.draggable = false;
      node.style.zIndex = String(zIndex);
      node.setAttribute('data-award-layer', role);
      art.append(node);
      layers.push(node);
      return node;
    }

    if (motifUrl) addImage('motif', motifUrl, 1, options.motifAlt || '');
    else if (options.motifLabel) {
      const label = doc.createElement('span');
      label.className = 'arcane-award-layer arcane-award-motif-label';
      label.textContent = options.motifLabel;
      label.style.zIndex = '1';
      label.setAttribute('data-award-layer', 'motif');
      art.append(label);
      layers.push(label);
    }
    for (const position of ['top', 'right', 'bottom', 'left']) {
      addGem(position, 2);
    }
    addGem('round', 3);
    addImage('frame', frameUrl, 4, '');
    art.dataset.awardMetal = metal;
    art.dataset.awardAccent = accent;
    return layers;

    function addGem(position, zIndex) {
      const p = positions[position];
      const form = p.form || (position === 'round' ? 'round' : 'diamond');
      const key = gemAssetKey(form, accent);
      const src = gemUrls[key] || imageUrl(resolveAsset, key);
      const node = addImage(`gem ${position}`, src, zIndex, '');
      if (!node) return;
      node.className += ` arcane-award-gem arcane-award-gem-${position}`;
      // V2 pilot model: x/y are the centre; s is width and height as % of frame width.
      node.style.left = `${p.x}%`;
      node.style.top = `${p.y}%`;
      node.style.width = `${p.s}%`;
      node.style.height = `${p.s}%`;
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.transform = 'translate(-50%, -50%)';
      node.dataset.gemPosition = position;
      node.dataset.gemAssetKey = key;
    }
  }

  const api = Object.freeze({ ACCENTS, POSITIONS, METALS, validAccent, validMetal, frameAssetKey, gemAssetKey, mountAward });
  root.ArcaneAwardMount = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
