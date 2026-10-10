/* Alea Crusaders v0.35.62 — landing page and character navigation.
 * Existing home (#home) remains the character roster; this module owns #landing.
 * Gallery images can be extended by adding approved image assets to HOME_GALLERY.
 */
(function () {
  'use strict';
  const HOME_GALLERY = [
    { src: './assets/targans-gille-clean.jpg', title: 'Targans Gille', subtitle: 'En värld full av äventyr' },
    { src: './assets/innkeeper-hero.jpg', title: 'Värdshuset', subtitle: 'Där varje berättelse börjar' },
    { src: './features/character/assets/gandalf-hall.webp', title: 'Sagornas salar', subtitle: 'Vägen vidare väntar' }
  ];
  let currentIndex = -1;
  let characterMode = false;
  const el = id => document.getElementById(id);
  const landing = el('landing');
  const roster = el('home');
  if (!landing || !roster || typeof window.goHome !== 'function') return;
  const previousGoHome = window.goHome;

  function activeSections() {
    return Array.from(document.querySelectorAll('main > section[id]'));
  }
  function hideSection(section, hidden) {
    if (section && section.classList.contains('hidden') !== hidden) {
      section.classList.toggle('hidden', hidden);
    }
  }
  function setNavigation() {
    const home = el('landingHomeNavBtn');
    const characters = el('landingCharactersNavBtn');
    if (home) home.setAttribute('aria-current', !landing.classList.contains('hidden') ? 'page' : 'false');
    if (characters) characters.setAttribute('aria-current', !roster.classList.contains('hidden') ? 'page' : 'false');
  }
  function chooseImage(index) {
    if (!HOME_GALLERY.length) return;
    currentIndex = (index + HOME_GALLERY.length) % HOME_GALLERY.length;
    const item = HOME_GALLERY[currentIndex];
    const image = el('landingHeroImage');
    if (image) {
      image.onerror = function () {
        this.onerror = null;
        this.style.opacity = '0';
        el('landingHeroFallback')?.classList.remove('hidden');
      };
      image.onload = function () {
        this.style.opacity = '1';
        el('landingHeroFallback')?.classList.add('hidden');
      };
      image.src = item.src;
      image.alt = item.title;
    }
    if (el('landingImageTitle')) el('landingImageTitle').textContent = item.title;
    if (el('landingImageSubtitle')) el('landingImageSubtitle').textContent = item.subtitle;
    const indicators = el('landingGalleryDots');
    if (indicators) {
      indicators.replaceChildren(...HOME_GALLERY.map((entry, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'landing-gallery-dot' + (i === currentIndex ? ' active' : '');
        button.setAttribute('aria-label', 'Visa bild ' + (i + 1) + ': ' + entry.title);
        button.setAttribute('aria-pressed', String(i === currentIndex));
        button.addEventListener('click', () => chooseImage(i));
        return button;
      }));
    }
  }
  function pickRandomImage() {
    if (!HOME_GALLERY.length) return;
    let next = Math.floor(Math.random() * HOME_GALLERY.length);
    if (HOME_GALLERY.length > 1 && next === currentIndex) {
      next = (next + 1 + Math.floor(Math.random() * (HOME_GALLERY.length - 1))) % HOME_GALLERY.length;
    }
    chooseImage(next);
  }

  function hideOtherPages(keep) {
    activeSections().forEach(section => {
      if (section.id !== keep) hideSection(section, true);
    });
  }

  function openLanding() {
    previousGoHome();
    characterMode = false;
    hideOtherPages('landing');
    hideSection(landing, false);
    pickRandomImage();
    setNavigation();
    window.scrollTo?.(0, 0);
  }
  function openCharacters() {
    previousGoHome();
    characterMode = true;
    hideOtherPages('home');
    hideSection(roster, false);
    hideSection(landing, true);
    setNavigation();
    window.scrollTo?.(0, 0);
  }

  // Legacy buttons call goHome(), so it now means the genuine app landing page.
  window.goHome = openLanding;
  window.openLanding = openLanding;
  window.openCharacters = openCharacters;
  window.landingNextImage = function (delta) {
    chooseImage(currentIndex + (Number(delta) || 1));
  };
  window.landingRandomImage = pickRandomImage;

  // Legacy close-map/close-dice/close-admin paths still reveal #home directly.
  // Redirect those returns to the new landing page, without changing their state.
  let syncing = false;
  function reconcile() {
    if (syncing) return;
    syncing = true;
    try {
      const otherVisible = activeSections().some(section =>
        section.id !== 'home' && section.id !== 'landing' && !section.classList.contains('hidden')
      );
      if (otherVisible) {
        hideSection(landing, true);
        hideSection(roster, true);
      } else if (!roster.classList.contains('hidden')) {
        hideSection(landing, true);
        if (!characterMode) {
          hideSection(roster, true);
          hideSection(landing, false);
        }
      } else if (characterMode) {
        hideSection(landing, true);
      } else if (el('loginScreen')?.classList.contains('hidden')) {
        hideSection(landing, false);
      }
      setNavigation();
    } finally {
      syncing = false;
    }
  }
  const observer = new MutationObserver(() => reconcile());
  for (const page of activeSections()) {
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  }
  // A player opening a page from the header should never keep the hero over it.
  const header = document.querySelector('header');
  header?.addEventListener('click', event => {
    const btn = event.target.closest?.('button');
    if (btn && /^(shopNavBtn|alchemyNavBtn|innNavBtn|combatNavBtn|mapNavBtn|diceNavBtn|materialNavBtn|journalNavBtn)$/.test(btn.id)) {
      hideSection(landing, true);
    }
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconcile();
  });

  // Before authentication the app's existing login page remains authoritative.
  hideSection(roster, true);
  if (currentIndex === -1) pickRandomImage();
  reconcile();
})();