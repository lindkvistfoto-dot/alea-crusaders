/* Arcane Gallery – private images, Frodo revisions, Galadriel signal refresh. */
import {sizeArcaneFrame,resetArcaneFrame} from './arcane-gallery-aspect.js?v=0.35.239&morph=1';
import {arcaneMorphMarkup} from './arcane-morph-markup.js';
import {createGoosePlayerShutter} from './goose-player-shutter.js';
const gooseAssets=Object.freeze({
 left:'./features/material/goose04/left.webp',
 right:'./features/material/goose04/right.webp',
 seal:'./features/material/goose04/seal.webp'
});
const cols='id,campaign_id,title,description,category,asset_kind,storage_bucket,storage_path,thumbnail_path,mime_type,created_at';
const encode=encodeURIComponent;
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function arcaneGalleryImageIds(events){
 return [...new Set((Array.isArray(events)?events:[]).map(x=>x?.material_id).filter(x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x)))].reverse();
}
export function arcaneGalleryChooseSelection(rows,selected,live,previousLive){
 const ids=new Set(rows.map(row=>row.id));
 if(live&&live!==previousLive&&ids.has(live))return live;
 if(selected&&ids.has(selected))return selected;
 if(live&&ids.has(live))return live;
 return rows.at(-1)?.id||'';
}
export function createArcaneGallery({legolas,request,getCampaign,isLoggedIn,isGM,doc=()=>document,win=()=>window}){
 const root=doc().createElement('section');
 root.id='arcaneGallery';root.className='arcane-gallery arcane-gallery-kit hidden';
 root.innerHTML='<header class="arcane-gallery-heading"><strong>ARCANE GALLERY</strong><span id="arcaneGalleryCount"></span></header>'+
  '<div class="arcane-gallery-machine"><div id="arcaneGalleryPicture" class="arcane-gallery-picture" tabindex="0" role="button" aria-label="Öppna bild i stor vy">'+
  '<img id="arcaneGalleryImage" class="hidden" alt=""><span id="arcaneGalleryEmpty">Väntar på bilder från spelledaren…</span></div>'+
  '<div class="arcane-gallery-belt"><div id="arcaneGalleryStrip" class="arcane-gallery-strip" aria-label="Bläddra bland bilder"></div></div>'+
  '<img class="arcane-gallery-overlay" src="./features/material/arcane-gallery-overlay.webp?v=0.35.239" alt="" aria-hidden="true">'+
  arcaneMorphMarkup()+'</div>'+
  '<nav class="arcane-gallery-controls" aria-label="Navigera mellan delade bilder">'+
  '<button type="button" id="arcaneGalleryPrev" class="arcane-gallery-prev" aria-label="Föregående bild">‹</button>'+
  '<p id="arcaneGalleryStatus" class="arcane-gallery-status" role="status" aria-live="polite"></p>'+
  '<button type="button" id="arcaneGalleryNext" class="arcane-gallery-next" aria-label="Nästa bild">›</button></nav>';
 const $=id=>doc().getElementById(id), state={campaign:'',revision:-1,live:'',displayedLive:'',rows:[],selected:'',seq:0,media:0,original:'',thumbs:new Map(),loadingThumbs:new Set(),thumbGeneration:0,observer:null};
 const scope=()=>String(getCampaign()||'');
 const allowed=()=>isLoggedIn()&&!isGM()&&/^[a-f0-9-]{36}$/i.test(scope());
 let shutter=null,shutterMounted=false,shutterOpening=null,mounted=false;
 // The public artwork does not read private media or implement authorization.
 // The caller exclusively controls player-only mount and secure disposal.
 function disposeShutter(){
  shutter?.destroy();shutter=null;shutterMounted=false;shutterOpening=null;
 }
 function homeRatio(){
  return sizeArcaneFrame(root,{naturalWidth:4,naturalHeight:3},win().innerHeight);
 }
 function ensureShutter(){
  if(!mounted||!allowed())return null;
  if(!shutter){
   const host=root.querySelector('#arcaneGalleryPicture');
   if(!host)return null;
   shutter=createGoosePlayerShutter({host,assets:gooseAssets,doc,win,isPlayer:allowed});
  }
  if(!shutterMounted)shutterMounted=shutter.mount();
  if(!shutterMounted)return null;
  // GOOSE's metalwork has true 2:3 half plates. Never stretch them into
  // another ratio during the ceremony: the picture aperture starts at 4:3.
  if(shutter.phase==='closed')homeRatio();
  return shutter;
 }
 async function revealLoaded(img,seq,c,id){
  if(seq!==state.media||c!==scope()||state.selected!==id||!allowed())return;
  // The image is decoded and authorized before it enters the visible stage.
  img.classList.remove('hidden');
  const gate=shutterMounted?shutter:null;
  if(gate&&gate.phase!=='open'){
   if(!shutterOpening){
    const pending=gate.open();
    shutterOpening=pending;
    void pending.finally(()=>{if(shutterOpening===pending)shutterOpening=null;});
   }
   if(!await shutterOpening)return;
  }
  if(seq!==state.media||c!==scope()||state.selected!==id||!allowed())return;
  // Only after the inaugural 4:3 opening may the telescopic frame morph.
  sizeArcaneFrame(root,img,win().innerHeight);
  $('arcaneGalleryEmpty')?.classList.add('hidden');
 }
 function releaseMain(){
  state.media++;
  if(state.original)win().URL.revokeObjectURL(state.original);
  state.original='';
  const img=$('arcaneGalleryImage');
  if(img){img.onload=null;img.onerror=null;img.removeAttribute('src');img.classList.add('hidden');}
 }
 function release(){releaseMain();state.thumbGeneration++;state.loadingThumbs.clear();
  for(const u of state.thumbs.values())win().URL.revokeObjectURL(u);state.thumbs.clear();state.observer?.disconnect();state.observer=null;}
 function clear(){state.seq++;disposeShutter();release();state.campaign='';state.revision=-1;state.live='';state.displayedLive='';state.rows=[];state.selected='';resetArcaneFrame(root);root.classList.add('hidden');
  const strip=$('arcaneGalleryStrip');if(strip){strip.replaceChildren();strip.dataset.ids='';}}
 const valid=(n,c)=>n===state.seq&&scope()===c&&allowed();
 async function thumb(row,c){
  if(!allowed()||scope()!==c||!state.rows.some(r=>r.id===row.id)||state.loadingThumbs.has(row.id))return;
  state.loadingThumbs.add(row.id);
  const generation=state.thumbGeneration;
  try{
   let url=state.thumbs.get(row.id);
   if(!url){
    const blob=await legolas.readMedia(row,true);
    if(generation!==state.thumbGeneration||!allowed()||scope()!==c||!state.rows.some(r=>r.id===row.id))return;
    url=win().URL.createObjectURL(blob);state.thumbs.set(row.id,url);
   }
   const button=$('arcaneGalleryStrip')?.querySelector('[data-gallery-id="'+row.id+'"]');
   if(!button)return;
   const img=doc().createElement('img');img.src=url;img.alt='';img.loading='lazy';button.replaceChildren(img);
  }catch(_){/* Private Storage remains authoritative; leave a numbered placeholder. */}
  finally{state.loadingThumbs.delete(row.id);}
 }
 function render(){
  root.classList.toggle('hidden',!allowed());if(!allowed())return;
  const strip=$('arcaneGalleryStrip'),rows=state.rows,ids=rows.map(r=>r.id).join('|');
  const visible=new Set(rows.map(r=>r.id));
  for(const [id,url] of state.thumbs){if(!visible.has(id)){
   win().URL.revokeObjectURL(url);state.thumbs.delete(id);
  }}
  $('arcaneGalleryCount').textContent=rows.length+' '+(rows.length===1?'delad bild':'delade bilder');
  $('arcaneGalleryEmpty').classList.toggle('hidden',!!state.selected);
  if(!strip)return;
  if(strip.dataset.ids!==ids){
   strip.dataset.ids=ids;state.observer?.disconnect();
   strip.innerHTML=rows.map((r,i)=>'<button type="button" class="arcane-gallery-tile" data-gallery-id="'+safe(r.id)+'" title="'+safe(r.title)+'" aria-label="Visa '+safe(r.title)+'"><span>'+(i+1)+'</span></button>').join('');
   const lazy=t=>{const r=rows.find(x=>x.id===t.dataset.galleryId);if(r)void thumb(r,state.campaign);};
   if(typeof win().IntersectionObserver==='function'){
    state.observer=new (win().IntersectionObserver)(entries=>{for(const e of entries)if(e.isIntersecting){state.observer?.unobserve(e.target);lazy(e.target);}},
     {root:strip,rootMargin:'140px'});
    strip.querySelectorAll('[data-gallery-id]').forEach(t=>state.observer.observe(t));
   }else strip.querySelectorAll('[data-gallery-id]').forEach((t,i)=>{if(i<20)lazy(t);});
  }
  strip.querySelectorAll('[data-gallery-id]').forEach(t=>{
   const active=t.dataset.galleryId===state.selected;t.classList.toggle('is-active',active);t.setAttribute('aria-pressed',String(active));
  });
  const activeTile=strip.querySelector('[data-gallery-id="'+state.selected+'"]');
  if(activeTile&&strip.scrollTo&&Number.isFinite(activeTile.offsetLeft)){
   const left=Math.max(0,activeTile.offsetLeft-(strip.clientWidth-activeTile.clientWidth)/2);
   strip.scrollTo({left,behavior:'instant'}); // Horizontal only: never jump the page.
  }
  const row=rows.find(x=>x.id===state.selected),index=row?rows.indexOf(row):-1;
  const prev=$('arcaneGalleryPrev'),next=$('arcaneGalleryNext');
  if(prev)prev.disabled=index<1;
  if(next)next.disabled=index<0||index===rows.length-1;
  $('arcaneGalleryStatus').textContent=row?
   row.title+' · '+(index+1)+' / '+rows.length+(row.id===state.live?' · Aktuell':' · Tidigare'):
   'Inga bilder har delats ännu.';
 }
 async function select(id){
  if(!allowed())return;const row=state.rows.find(r=>r.id===id&&r.campaign_id===scope());if(!row)return;
  state.selected=id;render();const img=$('arcaneGalleryImage'),c=state.campaign;
  releaseMain();const n=state.media;
  ensureShutter();
  $('arcaneGalleryEmpty').textContent='Framkallar bilden…';
  $('arcaneGalleryEmpty').classList.remove('hidden');
  try{const blob=await legolas.readMedia(row,false);
   if(n!==state.media||c!==scope()||state.selected!==id||!allowed())return;
   state.original=win().URL.createObjectURL(blob);
   img.onload=()=>{void revealLoaded(img,n,c,id);};
   img.onerror=()=>{
    if(n!==state.media||c!==scope()||state.selected!==id||!allowed())return;
    // A broken image does not trigger the ceremonial opening.
    releaseMain();
    $('arcaneGalleryEmpty').textContent='Bilden kunde inte avkodas.';
    $('arcaneGalleryEmpty').classList.remove('hidden');
    $('arcaneGalleryStatus').textContent='Bilden kan inte visas.';
   };
   img.src=state.original;img.alt=row.title;
   if(img.complete&&img.naturalWidth)img.onload();
  }catch(_){if(n===state.media&&allowed()&&c===scope()){
   $('arcaneGalleryEmpty').textContent='Bilden kunde inte läsas.';
   $('arcaneGalleryEmpty').classList.remove('hidden');
   $('arcaneGalleryStatus').textContent='Bilden kan inte läsas.';
  }}
 }
 async function refresh(){
  if(!allowed())return;const c=scope(),n=++state.seq;
  try{
   const hist=[];let offset=0;
   while(true){
    const chunk=await request('campaign_material_presentation_history?campaign_id=eq.'+encode(c)+'&select=revision,material_id&order=revision.desc&limit=100&offset='+offset);
    if(!valid(n,c))return;if(!Array.isArray(chunk))throw Error('Historiken är inte tillgänglig');
    hist.push(...chunk);if(chunk.length<100)break;offset+=100;
   }
   const ids=arcaneGalleryImageIds(hist),materials=[];
   for(let i=0;i<ids.length;i+=40){
    const found=await request('campaign_materials?campaign_id=eq.'+encode(c)+'&id=in.('+ids.slice(i,i+40).map(encode).join(',')+')&archived_at=is.null&select='+cols);
    if(!valid(n,c))return;if(Array.isArray(found))materials.push(...found);
   }
   if(!valid(n,c))return;
   const lookup=new Map(materials.filter(x=>x.campaign_id===c&&x.asset_kind==='image').map(x=>[x.id,x]));
   state.rows=ids.map(id=>lookup.get(id)).filter(Boolean);
   const next=arcaneGalleryChooseSelection(state.rows,state.selected,state.live,state.displayedLive);
   state.displayedLive=state.live;
   if(!next){
    state.selected='';releaseMain();
    shutter?.reset();shutterOpening=null;
    if(shutterMounted)homeRatio();
    $('arcaneGalleryEmpty').textContent='Väntar på bilder från spelledaren…';
    render();return;
   }
   if(next!==state.selected||!$('arcaneGalleryImage').src)void select(next);
   else render();
  }catch(e){if(valid(n,c))$('arcaneGalleryStatus').textContent='Kunde inte läsa bildhistoriken: '+e.message;}
 }
 function sync(row,revision){
  if(!allowed()){if(state.campaign)clear();return;}
  const c=scope();if(state.campaign!==c){clear();state.campaign=c;}
  const live=row?.campaign_id===c&&row.asset_kind==='image'?row.id:'';
  if(state.revision!==revision||state.live!==live){state.revision=revision;state.live=live;void refresh();}
 }
 function openFull(){const row=state.rows.find(r=>r.id===state.selected);if(!row||!allowed())return;
  if(typeof legolas.previewSequence==='function')legolas.previewSequence(state.rows,row.id);
  else legolas.previewMaterial(row);
 }
 function step(delta){
  if(!allowed())return false;
  const index=state.rows.findIndex(row=>row.id===state.selected);
  const next=state.rows[index+delta];
  if(!next)return false;
  void select(next.id);return true;
 }
 function mount(){
  mounted=true;
  win().addEventListener?.('resize',()=>{
   const img=$('arcaneGalleryImage');
   if(!allowed())return;
   if(shutterMounted&&shutter?.phase!=='open')homeRatio();
   else if(state.original&&img?.naturalWidth)sizeArcaneFrame(root,img,win().innerHeight);
  });
  root.querySelector('#arcaneGalleryPicture').addEventListener('click',openFull);
  root.querySelector('#arcaneGalleryPicture').addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){e.preventDefault();openFull();}
   else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    if(step(e.key==='ArrowLeft'?-1:1))e.preventDefault();
   }
  });
  root.querySelector('#arcaneGalleryPrev').addEventListener('click',()=>step(-1));
  root.querySelector('#arcaneGalleryNext').addEventListener('click',()=>step(1));
  // Horizontal touch gestures switch pictures without blocking vertical page scroll.
  const picture=root.querySelector('#arcaneGalleryPicture');let startTouch=null;
  picture.addEventListener('touchstart',e=>{
   if(e.touches.length===1)startTouch={x:e.touches[0].clientX,y:e.touches[0].clientY};
   else startTouch=null;
  },{passive:true});
  picture.addEventListener('touchend',e=>{
   if(!startTouch||e.changedTouches.length!==1)return;
   const dx=e.changedTouches[0].clientX-startTouch.x,dy=e.changedTouches[0].clientY-startTouch.y;
   startTouch=null;
   if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);
  },{passive:true});
  picture.addEventListener('touchcancel',()=>startTouch=null,{passive:true});
  const strip=root.querySelector('#arcaneGalleryStrip');let drag=null,moved=false;
  strip.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){drag={x:e.clientX,left:strip.scrollLeft};moved=false;}});
  strip.addEventListener('pointermove',e=>{if(drag){const d=e.clientX-drag.x;if(Math.abs(d)>5){strip.scrollLeft=drag.left-d;moved=true;}}});
  ['pointerup','pointercancel','pointerleave'].forEach(e=>strip.addEventListener(e,()=>drag=null));
  strip.addEventListener('click',e=>{if(moved){moved=false;return;}const b=e.target.closest('[data-gallery-id]');if(b)void select(b.dataset.galleryId);});
  strip.addEventListener('keydown',e=>{
   if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
   if(!step(e.key==='ArrowRight'?1:-1))return;
   e.preventDefault();
   strip.querySelector('[data-gallery-id="'+state.selected+'"]')?.focus?.({preventScroll:true});
  });
  return root;
 }
 return {mount,sync,refresh,clear,step,state,root};
}
