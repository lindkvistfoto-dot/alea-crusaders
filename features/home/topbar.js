/* Mobile header: collapse secondary navigation after scrolling, keeping six shortcuts reachable.
   Hysteresis prevents scroll flicker when the sticky header changes height. */
(function () {
  'use strict';
  const header = document.querySelector('.alea-app-header');
  if (!header) return;
  const mobile = window.matchMedia('(max-width: 700px)');
  let collapsed = false;
  function syncMobileHeader() {
    if (!mobile.matches) {
      collapsed = false;
    } else {
      const position = window.scrollY || document.documentElement.scrollTop || 0;
      if (position > 140) collapsed = true;
      else if (position < 32) collapsed = false;
    }
    header.classList.toggle('alea-header-collapsed', collapsed);
  }
  window.addEventListener('scroll', syncMobileHeader, { passive: true });
  window.addEventListener('resize', syncMobileHeader, { passive: true });
  window.addEventListener('pageshow', syncMobileHeader);
  syncMobileHeader();
})();
