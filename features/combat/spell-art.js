/* Alea Crusaders – independent icon and effect illustration per spell.
 * Immutable private WebP files and square, pointer-draggable crop previews.
 * The same pixel crop geometry is used in admin and combat (no re-encoding).
 */
(function(){
 'use strict';
 const BUCKET='alea-spell-art';
 const PATH=/^spell\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;
 const UUID=/^[0-9a-f-]{36}$/;
 const TYPES={
  icon:{title:'Besvärjelseikon',description:'Kvadratisk bild för besvärjelseväljaren och små symboler.',path:'icon_path',x:'icon_focus_x',y:'icon_focus_y',zoom:'icon_zoom'},
  effect:{title:'Effektbild · magiruta',description:'Kvadratisk illustration längst ned till höger i magirutan.',path:'effect_image_path',x:'effect_focus_x',y:'effect_focus_y',zoom:'effect_zoom'}
 };
 const MAX_INPUT=12*1024*1024,MAX_OUTPUT=6*1024*1024;
 const cache=new Map(),inFlight=new Set();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const focus=(value,fallback=50)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):fallback;
 const zoom=(value,fallback=120)=>Number.isFinite(Number(value))?Math.max(100,Math.min(300,Math.round(Number(value)))):fallback;
 const validPath=path=>PATH.test(String(path||''));
 const getRow=id=>typeof ruleSpells!=='undefined'?(ruleSpells||[]).find(r=>String(r.id)===String(id)):null;
 const canManage=()=>{try{return !!activeUser()?.admin}catch(_){return false}};
 function artFor(row,kind){
  const type=TYPES[kind]||TYPES.effect;
  const path=row?.[type.path]||(row?.image_path||'');
  const legacy=validPath(path)&&path===row?.image_path;
  return {
   path:validPath(path)?path:'',
   x:focus(row?.[type.x]??(legacy?row?.image_focus_x:null),50),
   y:focus(row?.[type.y]??(legacy?row?.image_focus_y:null),50),
   zoom:zoom(row?.[type.zoom],120)
  };
 }
 function setStatus(kind,message){
  const el=document.querySelector('.spell-art-pane[data-kind="'+kind+'"] .spell-art-status');
  if(el)el.textContent=message||'';
 }
 function paneFor(kind){return document.querySelector('.spell-art-pane[data-kind="'+kind+'"]')}
 function validKind(kind){return Object.prototype.hasOwnProperty.call(TYPES,kind)?kind:'effect'}
 function resolveUrl(path){
  if(!validPath(path))return Promise.resolve('');
  if(cache.has(path))return cache.get(path);
  const pending=(async()=>{
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{method:'GET'});
   if(!response.ok)throw Error('Kunde inte läsa besvärjelsebilden ('+response.status+').');
   const blob=await response.blob();
   if(!blob.size||!blob.type.startsWith('image/'))throw Error('Besvärjelsebilden är ogiltig.');
   return URL.createObjectURL(blob);
  })();
  cache.set(path,pending);
  pending.catch(()=>{if(cache.get(path)===pending)cache.delete(path)});
  return pending;
 }
 function paneHtml(row,kind){
  const t=TYPES[kind],v=artFor(row,kind);
  const id=esc(row.id),k=esc(kind);
  return '<section class="spell-art-pane" data-kind="'+k+'" data-spell-id="'+id+'">'+
   '<h4>'+t.title+'</h4><p>'+t.description+'</p>'+
   '<div class="spell-art-editor-layout">'+
    '<div class="spell-art-preview-column">'+
     '<div class="spell-art-viewport" role="img" aria-label="Kvadratisk förhandsvisning: dra bilden för att justera utsnittet" tabindex="0">'+
      (v.path?'<img data-spell-art-preview="'+esc(v.path)+'" alt="" draggable="false" hidden>':'<span class="spell-art-empty">Ingen bild uppladdad</span>')+
     '</div>'+
     '<small class="spell-art-help">Dra bilden med mus eller finger. Zooma för att kunna flytta även en kvadratisk originalbild.</small>'+
    '</div>'+
    '<div class="spell-art-edit-controls">'+
     '<label class="smallbtn spell-art-upload">'+(v.path?'Byt bild':'Ladda upp bild')+
      '<input type="file" accept="image/png,image/jpeg,image/webp" onchange="aleaSpellArt.upload(event,\''+id+'\',\''+k+'\')"></label>'+
     (v.path?'<button type="button" class="smallbtn" onclick="aleaSpellArt.remove(\''+id+'\',\''+k+'\')">Ta bort bild</button>':'')+
     '<label>Horisontell position <output data-output="x">'+v.x+' %</output>'+
      '<input data-crop="x" aria-label="'+t.title+' horisontell position" type="range" min="0" max="100" value="'+v.x+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<label>Vertikal position <output data-output="y">'+v.y+' %</output>'+
      '<input data-crop="y" aria-label="'+t.title+' vertikal position" type="range" min="0" max="100" value="'+v.y+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<label>Zoom <output data-output="zoom">'+v.zoom+' %</output>'+
      '<input data-crop="zoom" aria-label="'+t.title+' zoom" type="range" min="100" max="300" step="5" value="'+v.zoom+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<div class="spell-art-control-actions">'+
      '<button type="button" class="smallbtn" onclick="aleaSpellArt.resetFocus(\''+k+'\')">Centrera</button>'+
      '<button type="button" class="smallbtn" onclick="aleaSpellArt.saveFocus(\''+id+'\',\''+k+'\')">Spara utsnitt</button>'+
     '</div><small>PNG, JPG eller WebP upp till 12 MB. Originalets bildförhållande bevaras; bara det kvadratiska utsnittet visas.</small>'+
    '</div>'+
   '</div><p class="spell-art-status" role="status" aria-live="polite"></p>'+
  '</section>';
 }
 function editorHtml(row){
  if(!row?.id||!UUID.test(String(row.id)))return '<section class="spell-art-editor"><h3>Besvärjelsebilder</h3><p class="muted">Spara den nya besvärjelsen först och öppna den sedan för att lägga till bilder.</p></section>';
  return '<section class="spell-art-editor"><h3>Besvärjelsebilder</h3>'+
   '<p>Två oberoende kvadratiska utsnitt. Dra och zooma direkt i förhandsvisningen. Befintliga bilder kan bytas separat.</p>'+
   paneHtml(row,'icon')+paneHtml(row,'effect')+
   '</section>';
 }
 function geometry(img,view,v){
  if(!img?.naturalWidth||!img?.naturalHeight||!view?.getBoundingClientRect)return null;
  const rect=view.getBoundingClientRect();
  const w=rect.width||view.clientWidth,h=rect.height||view.clientHeight;
  if(!(w>0&&h>0))return null;
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight)*(zoom(v.zoom)/100);
  const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
  return {width:iw,height:ih,overX:Math.max(0,iw-w),overY:Math.max(0,ih-h)};
 }
 function positionImage(img,view,v){
  const g=geometry(img,view,v);if(!g)return null;
  Object.assign(img.style,{
   width:g.width+'px',height:g.height+'px',
   left:-(g.overX*focus(v.x)/100)+'px',
   top:-(g.overY*focus(v.y)/100)+'px'
  });
  return g;
 }
 function paneValues(pane){
  const value=key=>pane?.querySelector('[data-crop="'+key+'"]')?.value;
  return {x:focus(value('x')),y:focus(value('y')),zoom:zoom(value('zoom'))};
 }
 function syncOutputs(pane,v){
  for(const key of ['x','y','zoom']){
   const out=pane?.querySelector('[data-output="'+key+'"]');
   if(out)out.textContent=v[key]+' %';
  }
 }
 function previewFocus(kind='effect'){
  const pane=paneFor(validKind(kind));if(!pane)return;
  const v=paneValues(pane);
  syncOutputs(pane,v);
  positionImage(pane.querySelector('[data-spell-art-preview]'),pane.querySelector('.spell-art-viewport'),v);
 }
 function writeInputs(pane,v){
  for(const key of ['x','y','zoom']){
   const el=pane?.querySelector('[data-crop="'+key+'"]');
   if(el)el.value=v[key];
  }
  if(pane)previewFocus(pane.dataset.kind);
 }
 function resetFocus(kind='effect'){
  const pane=paneFor(validKind(kind));
  if(pane)writeInputs(pane,{x:50,y:50,zoom:120});
 }
 function bindDrag(pane){
  if(!pane||pane.dataset.dragBound==='true')return;
  const view=pane.querySelector('.spell-art-viewport');
  const img=pane.querySelector('[data-spell-art-preview]');
  if(!view||!img)return;
  pane.dataset.dragBound='true';
  let drag=null;
  view.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   const v=paneValues(pane),g=geometry(img,view,v);
   if(!g)return;
   event.preventDefault();
   drag={id:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:v.x,y:v.y,overX:g.overX,overY:g.overY};
   view.classList.add('is-dragging');
   view.setPointerCapture?.(event.pointerId);
  });
  view.addEventListener('pointermove',event=>{
   if(!drag||event.pointerId!==drag.id)return;
   event.preventDefault();
   const x=drag.overX>0?focus(drag.x-(event.clientX-drag.clientX)*100/drag.overX):drag.x;
   const y=drag.overY>0?focus(drag.y-(event.clientY-drag.clientY)*100/drag.overY):drag.y;
   writeInputs(pane,{...paneValues(pane),x,y});
  });
  const end=event=>{
   if(!drag||event.pointerId!==drag.id)return;
   drag=null;view.classList.remove('is-dragging');
   try{if(view.hasPointerCapture?.(event.pointerId))view.releasePointerCapture(event.pointerId)}catch(_){}
  };
  view.addEventListener('pointerup',end);
  view.addEventListener('pointercancel',end);
  view.addEventListener('lostpointercapture',event=>{
   if(drag?.id===event.pointerId){drag=null;view.classList.remove('is-dragging')}
  });
 }
 async function hydrateEditor(){
  for(const kind of Object.keys(TYPES)){
   const pane=paneFor(kind),row=getRow(pane?.dataset.spellId);
   if(!pane||!row)continue;
   const path=artFor(row,kind).path;
   const img=pane.querySelector('[data-spell-art-preview]');
   if(!img||!path)continue;
   bindDrag(pane);
   try{
    const url=await resolveUrl(path);
    if(!img.isConnected||pane.dataset.spellId!==String(row.id)||img.dataset.spellArtPreview!==path)continue;
    img.onload=()=>{if(img.isConnected)previewFocus(kind)};
    img.src=url;img.hidden=false;
    if(img.complete&&img.naturalWidth)previewFocus(kind);
   }catch(error){setStatus(kind,'Kunde inte visa bilden: '+(error.message||error))}
  }
 }
 function updateRow(id,patch){
  const row=getRow(id);if(row)Object.assign(row,patch);
  if(typeof renderAdminSpells==='function')renderAdminSpells();
 }
 function refreshEditor(id){
  const row=getRow(id),host=document.getElementById('spellArtEditor');
  if(!row||!host)return;
  host.innerHTML=editorHtml(row);
  void hydrateEditor();
 }
 async function saveFocus(id,kind='effect'){
  kind=validKind(kind);const t=TYPES[kind],pane=paneFor(kind);
  if(!canManage()||!getRow(id)||!pane||inFlight.has(kind))return;
  const v=paneValues(pane),patch={[t.x]:v.x,[t.y]:v.y,[t.zoom]:v.zoom};
  inFlight.add(kind);setStatus(kind,'Sparar bildutsnitt…');
  try{
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
   updateRow(id,patch);
   setStatus(kind,'✓ Bildutsnitt sparat.');
  }catch(error){setStatus(kind,'Kunde inte spara: '+(error.message||error))}
  finally{inFlight.delete(kind)}
 }
 async function convert(file){
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_INPUT)
   throw Error('Välj PNG, JPG eller WebP på högst 12 MB.');
  const temp=URL.createObjectURL(file);
  try{
   const img=new Image();
   await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error('Bilden kan inte läsas.'));img.src=temp});
   if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)
    throw Error('Bildens dimensioner är för stora.');
   const scale=Math.min(1,1920/img.naturalWidth,1920/img.naturalHeight);
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw Error('Webbläsaren kan inte bearbeta bilder.');
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));
   if(!blob||blob.type!=='image/webp'||blob.size>MAX_OUTPUT)throw Error('WebP-bilden blev för stor eller kunde inte skapas.');
   return blob;
  }finally{URL.revokeObjectURL(temp)}
 }
 async function upload(event,id,kind='effect'){
  kind=validKind(kind);const t=TYPES[kind];
  const input=event?.target,file=input?.files?.[0];if(input)input.value='';
  if(!file||!canManage()||!UUID.test(String(id))||!getRow(id)||inFlight.has(kind))return;
  inFlight.add(kind);setStatus(kind,'Bearbetar bild…');
  try{
   const blob=await convert(file);
   const path='spell/'+id+'/'+crypto.randomUUID()+'.webp';
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!response.ok){const err=await response.json().catch(()=>null);throw Error(err?.message||err?.error||'Lagring misslyckades ('+response.status+').')}
   // A new image starts at a usable zoom so a square image can be dragged too.
   const patch={[t.path]:path,[t.x]:50,[t.y]:50,[t.zoom]:120};
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
   updateRow(id,patch);refreshEditor(id);setStatus(kind,'✓ Bild uppladdad. Dra bilden och välj Spara utsnitt.');
  }catch(error){
   setStatus(kind,'Kunde inte ladda upp: '+(error.message||error));
   console.error('Spell artwork upload',error)
  }finally{inFlight.delete(kind)}
 }
 async function remove(id,kind='effect'){
  kind=validKind(kind);
  if(!canManage()||!getRow(id)||inFlight.has(kind)||!confirm('Ta bort '+TYPES[kind].title.toLowerCase()+'? Historiska bilder bevaras.'))return;
  inFlight.add(kind);setStatus(kind,'Tar bort bildkopplingen…');
  try{
   const patch={[TYPES[kind].path]:null};
   await dbJson('rule_spells?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
   updateRow(id,patch);refreshEditor(id);setStatus(kind,'✓ Bildkopplingen borttagen.');
  }catch(error){setStatus(kind,'Kunde inte ta bort bilden: '+(error.message||error))}
  finally{inFlight.delete(kind)}
 }
 async function hydrateCombat(root){
  if(!root?.querySelectorAll)return;
  root.querySelectorAll('[data-spell-art-path]').forEach(async el=>{
   const path=el.getAttribute('data-spell-art-path');
   if(!validPath(path))return;
   const img=el.tagName==='IMG'?el:el.querySelector('img');
   if(!img)return;
   try{
    const url=await resolveUrl(path);
    if(!el.isConnected||el.getAttribute('data-spell-art-path')!==path)return;
    const view=el.tagName==='IMG'?el.parentElement:el;
    const v={x:focus(el.dataset.focusX),y:focus(el.dataset.focusY),zoom:zoom(el.dataset.zoom)};
    img.onload=()=>{if(img.isConnected)positionImage(img,view,v)};
    img.onerror=()=>{img.hidden=true};
    img.src=url;img.hidden=false;
    if(img.complete&&img.naturalWidth)positionImage(img,view,v);
   }catch(error){console.warn('Besvärjelsebilden kunde inte läsas',error)}
  });
 }
 function refreshVisibleCrops(){
  for(const kind of Object.keys(TYPES))previewFocus(kind);
  document.querySelectorAll('[data-spell-art-path]').forEach(el=>{
   const img=el.tagName==='IMG'?el:el.querySelector('img');
   if(!img||img.hidden)return;
   positionImage(img,el.tagName==='IMG'?el.parentElement:el,{
    x:focus(el.dataset.focusX),y:focus(el.dataset.focusY),zoom:zoom(el.dataset.zoom)
   });
  });
 }
 if(typeof window.addEventListener==='function')window.addEventListener('resize',refreshVisibleCrops,{passive:true});
 window.aleaSpellArt={validPath,resolveUrl,artFor,editorHtml,hydrateEditor,previewFocus,resetFocus,saveFocus,upload,remove,hydrateCombat,positionImage};
})();
