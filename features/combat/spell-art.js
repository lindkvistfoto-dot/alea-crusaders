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
  effect:{title:'Effektbild · magiruta',description:'Kvadratisk illustration längst ned till höger i magirutan.',path:'effect_image_path',x:'effect_focus_x',y:'effect_focus_y',zoom:'effect_zoom'},
  cutout:{title:'Besvärjelse-cutout · mittenruta',description:'Frilagd bild med transparent bakgrund som kan sticka upp ovanför guldramen.',path:'cutout_path',x:'cutout_x',y:'cutout_y',zoom:'cutout_scale'}
 };
 const MAX_INPUT=12*1024*1024,MAX_OUTPUT=6*1024*1024;
 const cache=new Map(),inFlight=new Set();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const focus=(value,fallback=50)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):fallback;
 const zoom=(value,fallback=120)=>Number.isFinite(Number(value))?Math.max(100,Math.min(300,Math.round(Number(value)))):fallback;
 const cutoutScale=(value,fallback=160)=>Number.isFinite(Number(value))?Math.max(50,Math.min(250,Math.round(Number(value)))):fallback;
 const REPO_ICON=/^assets\/spells\/arcane-ivory\/[a-z0-9-]+\.(?:png|webp)$/;
 const validPath=path=>PATH.test(String(path||''))||REPO_ICON.test(String(path||''));
 const getRow=id=>typeof ruleSpells!=='undefined'?(ruleSpells||[]).find(r=>String(r.id)===String(id)):null;
 const canManage=()=>{try{return !!activeUser()?.admin}catch(_){return false}};
 function artFor(row,kind){
  const type=TYPES[kind]||TYPES.effect;
  // Never fall back to a square image when a cutout is missing.
  const path=row?.[type.path]!==undefined?row[type.path]:(kind==='cutout'?'':(row?.image_path||''));
  const legacy=validPath(path)&&path===row?.image_path;
  return {
   path:validPath(path)?path:'',
   x:focus(row?.[type.x]??(legacy?row?.image_focus_x:null),50),
   y:focus(row?.[type.y]??(legacy?row?.image_focus_y:null),kind==='cutout'?90:50),
   zoom:kind==='cutout'?cutoutScale(row?.[type.zoom]):zoom(row?.[type.zoom],120)
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
  if(REPO_ICON.test(String(path||'')))return Promise.resolve('./'+path);
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
  const id=esc(row.id),k=esc(kind),cutout=kind==='cutout';
  return '<section class="spell-art-pane" data-kind="'+k+'" data-spell-id="'+id+'">'+
   '<h4>'+t.title+'</h4><p>'+t.description+'</p>'+
   '<div class="spell-art-editor-layout">'+
    '<div class="spell-art-preview-column">'+
     (cutout?
      '<div class="spell-art-cutout-preview" role="img" aria-label="Flytta cutout-illustrationen med fingret" tabindex="0">'+
       '<span class="spell-art-cutout-frame"><span class="spell-art-cutout-layer">'+
        (v.path?'<img data-spell-art-preview="'+esc(v.path)+'" alt="" draggable="false" hidden>':'')+
       '</span></span>'+(!v.path?'<span class="spell-art-empty">Ingen cutout uppladdad</span>':'')+'</div>':
      '<div class="spell-art-viewport" role="img" aria-label="Kvadratisk förhandsvisning: dra bilden för att justera utsnittet" tabindex="0">'+
       (v.path?'<img data-spell-art-preview="'+esc(v.path)+'" alt="" draggable="false" hidden>':'<span class="spell-art-empty">Ingen bild uppladdad</span>')+'</div>')+
     '<small class="spell-art-help">'+(cutout?'Dra den frilagda bilden framför guldramen. Placering och storlek sparas separat.':'Dra bilden med mus eller finger. Zooma för att kunna flytta även en kvadratisk originalbild.')+'</small>'+
    '</div>'+
    '<div class="spell-art-edit-controls">'+
     '<label class="smallbtn spell-art-upload">'+(v.path?'Byt bild':'Ladda upp bild')+
      '<input type="file" accept="'+(cutout?'image/png,image/webp':'image/png,image/jpeg,image/webp')+'" onchange="aleaSpellArt.upload(event,\''+id+'\',\''+k+'\')"></label>'+
     (v.path?'<button type="button" class="smallbtn" onclick="aleaSpellArt.remove(\''+id+'\',\''+k+'\')">Ta bort bild</button>':'')+
     '<label>'+(cutout?'Placering X':'Horisontell position')+' <output data-output="x">'+v.x+' %</output>'+
      '<input data-crop="x" aria-label="'+t.title+' horisontell position" type="range" min="0" max="100" value="'+v.x+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<label>'+(cutout?'Baslinje Y':'Vertikal position')+' <output data-output="y">'+v.y+' %</output>'+
      '<input data-crop="y" aria-label="'+t.title+' vertikal position" type="range" min="0" max="100" value="'+v.y+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<label>'+(cutout?'Storlek':'Zoom')+' <output data-output="zoom">'+v.zoom+' %</output>'+
      '<input data-crop="zoom" aria-label="'+t.title+' zoom" type="range" min="'+(cutout?50:100)+'" max="'+(cutout?250:300)+'" step="5" value="'+v.zoom+'" oninput="aleaSpellArt.previewFocus(\''+k+'\')"></label>'+
     '<div class="spell-art-control-actions">'+
      '<button type="button" class="smallbtn" onclick="aleaSpellArt.resetFocus(\''+k+'\')">Centrera</button>'+
      '<button type="button" class="smallbtn" onclick="aleaSpellArt.saveFocus(\''+id+'\',\''+k+'\')">'+(cutout?'Spara placering':'Spara utsnitt')+'</button>'+
     '</div><small>'+(cutout?'Transparent PNG eller WebP upp till 12 MB. Bildens proportioner bevaras utan kvadratisk beskärning.':'PNG, JPG eller WebP upp till 12 MB. Originalets bildförhållande bevaras; bara det kvadratiska utsnittet visas.')+'</small>'+
    '</div>'+
   '</div><p class="spell-art-status" role="status" aria-live="polite"></p>'+
  '</section>';
 }
 function editorHtml(row){
  if(!row?.id||!UUID.test(String(row.id)))return '<section class="spell-art-editor"><h3>Besvärjelsebilder</h3><p class="muted">Spara den nya besvärjelsen först och öppna den sedan för att lägga till bilder.</p></section>';
  return '<section class="spell-art-editor"><h3>Besvärjelsebilder</h3>'+
   '<p>Tre oberoende bildfält: ikon, effektbild och transparent cutout i mittenrutan. Bilder kan bytas separat.</p>'+
   paneHtml(row,'icon')+paneHtml(row,'effect')+paneHtml(row,'cutout')+
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
 function positionCutout(img,view,v){
  if(!img?.naturalWidth||!img?.naturalHeight||!view?.getBoundingClientRect)return null;
  const rect=view.getBoundingClientRect(),w=rect.width||view.clientWidth,h=rect.height||view.clientHeight;
  if(!(w>0&&h>0))return null;
  const scale=Math.min(w/img.naturalWidth,h/img.naturalHeight)*cutoutScale(v.zoom)/100;
  const iw=img.naturalWidth*scale,ih=img.naturalHeight*scale;
  Object.assign(img.style,{
   width:iw+'px',height:ih+'px',
   left:(w*focus(v.x)/100-iw/2)+'px',
   top:(h*focus(v.y,90)/100-ih)+'px'
  });
  return {width:iw,height:ih}
 }
 function paneValues(pane){
  const value=key=>pane?.querySelector('[data-crop="'+key+'"]')?.value;
  const cutout=pane?.dataset?.kind==='cutout';
  return {x:focus(value('x')),y:focus(value('y'),cutout?90:50),
   zoom:cutout?cutoutScale(value('zoom')):zoom(value('zoom'))};
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
  const img=pane.querySelector('[data-spell-art-preview]');
  if(pane.dataset.kind==='cutout')positionCutout(img,pane.querySelector('.spell-art-cutout-layer'),v);
  else positionImage(img,pane.querySelector('.spell-art-viewport'),v);
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
  if(pane)writeInputs(pane,kind==='cutout'?{x:50,y:90,zoom:160}:{x:50,y:50,zoom:120});
 }
 function bindDrag(pane){
  if(!pane||pane.dataset.dragBound==='true')return;
  const cutout=pane.dataset.kind==='cutout';
  const view=pane.querySelector(cutout?'.spell-art-cutout-preview':'.spell-art-viewport');
  const layer=cutout?pane.querySelector('.spell-art-cutout-layer'):view;
  const img=pane.querySelector('[data-spell-art-preview]');
  if(!view||!layer||!img)return;
  pane.dataset.dragBound='true';
  let drag=null;
  view.addEventListener('pointerdown',event=>{
   if(event.pointerType==='mouse'&&event.button!==0)return;
   const v=paneValues(pane),g=cutout?layer.getBoundingClientRect():geometry(img,view,v);
   if(!g)return;
   event.preventDefault();
   drag={id:event.pointerId,clientX:event.clientX,clientY:event.clientY,x:v.x,y:v.y,
    overX:g.overX,overY:g.overY,width:g.width,height:g.height};
   view.classList.add('is-dragging');
   view.setPointerCapture?.(event.pointerId);
  });
  view.addEventListener('pointermove',event=>{
   if(!drag||event.pointerId!==drag.id)return;
   event.preventDefault();
   const x=cutout?focus(drag.x+(event.clientX-drag.clientX)*100/drag.width):
    drag.overX>0?focus(drag.x-(event.clientX-drag.clientX)*100/drag.overX):drag.x;
   const y=cutout?focus(drag.y+(event.clientY-drag.clientY)*100/drag.height,90):
    drag.overY>0?focus(drag.y-(event.clientY-drag.clientY)*100/drag.overY):drag.y;
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
  // An admin edit must also update a battle already open in this tab.
  const combatPage=document.getElementById('combatPage');
  if(combatPage&&!combatPage.classList.contains('hidden')&&
     typeof renderCombat==='function')renderCombat();
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
 async function convert(file,kind='effect'){
  const accepted=kind==='cutout'?['image/png','image/webp']:['image/png','image/jpeg','image/webp'];
  if(!file||!accepted.includes(file.type)||file.size>MAX_INPUT)
   throw Error(kind==='cutout'?'Välj en frilagd PNG eller WebP på högst 12 MB.':'Välj PNG, JPG eller WebP på högst 12 MB.');
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
   const blob=await convert(file,kind);
   const path='spell/'+id+'/'+crypto.randomUUID()+'.webp';
   const response=await mapStorageFetch('object/'+BUCKET+'/'+path.split('/').map(encodeURIComponent).join('/'),{
    method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:blob
   });
   if(!response.ok){const err=await response.json().catch(()=>null);throw Error(err?.message||err?.error||'Lagring misslyckades ('+response.status+').')}
   // A new image starts at a usable zoom so a square image can be dragged too.
   const patch={[t.path]:path,[t.x]:50,[t.y]:kind==='cutout'?90:50,[t.zoom]:kind==='cutout'?160:120};
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
  await Promise.all(Array.from(root.querySelectorAll('[data-spell-art-path],[data-spell-cutout-path]')).map(async el=>{
   const cutout=!!el.getAttribute('data-spell-cutout-path');
   const path=el.getAttribute(cutout?'data-spell-cutout-path':'data-spell-art-path');
   if(!validPath(path))return;
   const img=el.tagName==='IMG'?el:el.querySelector('img');
   if(!img)return;
   try{
    const url=await resolveUrl(path);
    if(!el.isConnected||el.getAttribute(cutout?'data-spell-cutout-path':'data-spell-art-path')!==path)return;
    const view=el.tagName==='IMG'?el.parentElement:el;
    const v=cutout?{x:focus(el.dataset.offsetX),y:focus(el.dataset.offsetY,90),zoom:cutoutScale(el.dataset.scale)}:
     {x:focus(el.dataset.focusX),y:focus(el.dataset.focusY),zoom:zoom(el.dataset.zoom)};
    const position=()=>cutout?positionCutout(img,view,v):positionImage(img,view,v);
    img.onload=()=>{if(img.isConnected)position()};
    img.onerror=()=>{img.hidden=true};
    img.src=url;img.hidden=false;
    if(img.complete&&img.naturalWidth)position();
   }catch(error){console.warn('Besvärjelsebilden kunde inte läsas',error)}
  }));
 }
 function refreshVisibleCrops(){
  for(const kind of Object.keys(TYPES))previewFocus(kind);
  document.querySelectorAll('[data-spell-art-path],[data-spell-cutout-path]').forEach(el=>{
   const img=el.tagName==='IMG'?el:el.querySelector('img');
   if(!img||img.hidden)return;
   const view=el.tagName==='IMG'?el.parentElement:el;
   if(el.getAttribute('data-spell-cutout-path'))positionCutout(img,view,{
    x:focus(el.dataset.offsetX),y:focus(el.dataset.offsetY,90),zoom:cutoutScale(el.dataset.scale)
   });
   else positionImage(img,view,{
    x:focus(el.dataset.focusX),y:focus(el.dataset.focusY),zoom:zoom(el.dataset.zoom)
   });
  });
 }
 if(typeof window.addEventListener==='function')window.addEventListener('resize',refreshVisibleCrops,{passive:true});
 window.aleaSpellArt={validPath,resolveUrl,artFor,editorHtml,hydrateEditor,previewFocus,resetFocus,saveFocus,upload,remove,hydrateCombat,positionImage,positionCutout};
})();
