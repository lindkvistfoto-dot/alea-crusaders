/* Alea Crusaders – authenticated, shared combat round art registry.
 * UI is SL/admin only; selection is saved with the combat instance.
 * Gallery images are private Supabase storage objects, not external URLs. */
(function(){
 'use strict';
 const BUCKET='alea-round-backgrounds';
 const BUILTIN='assets/combat/round-hero-battle-pilot.avif';
 const STATIC=/^assets\/combat\/round\/[a-z0-9-]+\.webp$/;
 const SAFE=/^round\/[0-9a-f-]{36}\.(?:webp|png|jpg|jpeg)$/;
 const MAX_SOURCE=12*1024*1024;
 let rows=null,chosenUrl='',chosenCombatId='',chosenKey='',request=0,adminBusy=false,adminRender=0;
 let chosenFocus=null,focusEditor=null;
 const cachedUrls=new Map(),failedImageUrls=new Set();
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const canManage=()=>{try{return Boolean(activeUser()?.admin)}catch(_){return false}};
 const status=message=>{const el=document.getElementById('roundGalleryStatus');if(el)el.textContent=message||''};
 const pathPart=s=>String(s).split('/').map(encodeURIComponent).join('/');
 const validPath=p=>p===BUILTIN||STATIC.test(String(p||''))||SAFE.test(String(p||''));
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
  if(path===BUILTIN||STATIC.test(path))return './'+path;
  if(cachedUrls.has(path))return cachedUrls.get(path);
  const res=await mapStorageFetch('object/'+BUCKET+'/'+pathPart(path),{method:'GET'});
  if(!res.ok)throw Error('Kunde inte läsa rundbild ('+res.status+').');
  const file=await res.blob();
  if(!file.type.startsWith('image/'))throw Error('Rundbilden saknar giltigt bildformat.');
  const url=URL.createObjectURL(file);
  cachedUrls.set(path,url);
  return url;
 }

 // Existing pictures are never edited. Store only a 0–100% viewport focus.
 const percent=n=>Math.min(100,Math.max(0,Math.round(Number(n)||0)));
 const readFocus=value=>value&&typeof value==='object'&&
  Number.isFinite(Number(value.x))&&Number.isFinite(Number(value.y))?
  {x:percent(value.x),y:percent(value.y)}:null;
 const defaultFocus=()=>typeof window!=='undefined'&&window.matchMedia?.('(max-width:600px)')?.matches?
  {x:75,y:18}:{x:100,y:24};
 const characterFor=actor=>actor?.source_type==='character'&&typeof chars!=='undefined'?
  (chars||[]).find(c=>String(c._dbId||'')===String(actor.source_id||'')):null;
 const focusFor=actor=>{
  const ch=characterFor(actor);
  // Updated character settings take effect even in previously created combats.
  return readFocus(ch?.roundBackgroundFocus)||readFocus(actor?.state?.round_background_focus);
 };
 function writeFocusPreview(focus){
  chosenFocus=readFocus(focus);
  apply();
  if(!focusEditor)return;
  const stage=focusEditor.querySelector('.alea-round-focus-stage img');
  const x=focusEditor.querySelector('[data-round-focus-x]');
  const y=focusEditor.querySelector('[data-round-focus-y]');
  const values=chosenFocus||defaultFocus();
  if(stage)stage.style.objectPosition=values.x+'% '+values.y+'%';
  if(x)x.value=String(values.x);
  if(y)y.value=String(values.y);
 }
 function closeFocusEditor(cancel=true){
  if(!focusEditor)return;
  if(cancel)chosenFocus=readFocus(focusEditor._originalFocus);
  const modal=focusEditor;focusEditor=null;modal.remove();
  apply();
 }
 async function saveFocusEditor(){
  const modal=focusEditor;
  if(!modal)return;
  const actor=typeof combatActiveActor==='function'?combatActiveActor():null;
  if(!actor||String(actor.id)!==String(modal._actorId)){
   closeFocusEditor();return;
  }
  const character=characterFor(actor);
  const editCharacter=!!character&&typeof canEditCharacter==='function'&&canEditCharacter(character);
  const gm=typeof combatCanManage==='function'&&combatCanManage();
  if(!editCharacter&&!gm){closeFocusEditor();return}
  const focus=readFocus(chosenFocus);
  const buttons=modal.querySelectorAll('button'),status=modal.querySelector('.alea-round-focus-status');
  buttons.forEach(button=>button.disabled=true);
  if(status)status.textContent='Sparar bildplacering…';
  const before=readFocus(character?.roundBackgroundFocus);
  try{
   if(editCharacter){
    if(focus)character.roundBackgroundFocus=focus;
    else delete character.roundBackgroundFocus;
    if(typeof save==='function')save();
    if(typeof syncCharacterToCentral==='function')await syncCharacterToCentral(character);
   }
   // Snapshot for live combatants and non-character NPCs. No schema changes.
   if(gm){
    const updated={...(actor.state||{})};
    if(focus)updated.round_background_focus=focus;
    else delete updated.round_background_focus;
    await dbJson('combatants?id=eq.'+encodeURIComponent(actor.id)+
     '&combat_id=eq.'+encodeURIComponent(activeCombat.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:JSON.stringify({state:updated,updated_at:new Date().toISOString()})
     });
    actor.state=updated;
   }
   // An owner may adjust their character even when only the GM can modify combatants.
   chosenFocus=focus;
   closeFocusEditor(false);
  }catch(error){
   console.error('Kunde inte spara rundbildens placering',error);
   if(editCharacter){
    if(before)character.roundBackgroundFocus=before;
    else delete character.roundBackgroundFocus;
   }
   if(status)status.textContent='Kunde inte spara: '+(error?.message||error);
   buttons.forEach(button=>button.disabled=false);
  }
 }
 function openFocusEditor(){
  const actor=typeof combatActiveActor==='function'?combatActiveActor():null;
  const ch=characterFor(actor);
  const mayEdit=!!ch&&typeof canEditCharacter==='function'&&canEditCharacter(ch);
  const gm=typeof combatCanManage==='function'&&combatCanManage();
  if(!actor||(!mayEdit&&!gm))return;
  if(focusEditor){closeFocusEditor();return}
  const photo=document.querySelector('#combatPage .combat-turn-panel .combat-round-artwork-image');
  const rectangle=photo?.getBoundingClientRect?.();
  const ratio=rectangle?.width&&rectangle?.height?Math.max(.75,Math.min(4,rectangle.width/rectangle.height)):2.5;
  const modal=document.createElement('div');
  modal.className='alea-round-focus-scrim';
  modal.setAttribute('role','presentation');
  modal._actorId=String(actor.id);
  modal._originalFocus=readFocus(chosenFocus);
  modal.innerHTML='<section class="alea-round-focus-dialog" role="dialog" aria-modal="true" aria-label="Justera rundbakgrund">'+
   '<h3>Justera rundbakgrund</h3>'+
   '<p>Dra bilden med fingret eller musen. Endast placeringen ändras – originalbilden behålls.</p>'+
   '<div class="alea-round-focus-stage" style="aspect-ratio:'+ratio+'" aria-label="Dra bilden för att välja utsnitt">'+
    '<img src="'+esc(chosenUrl||'./'+BUILTIN)+'" alt="Förhandsvisning av rundbakgrunden" draggable="false"></div>'+
   '<div class="alea-round-focus-controls">'+
    '<label>Sidled<input data-round-focus-x type="range" min="0" max="100" step="1" aria-label="Flytta bilden i sidled"></label>'+
    '<label>Höjdled<input data-round-focus-y type="range" min="0" max="100" step="1" aria-label="Flytta bilden i höjdled"></label>'+
   '</div>'+
   '<div class="alea-round-focus-buttons">'+
    '<button type="button" data-round-focus-reset>Återställ</button>'+
    '<button type="button" data-round-focus-cancel>Avbryt</button>'+
    '<button type="button" class="primary" data-round-focus-save>Spara placering</button>'+
   '</div><div class="alea-round-focus-status" role="status" aria-live="polite"></div>'+
   '</section>';
  document.body.appendChild(modal);
  focusEditor=modal;
  writeFocusPreview(modal._originalFocus);
  const stage=modal.querySelector('.alea-round-focus-stage');
  const image=stage.querySelector('img');
  image.onerror=()=>{image.src='./'+BUILTIN;image.onerror=null};
  const horizontal=modal.querySelector('[data-round-focus-x]');
  const vertical=modal.querySelector('[data-round-focus-y]');
  for(const slider of [horizontal,vertical])slider.addEventListener('input',()=>{
   writeFocusPreview({x:Number(horizontal.value),y:Number(vertical.value)})
  });
  let moving=null;
  stage.addEventListener('pointerdown',event=>{
   if(event.button!==0&&event.pointerType==='mouse')return;
   const start=chosenFocus||defaultFocus();
   moving={id:event.pointerId,x:event.clientX,y:event.clientY,focus:start};
   stage.setPointerCapture?.(event.pointerId);
   event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{
   if(!moving||moving.id!==event.pointerId)return;
   const rect=stage.getBoundingClientRect();
   if(!rect.width||!rect.height)return;
   writeFocusPreview({
    x:percent(moving.focus.x-(event.clientX-moving.x)*100/rect.width),
    y:percent(moving.focus.y-(event.clientY-moving.y)*100/rect.height)
   });
  });
  const finishMove=event=>{if(moving?.id===event.pointerId)moving=null};
  stage.addEventListener('pointerup',finishMove);
  stage.addEventListener('pointercancel',finishMove);
  modal.querySelector('[data-round-focus-reset]').addEventListener('click',()=>writeFocusPreview(null));
  modal.querySelector('[data-round-focus-cancel]').addEventListener('click',()=>closeFocusEditor());
  modal.querySelector('[data-round-focus-save]').addEventListener('click',()=>void saveFocusEditor());
  modal.addEventListener('click',event=>{if(event.target===modal)closeFocusEditor()});
  modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeFocusEditor()}});
  modal.querySelector('[data-round-focus-save]').focus();
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
   if(chosenFocus){
    el.style.setProperty('--alea-round-focus-x',chosenFocus.x+'%');
    el.style.setProperty('--alea-round-focus-y',chosenFocus.y+'%');
   }else{
    el.style.removeProperty('--alea-round-focus-x');
    el.style.removeProperty('--alea-round-focus-y');
   }
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
   ++request;chosenCombatId='';chosenKey='';chosenUrl='';chosenFocus=null;closeFocusEditor(false);apply();return
  }
  const state=actor?.state&&typeof actor.state==='object'?actor.state:{};
  const source=state.round_background_source==='character'?'character':'library';
  const actorPath=String(state.round_background_path||'');
  const actorLibraryId=String(state.round_background_id||'');
  const settingsId=String(combat.settings?.round_background_id||'');
  const focus=focusFor(actor);
  const key=[combat.id,actor?.id||'',source,actorPath,actorLibraryId,settingsId,
   focus?.x??'default',focus?.y??'default'].join('|');
  if(key===chosenKey){apply();return}
  if(focusEditor&&String(actor?.id||'')!==String(focusEditor._actorId))closeFocusEditor(false);
  const token=++request;
  chosenKey=key;chosenCombatId=String(combat.id);
  chosenFocus=focus;chosenUrl='';apply();  // No flash of previous actor on a new turn.
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
 window.aleaRoundGallery={list,getActivePool,pickRandomForCombat,activate,apply,fallbackImage,upload,toggle,rename,archive,renderAdmin,openFocusEditor,closeFocusEditor};
})();
