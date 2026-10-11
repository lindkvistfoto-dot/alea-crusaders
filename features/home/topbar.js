/* Responsive header: retain full desktop shortcuts; compact four mobile destinations into an adventure menu. */
(function () {
  'use strict';
  const header = document.querySelector('.alea-app-header');
  if (!header) return;
  const mobile = window.matchMedia('(max-width: 700px)');
  const hubButton = document.getElementById('mobileHubNavBtn');
  const hubMenu = document.getElementById('mobileHubMenu');
  let collapsed = false;

  function closeMobileHub(restoreFocus = false) {
    if (!hubButton || !hubMenu) return;
    const wasOpen = !hubMenu.classList.contains('hidden');
    hubMenu.classList.add('hidden');
    hubButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus && wasOpen) hubButton.focus();
  }

  function syncMobileHeader() {
    if (!mobile.matches) {
      collapsed = false;
      closeMobileHub();
    } else {
      const position = window.scrollY || document.documentElement.scrollTop || 0;
      if (position > 140) collapsed = true;
      else if (position < 32) collapsed = false;
    }
    header.classList.toggle('alea-header-collapsed', collapsed);
  }

  if (hubButton && hubMenu) {
    hubButton.addEventListener('click', () => {
      if (!mobile.matches) return;
      if (!hubMenu.classList.contains('hidden')) {
        closeMobileHub();
        return;
      }
      hubMenu.classList.remove('hidden');
      hubButton.setAttribute('aria-expanded', 'true');
      hubMenu.querySelector('button')?.focus({ preventScroll: true });
    });

    // Invoke the original navigation buttons so existing shop, inn and journal logic stays intact.
    hubMenu.addEventListener('click', event => {
      const item = event.target.closest('button[data-mobile-target]');
      if (!item || !hubMenu.contains(item)) return;
      const targetId = item.dataset.mobileTarget;
      closeMobileHub();
      const original = document.getElementById(targetId);
      if (original) original.click();
      else if (targetId === 'journalNavBtn') window.aleaJournalOpen?.();
    });

    document.addEventListener('pointerdown', event => {
      if (hubMenu.classList.contains('hidden')) return;
      if (hubMenu.contains(event.target) || hubButton.contains(event.target)) return;
      closeMobileHub();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || hubMenu.classList.contains('hidden')) return;
      event.preventDefault();
      closeMobileHub(true);
    });
    window.addEventListener('scroll', () => closeMobileHub(), { passive: true });
  }

  // Hysteresis prevents flicker when the sticky mobile header changes height.
  window.addEventListener('scroll', syncMobileHeader, { passive: true });
  window.addEventListener('resize', syncMobileHeader, { passive: true });
  window.addEventListener('pageshow', syncMobileHeader);
  syncMobileHeader();
})();
