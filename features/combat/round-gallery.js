/* Alea Crusaders – authenticated, shared combat round art registry.
 * UI is SL/admin only; selection is saved with the combat instance.
 * Gallery images are private Supabase storage objects, not external URLs. */
(function(){
 'use strict';
 const BUCKET='alea-round-backgrounds';
 const BUILTIN='assets/combat/round-hero-battle-pilot.avif';
 const SAFE=/^round\/[0-9a-f-]{36}\.(?:webp|png|jpg|jpeg)$/;
 const MAX_SOURCE=12*1024*1024;
 let rows=null,chosenUrl='',chosenCombatId='',chosenKey='',request=0,adminBusy=false,adminRender=0;
 const cachedUrls=new Map(),failedImageUrls=new Set();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const canManage=()=>{try{return Boolean(activeUser()?.admin)}catch(_){return false}};
 const status=message=>{const el=document.getElementById('roundGalleryStatus');if(el)el.textContent=message||''};
 const pathPart=s=>String(s).split('/').map(encodeURIComponent).join('/');
 const validPath=p=>p===BUILTIN||SAFE.test(String(p||''));
 async function list(force=false){
  if(rows&&!force)return rows;
  const data=await dbJson('rule_combat_round_backgrounds?select=id,title,image_path,is_active,archived_at,created_at&order=created_at.asc');
  rows=(Array.isArray(data)?data:[]).filter(r=>validPath(r.image_path));
  return rows;
 }
 async function getActivePool(){
  try{return (await list(true)).filter(r=>r.is_active&&!r.archived_at)}
  catch(e){console.warn('Bakgrundsregistret kunde inte laddas; använder pilotbild.',e);return []}
 }
 async function pickRandomForCombat(){
  const pool=await getActivePool();
  return pool.length?pool[Math.floor(Math.random()*pool.length)].id:null;
 }
 async function resolveUrl(path){
  if(!validPath(path))return '';
  if(path===BUILTIN)return './'+BUILTIN;
  if(cachedUrls.has(path))return cachedUrls.get(path);
  const res=await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{method:'GET'});
  if(!res.ok)throw Error('Kunde inte läsa rundbild ('+res.status+').');
  const file=await res.blob();
  if(!file.type.startsWith('image/'))throw Error('Rundbilden saknar giltigt bildformat.');
  const url=URL.createObjectURL(file);
  cachedUrls.set(path,url);
  return url;
 }
 function apply(){
  // Keep the attack panel artwork synchronized with the current combatant's
  // personal background (or the stable library fallback for this encounter).
  document.querySelectorAll('#combatPage .combat-shell-live .combat-mini-attack').forEach(el=>{
   if(chosenUrl)el.style.setProperty('--alea-attack-illustration','url('+JSON.stringify(chosenUrl)+')');
   else el.style.removeProperty('--alea-attack-illustration');
  });
  document.querySelectorAll('.combat-turn-panel').forEach(el=>{
   if(chosenUrl)el.style.setProperty('--alea-round-illustration','url('+JSON.stringify(chosenUrl)+')');
   else el.style.removeProperty('--alea-round-illustration');
   const image=el.querySelector?.('.combat-round-artwork-image');
   if(!image)return;
   const fallback='./'+BUILTIN;
   let url=chosenUrl||fallback;
   if(failedImageUrls.has(url))url=fallback;
   if(failedImageUrls.has(url)){image.hidden=true;return}
   image.hidden=false;
   if(image.getAttribute('src')!==url)image.setAttribute('src',url);
  });
 }
 function fallbackImage(image){
  if(!image||!image.isConnected)return;
  const failed=image.getAttribute('src')||'';
  if(failed)failedImageUrls.add(failed);
  const builtin='./'+BUILTIN;
  if(failed!==builtin&&!failedImageUrls.has(builtin))image.setAttribute('src',builtin);
  else image.hidden=true;
 }
 async function activate(combat,actor=null){
  if(!combat?.id){
   ++request;chosenCombatId='';chosenKey='';chosenUrl='';apply();return
  }
  const state=actor?.state&&typeof actor.state==='object'?actor.state:{};
  const source=state.round_background_source==='character'?'character':'library';
  const actorPath=String(state.round_background_path||'');
  const actorLibraryId=String(state.round_background_id||'');
  const settingsId=String(combat.settings?.round_background_id||'');
  const key=[combat.id,actor?.id||'',source,actorPath,actorLibraryId,settingsId].join('|');
  if(key===chosenKey){apply();return}
  const token=++request;
  chosenKey=key;chosenCombatId=String(combat.id);
  chosenUrl='';apply();  // No flash of previous actor on a new turn.
  let path=BUILTIN;
  try{
   if(actorPath && ((source==='character') ||
      (source==='library'&&validPath(actorPath)))){
     path=actorPath;
   }else{
     const id=actorLibraryId||settingsId;
     if(id){
      const match=(await list()).find(row=>String(row.id)===id);
      if(match)path=match.image_path;
     }
   }
   let url='';
   if(source==='character'&&actorPath&&path===actorPath){
     url=await window.aleaCharacterRoundBackground?.resolveUrl?.(path)||'';
   }else{
     url=await resolveUrl(path);
   }
   if(token!==request||chosenKey!==key)return;
   chosenUrl=url||'./'+BUILTIN;
  }catch(e){
   console.warn('Rundbilden kunde inte hämtas; använder pilotbild.',e);
   if(token!==request||chosenKey!==key)return;
   chosenUrl='./'+BUILTIN;
  }
  apply();
 }
 async function imageBlob(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>MAX_SOURCE)
   throw Error('Välj en PNG, JPG eller WebP på högst 12 MB.');
  const source=URL.createObjectURL(file);
  try{
   const image=new Image();
   await new Promise((resolve,reject)=>{
    image.onload=resolve;image.onerror=()=>reject(Error('Kunde inte läsa bilden.'));
    image.src=source;
   });
   const scale=Math.min(1,1920/image.naturalWidth,1200/image.naturalHeight);
   const width=Math.max(1,Math.round(image.naturalWidth*scale));
   const height=Math.max(1,Math.round(image.naturalHeight*scale));
   const canvas=document.createElement('canvas');
   canvas.width=width;canvas.height=height;
   canvas.getContext('2d').drawImage(image,0,0,width,height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));
   if(!blob||blob.size>6*1024*1024)throw Error('Bilden kunde inte komprimeras till max 6 MB.');
   return blob;
  }finally{URL.revokeObjectURL(source)}
 }
 async function upload(file){
  if(!canManage()||adminBusy||!file)return;
  adminBusy=true;status('Bearbetar och laddar upp bild…');
  const id=crypto.randomUUID(),path='round/'+id+'.webp';
  let uploaded=false;
  try{
   const blob=await imageBlob(file);
   const res=await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.message||data.error||'Uppladdningen misslyckades.')}
   uploaded=true;
   const title=String(file.name||'Fantasystrid').replace(/\.[^.]+$/,'').trim().slice(0,120)||'Fantasystrid';
   await dbJson('rule_combat_round_backgrounds',{
    method:'POST',headers:{Prefer:'return=minimal'},
    body:JSON.stringify({id,title,image_path:path,is_active:true})
   });
   rows=null;await renderAdmin();
   status('✓ Bilden är sparad och ingår i slumpningen.');
  }catch(e){
   if(uploaded)await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{method:'DELETE'}).catch(()=>{});
   status('Fel: '+(e.message||e));console.error('Kunde inte spara rundbild',e);
  }finally{adminBusy=false}
 }
 async function update(id,patch){
  if(!canManage()||adminBusy)return;
  adminBusy=true;
  try{
   await dbJson('rule_combat_round_backgrounds?id=eq.'+encodeURIComponent(id),{
    method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)
   });
   rows=null;await renderAdmin();
  }catch(e){status('Fel: '+(e.message||e))}
  finally{adminBusy=false}
 }
 async function toggle(id){
  const row=(rows||[]).find(r=>r.id===id);if(row)await update(id,{is_active:!row.is_active})
 }
 async function rename(id){
  const row=(rows||[]).find(r=>r.id===id);if(!row||!canManage())return;
  const input=prompt('Namn på rundbilden',row.title);
  if(input===null)return;
  const title=input.trim();
  if(!title||title.length>120){status('Namnet måste vara 1–120 tecken.');return}
  await update(id,{title});
 }
 async function archive(id){
  const row=(rows||[]).find(r=>r.id===id);
  if(!row||!canManage()||!confirm('Ta bort "'+row.title+'" ur bildurvalet? Sparade strider behåller bilden.'))return;
  await update(id,{is_active:false,archived_at:new Date().toISOString()});
 }
 async function renderAdmin(){
  const host=document.getElementById('adminRoundGallery');
  if(!host||!canManage())return;
  const seq=++adminRender;
  host.textContent='Laddar bilder…';
  try{
   const all=(await list(true)).filter(r=>!r.archived_at);
   if(seq!==adminRender)return;
   host.innerHTML=all.length?'<div class="round-gallery-grid">'+all.map(r=>
    '<article class="round-gallery-card'+(r.is_active?'':' muted')+'">'+
    '<div class="round-gallery-preview"><img data-round-preview="'+esc(r.id)+'" alt="'+esc(r.title)+'" loading="lazy"></div>'+
    '<div class="round-gallery-copy"><b>'+esc(r.title)+'</b><small>'+(r.is_active?'Ingår i slumpningen':'Inaktiverad')+'</small></div>'+
    '<div class="round-gallery-actions">'+
    '<button class="smallbtn" type="button" onclick="aleaRoundGallery.toggle(\''+esc(r.id)+'\')">'+(r.is_active?'Inaktivera':'Aktivera')+'</button>'+
    '<button class="smallbtn" type="button" onclick="aleaRoundGallery.rename(\''+esc(r.id)+'\')">Byt namn</button>'+
    '<button class="deletebtn" type="button" aria-label="Ta bort bild" onclick="aleaRoundGallery.archive(\''+esc(r.id)+'\')">×</button>'+
    '</div></article>').join('')+'</div>':'<p class="muted">Inga bilder. Lägg till en för att börja slumpa bakgrunder.</p>';
   for(const row of all){
    const img=host.querySelector('[data-round-preview="'+row.id+'"]');
    if(!img)continue;
    resolveUrl(row.image_path).then(url=>{
     if(seq===adminRender&&img.isConnected&&url)img.src=url
    }).catch(()=>{if(img.isConnected)img.alt='Bild saknas: '+row.title});
   }
  }catch(e){host.textContent='Kunde inte hämta bakgrundsbilder: '+(e.message||e)}
 }
 window.aleaRoundGallery={list,getActivePool,pickRandomForCombat,activate,apply,fallbackImage,upload,toggle,rename,archive,renderAdmin};
})();
