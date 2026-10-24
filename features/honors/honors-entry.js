import { renderHonorsAdmin } from './honors-admin.js';
let instance;
window.openArcaneHonorsAdmin = () => {
  const admin=document.getElementById('admin');
  const panel=document.getElementById('adminHonors');
  const mount=document.getElementById('arcaneHonorsMount');
  if (!admin || !panel || !mount) return;
  admin.querySelectorAll('.admin-detail').forEach(el=>el.classList.add('hidden'));
  document.getElementById('adminOverview')?.classList.add('hidden');
  panel.classList.remove('hidden');
  const title=document.getElementById('adminPageTitle');
  if(title) title.textContent='ARCANE HONORS';
  const subtitle=document.getElementById('adminPageSubtitle');
  if(subtitle) subtitle.textContent='Medaljer, utmärkelser och mottagare';
  document.getElementById('adminOverviewBtn')?.classList.remove('hidden');
  instance?.destroy();
  instance=renderHonorsAdmin(mount);
};
