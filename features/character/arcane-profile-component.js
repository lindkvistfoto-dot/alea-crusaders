/**
 * ARCANE Character Profile v8 — structural enhancement of EXISTING live fields.
 *
 * The legacy renderer owns data, validation, handlers and portrait uploads.
 * It creates the nine original .field elements in #identity. We MOVE those
 * exact nodes (never duplicate or re-render them) into one semantic, uniform
 * visual component. This deliberately breaks old "#identity > .field" and
 * nth-child CSS assumptions.
 */
(function () {
  'use strict';

  const FIELDS = Object.freeze([
    ['ras','icon-person'], ['yrke','icon-swords'],
    ['kon','icon-female'], ['alder','icon-hourglass'],
    ['langd','icon-height'], ['vikt','icon-weight'],
    ['combat','icon-swords'], ['stand','icon-heart']
  ]);
  const ART_BASE = './assets/arcane/system/v1/';

  function mount(host) {
    if (!host || host.querySelector(':scope > .arcane-profile-structure')) return false;
    const nodes = Array.from(host.children).filter(node => node.classList.contains('field'));
    if (nodes.length !== 9) return false;

    const byName = new Map();
    for (const node of nodes) {
      const key = Array.from(node.classList).find(name => name.startsWith('arcane-field-'));
      if (key) byName.set(key.slice('arcane-field-'.length),node);
    }
    if (!byName.has('name') || FIELDS.some(([key]) => !byName.has(key))) return false;

    const layout = document.createElement('div');
    layout.className = 'arcane-profile-structure';
    layout.setAttribute('data-arcane-layout', '8');
    layout.setAttribute('aria-label','Rollpersonens uppgifter');

    const plaque = document.createElement('div');
    plaque.className = 'arcane-profile-nameplate';
    plaque.appendChild(byName.get('name'));
    layout.appendChild(plaque);

    for (const [key,icon] of FIELDS) {
      const card = document.createElement('div');
      card.className = 'arcane-profile-card arcane-profile-card--'+key;
      card.dataset.field = key;

      const iconSlot = document.createElement('div');
      iconSlot.className = 'arcane-profile-icon-slot';
      iconSlot.setAttribute('aria-hidden','true');
      const artwork = document.createElement('img');
      artwork.className = 'arcane-profile-field-icon';
      artwork.alt = '';
      artwork.decoding = 'async';
      artwork.src = ART_BASE + icon + '.avif';
      iconSlot.appendChild(artwork);

      const divider = document.createElement('span');
      divider.className = 'arcane-profile-field-divider';
      divider.setAttribute('aria-hidden','true');

      const content = document.createElement('div');
      content.className = 'arcane-profile-card-content';
      content.appendChild(byName.get(key)); // preserves live input/event listeners

      card.append(iconSlot,divider,content);
      layout.appendChild(card);
    }
    host.replaceChildren(layout);
    host.classList.add('arcane-profile-mounted');
    return true;
  }

  function start() {
    const host = document.getElementById('identity');
    if (!host) return;
    // Legacy render() replaces #identity.innerHTML on each update.
    // Observe only direct children, and mount only when nine raw fields return.
    const observer = new MutationObserver(() => mount(host));
    observer.observe(host,{childList:true});
    mount(host);
    window.aleaArcaneProfile = Object.freeze({
      version:8,
      isMounted:() => !!host.querySelector(':scope > .arcane-profile-structure'),
      layout:() => host.querySelector(':scope > .arcane-profile-structure')
    });
  }
  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded',start,{once:true});
  } else start();
})();
