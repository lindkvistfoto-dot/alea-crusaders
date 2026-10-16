/* Arcane Gallery: GM staging in the same brass frame as the player viewer.
 * This component NEVER writes presentations. Only Frodo's explicit RPC does.
 * All media are read through Legolas' authenticated, campaign-scoped Storage.
 */
const buckets=new Set(['campaign-materials','campaign-actor-images','campaign-location-assets','campaign-maps','combat-scene-maps','combat-icons']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function arcaneGmPreviewRows(staged,live,campaign){
 if(!uuid.test(String(campaign||'')))return [];
 const valid=r=>r&&uuid.test(String(r.id||''))&&r.campaign_id===campaign&&
  r.asset_kind==='image'&&!r.archived_at&&buckets.has(r.storage_bucket)&&
  typeof r.storage_path==='string'&&r.storage_path.startsWith(campaign+'/')&&
  !r.storage_path.includes('..')&&!r.storage_path.includes('//');
 const list=[],seen=new Set();
 // An existing live picture remains inspectable even when the queue is cleared.
 for(const row of [live,...(Array.isArray(staged)?staged:[])]){
  if(valid(row)&&!seen.has(row.id)){seen.add(row.id);list.push(row);}
 }
 return list;
}

export function createArcaneGmPreview({
 legolas,getCampaign,isLoggedIn,isGM,onPick=()=>{},onClose=()=>{},
 doc=()=>document,win=()=>window
}){
 const root=doc().createElement('section');
 root.id='arcaneGmGallery';root.className='arcane-gallery arcane-gm-gallery hidden';
 root.setAttribute('aria-label','Arcane Gallery – privat förhandsvisning för spelledaren');
 root.innerHTML='<header class="arcane-gallery-heading"><strong>ARCANE GALLERY</strong><span id="arcaneGmCount"></span></header>'+
  '<div class="arcane-gallery-machine">'+
  '<div id="arcaneGmPicture" class="arcane-gallery-picture" tabindex="0" role="button" aria-label="Förhandsvisa vald bild i helskärm">'+
  '<img id="arcaneGmImage" class="hidden" alt=""><span id="arcaneGmEmpty">Välj en bild i arkivet nedan…</span></div>'+
  '<div class="arcane-gallery-belt"><div id="arcaneGmStrip" class="arcane-gallery-strip" aria-label="Privata bilder i spelarvisningskön"></div></div>'+
  '<img class="arcane-gallery-overlay" src="./features/material/arcane-gallery-overlay.webp?v=0.35.238" alt="" aria-hidden="true"></div>'+
  '<nav class="arcane-gallery-controls" aria-label="Navigera mellan förberedda bilder">'+
  '<button type="button" id="arcaneGmPrev" aria-label="Föregående förberedd bild">‹</button>'+
  '<p id="arcaneGmStatus" class="arcane-gallery-status" role="status" aria-live="polite">Inget material är valt</p>'+
  '<button type="button" id="arcaneGmNext" aria-label="Nästa förberedd bild">›</button></nav>'+
  '<button type="button" id="arcaneGmClose" class="arcane-gm-close" aria-label="Stäng bildvisningen" title="Stäng bildvisningen">×</button>';
 const $=id=>root.querySelector('#'+id);
 const state={scope:'',rows:[],queue:new Set(),selected:'',live:'',
  signature:'',mainUrl:'',loadingId:'',mainSeq:0,thumbSeq:0,
  thumbs:new Map(),loadingThumbs:new Set(),observer:null};
 const authorized=()=>Boolean(isLoggedIn()&&isGM()&&uuid.test(String(getCampaign()||'')));
 function releaseMain(){
  state.mainSeq++;
  if(state.mainUrl)win().URL.revokeObjectURL(state.mainUrl);
  state.mainUrl='';state.loadingId='';
  const img=$('arcaneGmImage');if(img){img.classList.add('hidden');img.removeAttribute('src');}
 }
 function releaseThumbs(){
  state.thumbSeq++;state.observer?.disconnect();state.observer=null;
  for(const url of state.thumbs.values())win().URL.revokeObjectURL(url);
  state.thumbs.clear();state.loadingThumbs.clear();
 }
 function clear(){
  releaseMain();releaseThumbs();state.scope='';state.rows=[];state.selected='';
  state.live='';state.signature='';state.queue.clear();root.classList.add('hidden');
  const strip=$('arcaneGmStrip');if(strip){strip.replaceChildren();strip.dataset.signature='';}
 }
 function current(id){return state.rows.find(r=>r.id===id);}
 async function thumbnail(row,scope,sequence){
  if(state.thumbs.has(row.id)||state.loadingThumbs.has(row.id)||!authorized())return;
  state.loadingThumbs.add(row.id);
  try{
   const blob=await legolas.readMedia(row,true);
   if(sequence!==state.thumbSeq||state.scope!==scope||!authorized()||!current(row.id))return;
   const url=win().URL.createObjectURL(blob);state.thumbs.set(row.id,url);
   const button=$('arcaneGmStrip')?.querySelector('[data-gm-id="'+row.id+'"]');
   if(button){const img=doc().createElement('img');img.src=url;img.alt='';img.loading='lazy';button.replaceChildren(img);}
  }catch(_){/* A denied private thumbnail stays an empty mechanical slot. */}
  finally{state.loadingThumbs.delete(row.id);}
 }
 function renderStrip(){
  const strip=$('arcaneGmStrip');if(!strip)return;
  if(strip.dataset.signature!==state.signature){
   strip.dataset.signature=state.signature;
   releaseThumbs();
   strip.innerHTML=state.rows.map((r,i)=>'<button class="arcane-gallery-tile" type="button" data-gm-id="'+esc(r.id)+
    '" title="'+esc(r.title)+'" aria-label="Förhandsvisa '+esc(r.title)+'"><span>'+(i+1)+'</span></button>').join('')+
    Array.from({length:Math.max(0,5-state.rows.length)},()=>'<span class="arcane-gallery-tile arcane-gm-vacant" aria-hidden="true"></span>').join('');
   const scope=state.scope,seq=state.thumbSeq;
   const lazy=tile=>{const row=current(tile.dataset.gmId);if(row)void thumbnail(row,scope,seq);};
   if(typeof win().IntersectionObserver==='function'){
    state.observer=new win().IntersectionObserver(entries=>{
     for(const e of entries)if(e.isIntersecting){state.observer?.unobserve(e.target);lazy(e.target);}
    },{root:strip,rootMargin:'90px'});
    strip.querySelectorAll('[data-gm-id]').forEach(tile=>state.observer.observe(tile));
   }else strip.querySelectorAll('[data-gm-id]').forEach((tile,i)=>{if(i<15)lazy(tile);});
  }
  for(const tile of strip.querySelectorAll('[data-gm-id]')){
   const active=tile.dataset.gmId===state.selected;
   tile.classList.toggle('is-active',active);
   tile.setAttribute('aria-pressed',String(active));
  }
 }
 function render(){
  root.classList.toggle('hidden',!authorized());
  if(!authorized())return;
  $('arcaneGmCount').textContent=state.queue.size+' '+(state.queue.size===1?'bild':'bilder')+' förberedda';
  const row=current(state.selected),index=state.rows.findIndex(r=>r.id===state.selected);
  $('arcaneGmPrev').disabled=index<1;
  $('arcaneGmNext').disabled=index<0||index>=state.rows.length-1;
  $('arcaneGmStatus').textContent=!row?'Välj en bild i arkivet nedan':
   row.id===state.live?'● LIVE · Visas för spelarna':
   (row.title||'Bild')+' · Endast förhandsvisning';
  $('arcaneGmEmpty').classList.toggle('hidden',Boolean(state.mainUrl));
  renderStrip();
  const strip=$('arcaneGmStrip');
  const tile=strip?.querySelector('[data-gm-id="'+state.selected+'"]');
  if(tile&&strip.scrollTo&&Number.isFinite(tile.offsetLeft)){
   strip.scrollTo({left:Math.max(0,tile.offsetLeft-(strip.clientWidth-tile.clientWidth)/2),behavior:'instant'});
  }
 }
 async function select(id,interactive=false){
  const row=current(id);
  if(!authorized()||!row)return;
  state.selected=id;
  releaseMain();state.loadingId=id;
  $('arcaneGmEmpty').textContent='Framkallar bilden…';
  render();
  if(interactive&&state.queue.has(id))onPick(id);
  const seq=state.mainSeq,scope=state.scope;
  try{
   const blob=await legolas.readMedia(row,false);
   if(seq!==state.mainSeq||scope!==state.scope||!authorized()||state.selected!==id)return;
   state.mainUrl=win().URL.createObjectURL(blob);state.loadingId='';
   const img=$('arcaneGmImage');img.src=state.mainUrl;img.alt=row.title||'Förhandsvisning';img.classList.remove('hidden');
   $('arcaneGmEmpty').classList.add('hidden');
  }catch(_){
   if(seq===state.mainSeq&&scope===state.scope&&authorized()){
    state.loadingId='';
    $('arcaneGmEmpty').textContent='Bilden kunde inte läsas.';
    $('arcaneGmEmpty').classList.remove('hidden');
   }
  }
 }
 function sync(staged,stagedId,liveRow){
  if(!authorized()){if(state.scope)clear();return;}
  const scope=String(getCampaign()),rows=arcaneGmPreviewRows(staged,liveRow,scope);
  if(state.scope&&state.scope!==scope)clear();
  state.scope=scope;
  state.queue=new Set((Array.isArray(staged)?staged:[]).filter(r=>rows.some(x=>x.id===r?.id)).map(r=>r.id));
  const signature=scope+'|'+rows.map(r=>r.id+':'+(r.thumbnail_path||r.storage_path)).join('|');
  const changed=signature!==state.signature;
  state.rows=rows;state.signature=signature;state.live=liveRow?.campaign_id===scope?liveRow?.id||'':'';
  let selected=rows.find(r=>r.id===stagedId)?.id||'';
  if(!selected&&state.selected&&rows.some(r=>r.id===state.selected))selected=state.selected;
  if(!selected)selected=rows.find(r=>state.queue.has(r.id))?.id||rows[0]?.id||'';
  if(!selected){state.selected='';releaseMain();$('arcaneGmEmpty').textContent='Välj en bild i arkivet nedan…';render();return;}
  if(selected!==state.selected||changed||(!state.mainUrl&&state.loadingId!==selected))void select(selected);
  else render();
 }
 function step(delta){
  if(!authorized())return;
  const index=state.rows.findIndex(r=>r.id===state.selected);
  const row=state.rows[index+delta];
  if(row)void select(row.id,true);
 }
 function openFull(){
  if(!authorized()||!current(state.selected))return;
  if(typeof legolas.previewSequence==='function')legolas.previewSequence(state.rows,state.selected);
  else legolas.previewMaterial(current(state.selected));
 }
 function mount(){
  $('arcaneGmClose').addEventListener('click',onClose);
  $('arcaneGmPicture').addEventListener('click',openFull);
  $('arcaneGmPicture').addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();openFull();}
   else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}
  });
  $('arcaneGmPrev').addEventListener('click',()=>step(-1));
  $('arcaneGmNext').addEventListener('click',()=>step(1));
  $('arcaneGmStrip').addEventListener('click',e=>{
   const tile=e.target.closest('[data-gm-id]');
   if(tile)void select(tile.dataset.gmId,true);
  });
  let origin=null;
  $('arcaneGmPicture').addEventListener('touchstart',e=>{
   origin=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;
  },{passive:true});
  $('arcaneGmPicture').addEventListener('touchend',e=>{
   if(!origin||e.changedTouches.length!==1)return;
   const dx=e.changedTouches[0].clientX-origin.x,dy=e.changedTouches[0].clientY-origin.y;origin=null;
   if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);
  },{passive:true});
  $('arcaneGmPicture').addEventListener('touchcancel',()=>origin=null,{passive:true});
  return root;
 }
 return {root,state,mount,sync,clear,step};
}
