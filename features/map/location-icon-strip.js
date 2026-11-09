/* ALEA MAP: navigation only. Source data remains in the existing location panel. */
(() => {
  const definitions = [
    ['event', 'Händelser', 'ARCANE_MAP_ICON_EVENT', '.map-location-events'],
    ['people', 'Personer och fiender', 'ARCANE_MAP_ICON_NPC', '.map-location-people'],
    ['combat', 'Stridsscen', 'ARCANE_MAP_ICON_ENEMY', '.map-location-combat'],
    ['trap', 'Fällor', 'ARCANE_MAP_ICON_TRAP', '.map-location-traps'],
    ['hidden', 'Finna dolda ting', 'ARCANE_MAP_ICON_HIDDEN', '.map-location-hidden'],
    ['item', 'Föremål och skatter', 'ARCANE_MAP_ICON_ITEM', '.map-location-items'],
    ['image', 'Bilder', null, '#mapLocationImagesPanel']
  ];
  const root = document.getElementById('mapLocationIconStrip');
  const panel = document.getElementById('mapLocationPanel');
  if (!root || !panel) return;
  const mapPage = document.getElementById('mapPage');
  const icons = new Map();
  const project = document.querySelector('script[src*="supabase-environment"]');
  const imageBase = () => {
    // Existing public system assets; use the current environment's registry resolver when available.
    const host = location.hostname;
    return /(?:^|[.-])dev(?:[.-]|$)/i.test(host) ? 'wkiuyklzzroavclnsxna' : 'wbmosmkirsitkonejzpg';
  };
  const knownPaths = {
    ARCANE_MAP_ICON_EVENT: 'be9b7dd28dfee78745bad6a20831b637c151556365453f505f9a85ea59a3a040',
    ARCANE_MAP_ICON_NPC: '720e7f2951349ba8ffb6f6217a9482049807ea7bee696a86745b0cf41755474c',
    ARCANE_MAP_ICON_ENEMY: '8c99db5422aaf6f787f47be1c800308069dad695c6ce084ea109a742566321b4',
    ARCANE_MAP_ICON_TRAP: '612ec61aaa6dcf7bc225fa3d92cbd4ac052d74e84ecd918db73764da925e0929',
    ARCANE_MAP_ICON_HIDDEN: '3493bb1ef8e9d13c7be56a71f0a395f66e247dbc9c546c2451bacc95703a5591',
    ARCANE_MAP_ICON_ITEM: '6470526750e6ed483da8c76d8c58537b73b1fc1777e84ff403de9e9cb5941f62'
  };
  for (const [key, label, asset, selector] of definitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-location-icon';
    button.disabled = true;
    button.setAttribute('aria-label', label + ' – inget innehåll');
    button.title = label;
    const visual = document.createElement('span');
    visual.className = 'map-location-icon-art';
    if (asset) {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = 'https://' + imageBase() + '.supabase.co/storage/v1/object/public/alea-hermes-public/hermes/system-asset/' + asset + '/' + knownPaths[asset] + '.webp';
      visual.appendChild(img);
    } else {
      visual.textContent = '▧';
      visual.setAttribute('aria-hidden', 'true');
    }
    const name = document.createElement('span');
    name.className = 'map-location-icon-label';
    name.textContent = label;
    button.append(visual, name);
    button.addEventListener('click', () => {
      const target = panel.querySelector(selector);
      if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
    });
    root.appendChild(button);
    icons.set(key, {button,selector,label});
  }
  let scheduled = false;
  function refresh() {
    scheduled = false;
    const selected = !panel.classList.contains('empty') && !panel.querySelector('.map-location-loading');
    const gm = !!panel.querySelector('.map-location-gm');
    root.hidden = !gm;
    for (const [key,entry] of icons) {
      const section = selected ? panel.querySelector(entry.selector) : null;
      let populated = !!section;
      if (key === 'event') populated = !!section?.querySelector('.map-event-row');
      if (key === 'image') populated = !!section?.querySelector('img');
      // Other categories are inactive until their real linked sections are rendered.
      if (section && key !== 'event' && key !== 'image') populated = !section.querySelector('.map-location-empty');
      entry.button.disabled = !populated;
      entry.button.classList.toggle('is-available', populated);
      entry.button.setAttribute('aria-label', entry.label + (populated ? ' – gå till sektion' : ' – inget innehåll'));
    }
  }
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  });
  observer.observe(panel, {childList:true,subtree:true,characterData:true});
  refresh();
})();
