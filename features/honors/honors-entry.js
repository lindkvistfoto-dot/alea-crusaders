import { renderHonorsAdmin } from './honors-admin.js';
import { createHonorsApi } from './honors-api.js';
let instance;
window.openArcaneHonorsAdmin = async () => {
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
  mount.textContent='Laddar utmärkelser…';
  try {
    const context=window.aleaHonorsContext?.();
    if(!context?.userId || !context?.campaignId || !context?.isAdmin) throw Error('Administratör och aktiv kampanj krävs');
    const api=createHonorsApi(context.dbJson,context);
    const data=await api.load();
    instance=renderHonorsAdmin(mount,{...data,
      onSave:async definition=>{await api.save(definition);await window.openArcaneHonorsAdmin();},
      onGrant:async grant=>{await api.grant(grant);await window.openArcaneHonorsAdmin();}
    });
  }catch(error){
    mount.textContent='Kunde inte läsa ARCANE HONORS: '+String(error?.message||error);
  }
};
