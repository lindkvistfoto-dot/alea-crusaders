/* v0.35.113 – the six approved bronze navigational motifs.
 * Six 48x48 frames in each compact AVIF strip. Sprite order:
 * Targans Gille, Värdshus, Akademi, Material, Rollfigurer, Strid.
 * The uploaded four dark/light pairs are preserved. For the two only supplied
 * as illuminated motifs we use a reduced-glow version for the inactive frame.
 * Existing buttons own navigation and accessible names; artwork is decorative.
 */
(function () {
  'use strict';
  const definitions = [
    ['shopNavBtn', 'shopPage', 0],
    ['innNavBtn', 'innPage', 1],
    ['academyNavBtn', 'academyPage', 2],
    ['materialNavBtn', 'legolasPanel', 3],
    ['landingCharactersNavBtn', 'home', 4],
    ['combatNavBtn', 'combatPage', 5]
  ];
  const nav = document.querySelector('.alea-app-header .alea-toolstrip');
  if (!nav) return;

  // Rollfigurer belongs with the other illustrated destinations.
  // Reuse the original button, handler, id and aria label.
  const characters = document.getElementById('landingCharactersNavBtn');
  if (characters && characters.parentElement !== nav) {
    characters.setAttribute('aria-label', 'Öppna rollfigurer');
    characters.setAttribute('title', 'Rollfigurer');
    const combat = document.getElementById('combatNavBtn');
    if (combat) nav.insertBefore(characters, combat);
    else nav.appendChild(characters);
  }
  const pages = new Map();
  function visible(id) {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  }
  function isActive(id) {
    switch (id) {
      case 'shopNavBtn': return visible('shopPage');
      case 'innNavBtn': return visible('innPage');
      case 'academyNavBtn': return visible('academyPage');
      case 'materialNavBtn': return visible('legolasPanel') || visible('legolasViewer');
      case 'landingCharactersNavBtn': return visible('home') || visible('view');
      case 'combatNavBtn': return visible('combatPage');
      default: return false;
    }
  }
  function refresh() {
    definitions.forEach(([id,,index]) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.classList.add('alea-bronze-nav');
      button.style.setProperty('--alea-nav-index', String(index));
      button.style.setProperty('--alea-nav-pos', (index * 20) + '%');
      const current = isActive(id) ? 'page' : 'false';
      if (button.getAttribute('aria-current') !== current) button.setAttribute('aria-current', current);
    });
    // The mobile adventure hub delegates to the original buttons. Its labels
    // are unchanged, but the three matching pictures use the same frames.
    const menu = document.getElementById('mobileHubMenu');
    if (menu) {
      [['shopNavBtn',0],['innNavBtn',1],['academyNavBtn',2]].forEach(([id,index]) => {
        const item = menu.querySelector('button[data-mobile-target="'+id+'"]');
        if (!item) return;
        item.style.setProperty('--alea-nav-pos',index*20+'%');
        item.dataset.navActive = String(isActive(id));
      });
    }
  }

  const observer = new MutationObserver(() => {
    observeNewPages();
    refresh();
  });
  function observeNewPages() {
    const ids = ['shopPage','innPage','academyPage','legolasPanel','legolasViewer',
      'home','view','combatPage'];
    ids.forEach(id => {
      const element = document.getElementById(id);
      if (!element || pages.get(id) === element) return;
      pages.set(id, element);
      observer.observe(element, {attributes:true,attributeFilter:['class']});
    });
  }
  // Materialpanelen is mounted asynchronously by Legolas. Observe the small
  // navigation container and new top-level nodes, not the entire app DOM.
  observer.observe(nav, {childList:true});
  observer.observe(document.body, {childList:true});
  observeNewPages();
  refresh();
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // A navigation action can open a dialog in a microtask after the click.
  document.addEventListener('click', event => {
    if (event.target.closest?.('.alea-toolstrip,.landing-route-nav')) {
      queueMicrotask(refresh);
      requestAnimationFrame(refresh);
    }
  }, true);
})();
