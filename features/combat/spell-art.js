/* Alea Crusaders — private, immutable master spell illustrations.
 * One image per rule_spells row; the image in a combat action is snapshotted.
 * No foreign URLs, public buckets or image binary inside spell JSON. */
(function(){
 'use strict';
 const BUCKET='alea-spell-art';
 const PATH=/^spell\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
 const UUID=/^[0-9a-f-]{36}$/;
 const MAX_INPUT=12*1024*1024,MAX_OUTPUT=6*1024*1024;
 const cache=new Map();
 let busy=false;
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const validPath=p=>PATH.test(String(p||''));
 const focus=(value,defaultValue)=>Number.isFinite(Number(value))?Math.min(100,Math.max(0,Math.round(Number(value)))):defaultValue;
 const canManage=()=>{try{return !!activeUser()?.admin}catch(_){return false}};
 const getRow=id=>typeof ruleSpells!=='undefined'?(ruleSpells||[]).find(r=>String(r.id)===String(id)):null;
 const status=message=>{const el=document.getElementById('spellArtStatus');if(el)el.textContent=message||''};
 function resolveUrl(path){
  if(!validPath(path))return Promise.resolve('');
  if(cache.has(path))return cache.get(path);
  const pending=(async()=>{
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'GET'});
   if(!response.ok)throw Error('Kunde inte läsa besvärjelsebild ('+response.status+').');
   const blob=await response.blob();
   if(!blob.type.startsWith('image/')||!blob.size)throw Error('Bildfilen är ogiltig.');
   return URL.createObjectURL(blob);
  })();
  cache.set(path,pending);
  pending.catch(()=>{if(cache.get(path)===pending)cache.delete(path)});
  return pending;
 }
 function editorHtml(row){
  if(!row?.id||!UUID.test(String(row.id))){
   return '<section class="spell-art-editor"><h3>Besvärjelsebild</h3><p class="muted">Spara den nya besvärjelsen först. Öppna den sedan för att lägga till en bild.</p></section>';
  }
  const path=validPath(row.image_path)?row.image_path:'';
  const x=focus(row.image_focus_x,80),y=focus(row.image_focus_y,78),id=esc(row.id);
  return '<section class="spell-art-editor" data-spell-id="'+id+'">'+
   '<h3>Besvärjelsebild</h3>'+
   '<p class="muted">Bilden visas i magirutans effektfält och i besvärjelseväljaren. Originalbilden bevaras vid beskärning.</p>'+
   '<div class="spell-art-editor-layout">'+
    '<div class="spell-art-preview" id="spellArtPreview">'+
     (path?'<img alt="Förhandsvisning av besvärjelsebild" data-spell-art-preview="'+esc(path)+'" style="object-position:'+x+'% '+y+'%" hidden>':'<span>Ingen bild vald · ✦</span>')+
    '</div>'+
    '<div class="spell-art-edit-controls">'+
     '<label class="smallbtn spell-art-upload">✧ '+(path?'Byt bild':'Ladda upp bild')+
      '<input type="file" accept="image/png,image/jpeg,image/webp" onchange="aleaSpellArt.upload(event,\''+id+'\')"></label>'+
     (path?'<button type="button" class="smallbtn" onclick="aleaSpellArt.remove(\''+id+'\')">Ta bort bild</button>':'')+
     '<label>Bildfokus i sidled <output id="spellArtXOut">'+x+' %</output>'+
      '<input id="spellArtFocusX" type="range" min="0" max="100" value="'+x+'" oninput="aleaSpellArt.previewFocus()"></label>'+
     '<label>Bildfokus i höjdled <output id="spellArtYOut">'+y+' %</output>'+
      '<input id="spellArtFocusY" type="range" min="0" max="100" value="'+y+'" oninput="aleaSpellArt.previewFocus()"></label>'+
     '<button type="button" class="smallbtn" onclick="aleaSpellArt.saveFocus(\''+id+'\')">Spara utsnitt</button>'+
     '<small>PNG/JPG/WebP, max 12 MB · omvandlas till privat WebP. Bilder som redan använts i strid sparas för historiken.</small>'+
    '</div></div>'+
   '<p id="spellArtStatus" role="status" aria-live="polite"></p></section>';
 }
 async function hydrateEditor(){
  const host=document.querySelector('#spellArtEditor .spell-art-editor');
  const row=getRow(host?.dataset?.spellId),path=validPath(row?.image_path)?row.image_path:'';
  const img=host?.querySelector('[data-spell-art-preview]');
  if(!img||!path)return;
  try{
   const url=await resolveUrl(path);
   if(!img.isConnected||host.dataset.spellId!==String(row.id)||img.dataset.spellArtPreview!==path)return;
   img.src=url;img.hidden=false;
  }catch(error){if(img.isConnected)status('Kunde inte visa bilden: '+(error.message||error))}
 }
 function previewFocus(){
  const x=focus(document.getElementById('spellArtFocusX')?.value,80);
  const y=focus(document.getElementById('spellArtFocusY')?.value,78);
  const image=document.querySelector('#spellArtPreview img');
  if(image)image.style.objectPosition=x+'% '+y+'%';
  const xo=document.getElementById('spellArtXOut'),yo=document.getElementById('spellArtYOut');
  if(xo)xo.textContent=x+' %';
  if(yo)yo.textContent=y+' %';
 }
 function refreshEditor(id){
  const host=document.getElementById('spellArtEditor'),row=getRow(id);
  if(!host||!row)return;
  host.innerHTML=editorHtml(row);
  void hydrateEditor();
 }
 function updateRow(id,patch){
  const row=getRow(id);if(row)Object.assign(row,patch);
  if(typeof renderAdminSpells==='function')renderAdminSpells();
 }
 async function saveFocus(id){
  if(!canManage()||busy||!getRow(id))return;
  const x=focus(document.getElementById('spellArtFocusX')?.value,80);
  const y=focus(document.getElementById('spellArtFocusY')?.value,78);
  busy=true;status('Sparar fokuspunkt…');
  try{
   const patch={image_focus_x:x,image_focus_y:y};
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
   updateRow(id,patch);status('✓ Bildutsnitt sparat.');
  }catch(error){status('Kunde inte spara utsnittet: '+(error.message||error))}
  finally{busy=false}
 }
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_INPUT)
   throw Error('Välj PNG, JPG eller WebP på högst 12 MB.');
  const temp=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Bilden kan inte läsas.'));img.src=temp});
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)
    throw Error('Bildens dimensioner är för stora.');
   const scale=Math.min(1,1920/img.naturalWidth,1200/img.naturalHeight);
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Bildbearbetning saknas i webbläsaren.');
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));
   if(!blob||blob.type!=='image/webp'||blob.size>MAX_OUTPUT)
    throw Error('Bilden kunde inte konverteras till WebP under 6 MB.');
   return blob;
  }finally{URL.revokeObjectURL(temp)}
 }
 async function upload(event,id){
  const input=event?.target,file=input?.files?.[0];
  if(input)input.value='';
  if(!canManage()||busy||!file||!UUID.test(String(id))||!getRow(id))return;
  busy=true;status('Bearbetar besvärjelsebild…');
  try{
   const blob=await convert(file);
   const path='spell/'+id+'/'+crypto.randomUUID()+'.webp';
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!response.ok){const error=await response.json().catch(()=>null);throw Error(error?.message||error?.error||'Bildlagring misslyckades ('+response.status+').')}
   const patch={image_path:path,
    image_focus_x:focus(document.getElementById('spellArtFocusX')?.value,80),
    image_focus_y:focus(document.getElementById('spellArtFocusY')?.value,78)};
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
   updateRow(id,patch);refreshEditor(id);status('✓ Bilden sparad på besvärjelsen.');
  }catch(error){status('Kunde inte ladda upp bilden: '+(error.message||error));console.error('Spell artwork upload',error)}
  finally{busy=false}
 }
 async function remove(id){
  if(!canManage()||busy||!getRow(id)||!confirm('Ta bort bilden från denna besvärjelse? Äldre strider behåller sin bild.'))return;
  busy=true;status('Tar bort bildkopplingen…');
  try{
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({image_path:null})});
   updateRow(id,{image_path:null});refreshEditor(id);
   status('✓ Bildkopplingen borttagen. Historiska bilder bevaras.');
  }catch(error){status('Kunde inte ta bort kopplingen: '+(error.message||error))}
  finally{busy=false}
 }
 async function hydrateCombat(root){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('[data-spell-art-path]').forEach(async el=>{
   const path=el.getAttribute('data-spell-art-path');
   if(!validPath(path))return;
   try{
    const url=await resolveUrl(path);
    if(!el.isConnected||el.getAttribute('data-spell-art-path')!==path)return;
    if(el.tagName==='IMG'){
     el.onerror=()=>{el.hidden=true};
     el.src=url;el.hidden=false;
    }else{
     el.style.setProperty('--alea-spell-effect-art','url('+JSON.stringify(url)+')');
    }
   }catch(error){console.warn('Besvärjelsebilden kunde inte läsas',error)}
  });
 }
 window.aleaSpellArt={validPath,resolveUrl,editorHtml,hydrateEditor,previewFocus,saveFocus,upload,remove,hydrateCombat};
})();
