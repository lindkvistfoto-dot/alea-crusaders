(() => {
  let pending;

  function showFailure() {
    const mount = document.getElementById('arcaneHonorsMount');
    if (!mount) return;
    const notice = document.createElement('p');
    notice.className = 'honors-load-status';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'Kunde inte ladda Honors-administrationen. Försök igen; sidan har inte lämnat administrationen.';
    mount.replaceChildren(notice);
  }

  async function openHonorsAdmin() {
    if (window.openArcaneHonorsAdmin !== openHonorsAdmin) {
      return window.openArcaneHonorsAdmin();
    }

    document.getElementById('admin')?.querySelectorAll('.admin-detail').forEach(el => el.classList.add('hidden'));
    document.getElementById('adminOverview')?.classList.add('hidden');
    document.getElementById('adminHonors')?.classList.remove('hidden');
    const mount = document.getElementById('arcaneHonorsMount');
    if (mount) mount.textContent = 'Laddar Honors-registret…';

    try {
      pending ||= import('./honors-entry.js?v=20261107-hermes-alea-recovery-1');
      await pending;
      if (window.openArcaneHonorsAdmin === openHonorsAdmin) {
        throw new Error('HONORS_ADMIN_ENTRYPOINT_NOT_REGISTERED');
      }
      return window.openArcaneHonorsAdmin();
    } catch (error) {
      pending = null;
      console.error('Honors administration failed to load', error);
      showFailure();
    }
  }

  window.openArcaneHonorsAdmin = openHonorsAdmin;
})();
